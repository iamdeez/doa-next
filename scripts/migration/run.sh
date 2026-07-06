#!/usr/bin/env bash
# scripts/migration/run.sh — 컷오버 오케스트레이션 (T005/T007, plan.md S2 시퀀스)
#
# Fly.io one-off machine 에서 실행하는 전제(ADR-002, 타깃 Postgres 동일 리전 co-located).
# 운영 앱 이미지(apps/backend/Dockerfile, node:20-alpine)는 scripts/migration/ 을 포함하지 않고
# bash/psql/pg_dump 도 없어 그대로 실행할 수 없다(GAP-020-05) — 반드시 전용 러너 이미지
# (scripts/migration/Dockerfile, GAP-020-05 대안 B)로 빌드한 이미지 안에서 실행한다:
#   docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration
#   fly machine run <registry>/doa-migration-runner --app <target-app> \
#     --command "/migration/run.sh cutover --config-dir=/config"
#   또는 fly ssh console -a <target-app> 로 실행 중인 러너 머신에 진입해 직접 실행.
# 상세 빌드·배포·실행 절차는 RUNBOOK.md §1(러너 이미지 준비) 참조.
#
# 서브커맨드:
#   precopy [--config-dir=DIR]   — 단계 0. 윈도우 개시 전 벌크 사전 복사(FR-002).
#   outbox-check                 — 단계 0b. 레거시 payment_outbox pending=0 드레인 확인(ADR-008).
#   cutover [--config-dir=DIR]   — 단계 1~7. 쓰기차단 -> 델타 -> 변환 -> 검증 -> GO/NO-GO -> 전환/롤백.
#   rollback                     — 단계 6 단독 실행(운영자가 cutover 시퀀스 밖에서 긴급 롤백할 때).
#
# --config-dir=DIR: 레거시가 서비스별 개별 RDS(FR-001)이므로, DIR 안의 *.env 파일 각각(서비스별
# LEGACY_DSN/LEGACY_SERVICE 설정)을 순회하며 precopy/delta 를 수행한다. 미지정 시 단일
# config.env(MIGRATION_CONFIG) 하나만 사용한다(단일 레거시 접속 리허설 등).
#
# 감사 로깅(T007, ADR-010): 각 단계 시작·종료 시각과 결과를 구조적 로그 파일(MIGRATION_LOG_FILE)과
# migration_staging.verification_runs(phase='cutover') 양쪽에 기록한다. detail 필드는 PII·자격증명
# 원문을 담지 않는다(경과시간·상태만).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

SUBCOMMAND="${1:-}"; shift || true
CONFIG_DIR=""
for arg in "$@"; do
  case "$arg" in
    --config-dir=*) CONFIG_DIR="${arg#*=}" ;;
  esac
done

usage() {
  cat >&2 <<'EOF'
사용법: run.sh <precopy|outbox-check|cutover|rollback> [--config-dir=DIR]
EOF
}

if [[ -z "$SUBCOMMAND" ]]; then
  usage
  exit 1
fi

load_migration_config
OUT_DIR="${MIGRATION_OUT_DIR:-./migration-run}"
mkdir -p "$OUT_DIR"
: "${TARGET_DSN:?config.env 에 TARGET_DSN 미설정}"

T0_FILE="${OUT_DIR}/.cutover_t0"
PRECOPY_DONE_FILE="${OUT_DIR}/.precopy_completed_at"

iso_now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# --config-dir 의 *.env 각각을 source 하여 (LEGACY_DSN, LEGACY_SERVICE) 쌍을 얻는다.
# 미지정 시 이미 로드된 config.env 의 단일 값 하나만 사용.
for_each_legacy_service() {
  local callback="$1"
  if [[ -n "$CONFIG_DIR" ]]; then
    local f
    for f in "${CONFIG_DIR}"/*.env; do
      [[ -f "$f" ]] || continue
      # shellcheck disable=SC1090
      ( source "$f"; "$callback" "$LEGACY_DSN" "$LEGACY_SERVICE" )
    done
  else
    : "${LEGACY_DSN:?config.env 에 LEGACY_DSN 미설정(또는 --config-dir 지정)}"
    "$callback" "$LEGACY_DSN" "${LEGACY_SERVICE:-all}"
  fi
}

# 단계 실행 + 감사 기록(T007). 실패해도 스크립트 전체를 죽이지 않도록 반환값으로 판단(set -e 우회 — if).
stage_run() {
  local step="$1"; shift
  local func="$1"; shift
  local run_id started
  started="$(date +%s)"
  run_id="$(run_psql "$TARGET_DSN" -t -A -c \
    "INSERT INTO migration_staging.verification_runs (phase, step, status) VALUES ('cutover', '${step}', 'running') RETURNING id;")"
  log_line INFO "단계 시작: ${step} (verification_runs.id=${run_id})"

  local status="pass"
  if ! "$func" "$@"; then
    status="fail"
  fi

  local elapsed=$(( $(date +%s) - started ))
  run_psql "$TARGET_DSN" -c \
    "UPDATE migration_staging.verification_runs SET status='${status}', finished_at=now(), detail=jsonb_build_object('elapsed_sec', ${elapsed}) WHERE id='${run_id}';" \
    >/dev/null
  log_line INFO "단계 종료: ${step} status=${status} elapsed=${elapsed}s"
  [[ "$status" == "pass" ]]
}

# ============================================================
# 단계 0 — precopy (FR-002, 윈도우 개시 전)
# ============================================================
do_precopy() {
  local extract_out="${OUT_DIR}/precopy"
  mkdir -p "$extract_out"
  local overall=0
  _one_service() {
    local dsn="$1" svc="$2"
    log_line INFO "precopy: service=${svc}"
    LEGACY_DSN="$dsn" "${SCRIPT_DIR}/extract.sh" --mode=precopy --service="$svc" --out-dir="$extract_out" || return 1
    "${SCRIPT_DIR}/load.sh" --mode=precopy --service="$svc" --in-dir="$extract_out" || return 1
  }
  for_each_legacy_service _one_service || overall=1
  iso_now > "$PRECOPY_DONE_FILE"
  return "$overall"
}

# ============================================================
# 단계 0b — outbox pending=0 드레인 확인 (ADR-008)
# ============================================================
do_outbox_check() {
  if [[ -n "${LEGACY_OUTBOX_PENDING_QUERY:-}" && "${LEGACY_OUTBOX_PENDING_QUERY}" != \[TO-VERIFY* ]]; then
    local pending
    pending="$(run_psql "$LEGACY_DSN" -t -A -c "$LEGACY_OUTBOX_PENDING_QUERY")"
    log_line INFO "outbox pending 실측=${pending}"
    [[ "$pending" == "0" ]]
  else
    echo "레거시 payment_outbox pending=0 드레인을 확인했습니까(ADR-008)? [yes 입력]: " >&2
    read -r ans
    [[ "$ans" == "yes" ]]
  fi
}

# ============================================================
# 단계 1 — 레거시 쓰기 차단 (ADR-003)
# ============================================================
do_write_block() {
  iso_now > "$T0_FILE"
  if [[ -n "${LEGACY_WRITE_BLOCK_CMD:-}" ]]; then
    log_line INFO "레거시 쓰기 차단 자동화 명령 실행"
    eval "$LEGACY_WRITE_BLOCK_CMD"
  else
    echo "레거시 쓰기 차단(DB read-only + 앱 점검모드 503)을 완료했습니까? [yes 입력]: " >&2
    read -r ans
    [[ "$ans" == "yes" ]]
  fi
}

# ============================================================
# 단계 2 — 최종 델타(추출+로드+변환)
# ============================================================
do_delta() {
  local since
  since="$(cat "$PRECOPY_DONE_FILE" 2>/dev/null || cat "$T0_FILE")"
  local extract_out="${OUT_DIR}/delta"
  mkdir -p "$extract_out"
  local overall=0
  _one_service() {
    local dsn="$1" svc="$2"
    log_line INFO "delta: service=${svc} since=${since}"
    LEGACY_DSN="$dsn" "${SCRIPT_DIR}/extract.sh" --mode=delta --service="$svc" --since="$since" --out-dir="$extract_out" || return 1
    "${SCRIPT_DIR}/load.sh" --mode=delta --service="$svc" --in-dir="$extract_out" || return 1
  }
  for_each_legacy_service _one_service || overall=1
  [[ "$overall" -eq 0 ]] || return 1
  log_line INFO "변환 SQL 실행(10_transform.sql, 위상순서 ADR-005)"
  run_psql "$TARGET_DSN" -f "$TRANSFORM_SQL"
}

# ============================================================
# 단계 3 — 정합성 검증 4종
# ============================================================
do_verify() {
  run_psql "$TARGET_DSN" -f "$VERIFY_SQL"
}

# ============================================================
# 단계 4 — GO/NO-GO 판단 (FR-006/007, 검증 4종 AND)
# ============================================================
GO_DECISION=""
do_go_nogo() {
  local counts fail_total
  counts="$(run_psql "$TARGET_DSN" -t -A -F'|' -c "
    SELECT
      (SELECT count(*) FROM migration_staging.verification_runs WHERE phase='verify' AND step='count' AND status='fail' AND started_at > now() - interval '2 hours'),
      (SELECT count(*) FROM migration_staging.verification_runs WHERE phase='verify' AND step='sum' AND status='fail' AND (detail->>'required')::boolean IS TRUE AND started_at > now() - interval '2 hours'),
      (SELECT count(*) FROM migration_staging.verification_runs WHERE phase='verify' AND step='checksum' AND status='fail' AND started_at > now() - interval '2 hours'),
      (SELECT count(*) FROM migration_staging.verification_runs WHERE phase='verify' AND step='antijoin' AND status='fail' AND (detail->>'core')::boolean IS TRUE AND started_at > now() - interval '2 hours');
  ")"
  IFS='|' read -r count_fail sum_fail checksum_fail antijoin_fail <<< "$counts"
  fail_total=$(( count_fail + sum_fail + checksum_fail + antijoin_fail ))
  log_line INFO "GO/NO-GO 집계 count_fail=${count_fail} sum_fail=${sum_fail} checksum_fail=${checksum_fail} antijoin_fail=${antijoin_fail}"

  local t0_epoch now_epoch elapsed_min
  t0_epoch="$(date -u -d "$(cat "$T0_FILE")" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$(cat "$T0_FILE")" +%s)"
  now_epoch="$(date +%s)"
  elapsed_min=$(( (now_epoch - t0_epoch) / 60 ))
  if [[ "$elapsed_min" -gt 50 ]]; then
    log_line WARN "NFR-005 안전마진(50분) 초과 — 경과 ${elapsed_min}분(SC-021 리스크, 즉시 GO/NO-GO 판단 진행)"
  fi

  if [[ "$fail_total" -eq 0 ]]; then
    GO_DECISION="GO"
  else
    GO_DECISION="NOGO"
  fi
  log_line INFO "GO/NO-GO 판정: ${GO_DECISION}"
  [[ "$GO_DECISION" == "GO" ]]
}

# ============================================================
# 단계 5 — 트래픽 전환 + smoke (GO 시)
# ============================================================
do_traffic_cutover() {
  echo "DNS/LB 를 신규 시스템으로 전환했습니까? [yes 입력]: " >&2
  read -r ans
  [[ "$ans" == "yes" ]] || return 1
  if [[ -n "${TARGET_HEALTH_URL:-}" ]]; then
    log_line INFO "smoke: GET ${TARGET_HEALTH_URL}"
    curl -fsS -o /dev/null "$TARGET_HEALTH_URL"
  fi
}

# ============================================================
# 단계 6 — 롤백 (NO-GO 시)
# ============================================================
do_rollback() {
  if [[ -n "${LEGACY_WRITE_UNBLOCK_CMD:-}" ]]; then
    log_line INFO "레거시 쓰기 차단 해제 자동화 명령 실행"
    eval "$LEGACY_WRITE_UNBLOCK_CMD"
  else
    echo "레거시 쓰기 차단을 해제하고 레거시 서비스를 재개하십시오. 완료 시 [yes 입력]: " >&2
    read -r ans
    [[ "$ans" == "yes" ]]
  fi
}

# ============================================================
# 단계 7 — 윈도우 종료 (NFR-001, ≤60분)
# ============================================================
do_window_close() {
  local t0_epoch now_epoch elapsed_min
  t0_epoch="$(date -u -d "$(cat "$T0_FILE")" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$(cat "$T0_FILE")" +%s)"
  now_epoch="$(date +%s)"
  elapsed_min=$(( (now_epoch - t0_epoch) / 60 ))
  log_line INFO "윈도우 종료 — 쓰기차단~현재 경과 ${elapsed_min}분(NFR-001 기준 60분)"
  if [[ "$elapsed_min" -gt 60 ]]; then
    log_line WARN "NFR-001(60분) 초과 — SC-020 리허설/실행 로그로 재검토 필요"
  fi
  return 0
}

case "$SUBCOMMAND" in
  precopy)
    stage_run "precopy" do_precopy
    ;;
  outbox-check)
    stage_run "outbox-check" do_outbox_check
    ;;
  cutover)
    stage_run "write-block" do_write_block \
      && stage_run "delta" do_delta \
      && stage_run "verify" do_verify \
      && stage_run "go-nogo" do_go_nogo
    if [[ "$GO_DECISION" == "GO" ]]; then
      stage_run "traffic-cutover" do_traffic_cutover
      stage_run "window-close" do_window_close
    else
      log_line WARN "NO-GO — 트래픽 전환 미진행, 롤백 절차로 이동(FR-007)"
      stage_run "rollback" do_rollback
      exit 1
    fi
    ;;
  rollback)
    stage_run "rollback" do_rollback
    ;;
  *)
    usage
    exit 1
    ;;
esac
