#!/usr/bin/env bash
# scripts/migration/lib/common.sh — 020-data-migration-cutover 공통 헬퍼
#
# extract.sh · load.sh · run.sh 가 source 하여 사용한다(단독 실행 대상 아님).
# 접속·경로·로깅 공통 로직을 한 곳에 모아 3개 스크립트 간 델타 처리·설정 로드 방식이 어긋나지
# 않도록 한다(ADR-009 sslmode=require, ADR-010 감사 로깅 마스킹).

MIGRATION_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DELTA_CLASSES_CONF="${MIGRATION_ROOT}/delta-classes.conf"
STAGING_DDL_SQL="${MIGRATION_ROOT}/sql/00_staging_ddl.sql"
TRANSFORM_SQL="${MIGRATION_ROOT}/sql/10_transform.sql"
VERIFY_SQL="${MIGRATION_ROOT}/sql/20_verify.sql"

# config.example.env 를 복사해 실값을 채운 파일(커밋 금지 — .gitignore 대상).
# MIGRATION_CONFIG 환경변수로 다른 경로 지정 가능(예: 서비스별로 다른 config 파일 사용).
load_migration_config() {
  local config_file="${MIGRATION_CONFIG:-${MIGRATION_ROOT}/config.env}"
  if [[ ! -f "$config_file" ]]; then
    echo "[migration] 설정 파일 없음: ${config_file} — scripts/migration/config.example.env 를 복사해 실값을 채우십시오." >&2
    return 1
  fi
  # shellcheck disable=SC1090
  source "$config_file"
  : "${PGSSLMODE:?PGSSLMODE 미설정 — ADR-009(sslmode=require 이상) 필수}"
  export PGSSLMODE
}

# 구조적 로그 한 줄 기록(파일 + stderr). PII·자격증명 원문 금지(ADR-009) — DSN 은 반드시
# mask_dsn 을 거친 후에만 로그에 남긴다.
log_line() {
  local level="$1"; shift
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [[ -n "${MIGRATION_LOG_FILE:-}" ]]; then
    printf '%s [%s] %s\n' "$ts" "$level" "$*" | tee -a "$MIGRATION_LOG_FILE" >&2
  else
    printf '%s [%s] %s\n' "$ts" "$level" "$*" >&2
  fi
}

# postgresql://user:pass@host:port/db → postgresql://***@host:port/db
mask_dsn() {
  sed -E 's#(postgresql://)[^@[:space:]]*@#\1***@#g'
}

# 소문자 변환(bash 3.2 호환 — `${var,,}` 는 bash 4+ 전용이라 사용하지 않는다. macOS 기본 /bin/bash
# 가 3.2 이므로 이식성을 위해 tr 사용).
lowercase() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# sslmode 검증(ADR-009/FR-015/NFR-004/SC-017) — extract.sh·load.sh 공통.
assert_sslmode_require() {
  local mode
  mode="$(lowercase "${PGSSLMODE:-}")"
  case "$mode" in
    require|verify-ca|verify-full) return 0 ;;
    *)
      echo "[migration] PGSSLMODE=${PGSSLMODE:-<미설정>} — sslmode=require 이상이어야 함(ADR-009/NFR-004/SC-017)" >&2
      return 1
      ;;
  esac
}

# delta-classes.conf 한 줄 파싱(주석·빈 줄 제외) → 파이프 구분 필드를 stdout 으로 그대로 전달.
# 필드: schema_table|stg_table|mapping_class|behavior|watermark_col|legacy_service
iterate_delta_classes() {
  local filter_service="${1:-}"
  local line schema_table stg_table mapping_class behavior watermark_col legacy_service
  while IFS='|' read -r schema_table stg_table mapping_class behavior watermark_col legacy_service; do
    [[ -z "$schema_table" || "$schema_table" == \#* ]] && continue
    if [[ -n "$filter_service" && "$filter_service" != "all" && "$legacy_service" != "$filter_service" ]]; then
      continue
    fi
    printf '%s|%s|%s|%s|%s|%s\n' "$schema_table" "$stg_table" "$mapping_class" "$behavior" "$watermark_col" "$legacy_service"
  done < "$DELTA_CLASSES_CONF"
}

# 00_staging_ddl.sql 에서 특정 stg_* 테이블의 컬럼명 목록을 순서대로 추출(_loaded_at 제외).
# extract 쿼리 스캐폴드 생성에 사용 — 컬럼 shape 의 단일 소스는 항상 00_staging_ddl.sql(A-layer).
extract_stg_columns() {
  local stg_table="$1"
  awk -v tbl="migration_staging.${stg_table} (" '
    index($0, "CREATE TABLE IF NOT EXISTS " tbl) { capture=1; next }
    capture && /^\);/ { capture=0 }
    capture {
      line=$0
      sub(/^[ \t]+/, "", line)
      sub(/,[ \t]*(--.*)?$/, "", line)
      if (line == "" || line ~ /^--/) next
      split(line, parts, /[ \t]+/)
      col=parts[1]
      gsub(/"/, "", col)
      if (col == "_loaded_at") next
      print col
    }
  ' "$STAGING_DDL_SQL"
}

# psql 실행 래퍼 — sslmode 강제(ADR-009), 자격증명 포함 명령행을 로그에 남기지 않는다.
run_psql() {
  local dsn="$1"; shift
  psql "$dsn" -v ON_ERROR_STOP=1 "$@"
}
