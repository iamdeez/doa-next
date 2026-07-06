#!/usr/bin/env bash
# scripts/migration/load.sh — 스테이징 로드 (T003/T004, FR-001·002·NFR-004)
#
# extract.sh 추출물(CSV)을 타깃 Fly Postgres `migration_staging` 스키마에 COPY FROM 으로 적재한다
# (레거시 원형 raw 보존 — plan.md S1 ② Load). 매 실행 전 00_staging_ddl.sql(T001)을 먼저 적용해
# 스키마·테이블 존재를 보장한다(CREATE ... IF NOT EXISTS — 재실행 안전).
#
# 적재 방식(delta-classes.conf 의 behavior):
#   FULL/AUX  : TRUNCATE 후 COPY FROM(전체 재적재) — precopy 모드는 모든 부류가 여기 해당(첫 적재).
#   WATERMARK : delta 모드에서만 증분 append(TRUNCATE 없이 COPY FROM) — precopy 모드에서는
#               WATERMARK 부류도 최초 적재이므로 TRUNCATE 후 적재.
#
# 접속 보안(ADR-009/FR-015/NFR-004/SC-017): 타깃 접속은 sslmode=require 이상의 TLS 를 강제한다.
# config.env(config.example.env 참조)의 PGSSLMODE=require 로 모든 psql 접속에 일괄 적용된다(아래 검증).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

MODE=""
SERVICE="all"
SINGLE_TABLE=""
IN_DIR=""
SKIP_DDL="0"

usage() {
  cat >&2 <<'EOF'
사용법: load.sh --mode=precopy|delta --service=<legacy-service-name>|all
                 [--table=<schema.table>] [--in-dir=<dir>] [--skip-ddl]

예:
  load.sh --mode=precopy --in-dir=./migration-run/precopy
  load.sh --mode=delta --service=order-service --in-dir=./migration-run/extract
EOF
}

for arg in "$@"; do
  case "$arg" in
    --mode=*) MODE="${arg#*=}" ;;
    --service=*) SERVICE="${arg#*=}" ;;
    --table=*) SINGLE_TABLE="${arg#*=}" ;;
    --in-dir=*) IN_DIR="${arg#*=}" ;;
    --skip-ddl) SKIP_DDL="1" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[load] 알 수 없는 인자: ${arg}" >&2; usage; exit 1 ;;
  esac
done

if [[ "$MODE" != "precopy" && "$MODE" != "delta" ]]; then
  echo "[load] --mode 는 precopy 또는 delta 여야 함" >&2
  usage
  exit 1
fi

load_migration_config
assert_sslmode_require || exit 1
IN_DIR="${IN_DIR:-${MIGRATION_OUT_DIR:-./migration-run}/extract}"
: "${TARGET_DSN:?config.env 에 TARGET_DSN 미설정}"

log_line INFO "load 시작 mode=${MODE} service=${SERVICE} target_dsn=$(printf '%s' "$TARGET_DSN" | mask_dsn) in_dir=${IN_DIR}"

if [[ "$SKIP_DDL" != "1" ]]; then
  log_line INFO "스테이징 DDL 적용(00_staging_ddl.sql) — 재실행 안전(IF NOT EXISTS)"
  run_psql "$TARGET_DSN" -f "$STAGING_DDL_SQL"
fi

ok_count=0
skip_count=0
fail_count=0

while IFS='|' read -r schema_table stg_table mapping_class behavior watermark_col legacy_service; do
  if [[ -n "$SINGLE_TABLE" && "$schema_table" != "$SINGLE_TABLE" ]]; then
    continue
  fi

  csv_file="${IN_DIR}/${stg_table}.csv"
  if [[ ! -f "$csv_file" ]]; then
    log_line WARN "CSV 없음 — 건너뜀 stg=${stg_table} (${csv_file})"
    skip_count=$((skip_count + 1))
    continue
  fi

  # precopy 모드는 항상 전체 재적재(최초 적재). delta 모드는 behavior 로 분기(T003 완료 기준).
  if [[ "$MODE" == "precopy" || "$behavior" == "FULL" || "$behavior" == "AUX" ]]; then
    log_line INFO "전체 재적재(TRUNCATE) stg=${stg_table} class=${mapping_class} behavior=${behavior}"
    run_psql "$TARGET_DSN" -c "TRUNCATE TABLE migration_staging.${stg_table};"
  else
    log_line INFO "증분 append stg=${stg_table} class=${mapping_class} behavior=${behavior} (TRUNCATE 없음)"
  fi

  if run_psql "$TARGET_DSN" -c "\\copy migration_staging.${stg_table} FROM '${csv_file}' WITH (FORMAT csv, HEADER true)"; then
    log_line INFO "적재 완료 stg=${stg_table}"
    ok_count=$((ok_count + 1))
  else
    log_line ERROR "적재 실패 stg=${stg_table}"
    fail_count=$((fail_count + 1))
  fi
done < <(iterate_delta_classes "$SERVICE")

log_line INFO "load 종료 ok=${ok_count} skip=${skip_count} fail=${fail_count}"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
exit 0
