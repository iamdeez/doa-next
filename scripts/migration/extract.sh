#!/usr/bin/env bash
# scripts/migration/extract.sh — 레거시 RDS 추출 (T002/T004, FR-001·002·004·NFR-004)
#
# 레거시 각 서비스 RDS 에서 `\copy (SELECT ...) TO` 로 테이블별 CSV 추출만 수행한다(레거시에 write
# 하지 않음 — 인터페이스 계약, plan.md "레거시 소스 계약"). 레거시 실 DDL 은 파이프라인에서 접근
# 불가([TO-VERIFY])하므로, 테이블별 추출 쿼리는 queries/extract/<stg_table>.sql 파일로 파라미터화
# 한다 — 파일이 없으면 sql/00_staging_ddl.sql 의 컬럼 shape 로 스캐폴드(.template)를 생성하고 그
# 테이블은 이번 실행에서 건너뛴다(사용자가 레거시 실제 컬럼으로 검토·확정한 뒤 .sql 로 저장해야
# 추출이 실행된다 — 미검증 매핑으로 추출을 강행하지 않는 안전장치).
#
# 델타(--mode=delta) 시 부류별 필터(delta-classes.conf 의 behavior):
#   WATERMARK : "<watermark_col>" > '<since>' (사전복사 이후 신규/갱신분만)
#   FULL      : TRUE (윈도우 내 full re-copy — load.sh 가 truncate 후 재적재)
# cuid 는 시간 비단조라 id 워터마크를 쓰지 않는다(research.md ADR-004 실측 근거).
#
# 접속 보안(ADR-009/FR-015/NFR-004/SC-017): 레거시 접속은 sslmode=require 이상의 TLS 를 강제한다.
# config.env(config.example.env 참조)의 PGSSLMODE=require 로 모든 psql 접속에 일괄 적용되며,
# load_migration_config() 가 미설정 시 즉시 실패시킨다(아래 검증).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

MODE=""
SERVICE="all"
SINGLE_TABLE=""
SINCE=""
OUT_DIR=""

usage() {
  cat >&2 <<'EOF'
사용법: extract.sh --mode=precopy|delta --service=<legacy-service-name>|all
                    [--since=<ISO8601, delta 모드 WATERMARK 부류 필수>]
                    [--table=<schema.table>] [--out-dir=<dir>]

예:
  extract.sh --mode=precopy --service=all --out-dir=./migration-run/precopy
  extract.sh --mode=delta --service=order-service --since=2026-07-05T00:00:00Z
EOF
}

for arg in "$@"; do
  case "$arg" in
    --mode=*) MODE="${arg#*=}" ;;
    --service=*) SERVICE="${arg#*=}" ;;
    --table=*) SINGLE_TABLE="${arg#*=}" ;;
    --since=*) SINCE="${arg#*=}" ;;
    --out-dir=*) OUT_DIR="${arg#*=}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[extract] 알 수 없는 인자: ${arg}" >&2; usage; exit 1 ;;
  esac
done

if [[ "$MODE" != "precopy" && "$MODE" != "delta" ]]; then
  echo "[extract] --mode 는 precopy 또는 delta 여야 함" >&2
  usage
  exit 1
fi
if [[ "$MODE" == "delta" ]]; then
  : "${SINCE:?--since 필요(delta 모드 — WATERMARK 부류 테이블의 증분 기준 시각)}"
fi

load_migration_config
assert_sslmode_require || exit 1
OUT_DIR="${OUT_DIR:-${MIGRATION_OUT_DIR:-./migration-run}/extract}"
mkdir -p "$OUT_DIR" "${SCRIPT_DIR}/queries/extract"

: "${LEGACY_DSN:?config.env 에 LEGACY_DSN 미설정}"
log_line INFO "extract 시작 mode=${MODE} service=${SERVICE} legacy_dsn=$(printf '%s' "$LEGACY_DSN" | mask_dsn) out_dir=${OUT_DIR}"

pending_count=0
ok_count=0
fail_count=0

while IFS='|' read -r schema_table stg_table mapping_class behavior watermark_col legacy_service; do
  if [[ -n "$SINGLE_TABLE" && "$schema_table" != "$SINGLE_TABLE" ]]; then
    continue
  fi

  query_file="${SCRIPT_DIR}/queries/extract/${stg_table}.sql"
  template_file="${query_file}.template"

  if [[ ! -f "$query_file" ]]; then
    if [[ ! -f "$template_file" ]]; then
      cols=()
      while IFS= read -r col; do cols+=("$col"); done < <(extract_stg_columns "$stg_table")
      {
        printf -- '-- 자동 생성 스캐폴드(extract.sh) — %s (%s)\n' "$schema_table" "$stg_table"
        printf -- '-- 검토 필요: FROM 절·각 컬럼의 레거시 원본 표현을 실제 레거시 DDL 에 맞게 수정한 뒤\n'
        printf -- '-- 파일명에서 .template 확장자를 제거하고(queries/extract/%s.sql) 재실행하십시오.\n' "$stg_table"
        printf -- '-- __DELTA_FILTER__ 는 extract.sh 가 --mode 에 따라 치환한다(직접 편집 불필요, 필터 조건을\n'
        printf -- '-- 추가로 걸고 싶으면 AND 로 이어서 작성).\n'
        printf 'SELECT\n'
        n=${#cols[@]}
        for i in "${!cols[@]}"; do
          sep=","
          [[ $i -eq $((n - 1)) ]] && sep=""
          printf '  %s AS "%s"%s\n' "${cols[$i]}" "${cols[$i]}" "$sep"
        done
        printf 'FROM [TO-VERIFY: 레거시 %s 대응 테이블]\n' "$schema_table"
        printf 'WHERE __DELTA_FILTER__\n'
      } > "$template_file"
      log_line WARN "쿼리 파일 없음 — 스캐폴드 생성: ${template_file} (검토 후 .sql 로 저장 필요, 이번 실행은 건너뜀)"
    else
      log_line WARN "쿼리 스캐폴드 검토 대기 중 — ${template_file} (.sql 로 확정되지 않아 건너뜀)"
    fi
    pending_count=$((pending_count + 1))
    continue
  fi

  case "$behavior" in
    WATERMARK)
      if [[ "$MODE" == "delta" ]]; then
        delta_filter="\"${watermark_col}\" > '${SINCE}'"
      else
        delta_filter="TRUE"
      fi
      ;;
    FULL|AUX)
      delta_filter="TRUE"
      ;;
    *)
      log_line ERROR "알 수 없는 behavior=${behavior} (${schema_table})"
      fail_count=$((fail_count + 1))
      continue
      ;;
  esac

  final_query="$(sed "s/__DELTA_FILTER__/${delta_filter}/" "$query_file")"
  out_csv="${OUT_DIR}/${stg_table}.csv"

  log_line INFO "추출 시작 table=${schema_table} stg=${stg_table} class=${mapping_class} behavior=${behavior} -> ${out_csv}"
  if run_psql "$LEGACY_DSN" -c "\\copy (${final_query}) TO '${out_csv}' WITH (FORMAT csv, HEADER true)"; then
    log_line INFO "추출 완료 table=${schema_table} rows_file=${out_csv}"
    ok_count=$((ok_count + 1))
  else
    log_line ERROR "추출 실패 table=${schema_table}"
    fail_count=$((fail_count + 1))
  fi
done < <(iterate_delta_classes "$SERVICE")

log_line INFO "extract 종료 ok=${ok_count} pending=${pending_count} fail=${fail_count}"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
if [[ "$pending_count" -gt 0 ]]; then
  echo "[extract] ${pending_count}개 테이블이 쿼리 검토 대기 상태(queries/extract/*.sql.template) — 확정 후 재실행하십시오." >&2
  exit 2
fi
exit 0
