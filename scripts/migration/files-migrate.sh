#!/usr/bin/env bash
# scripts/migration/files-migrate.sh — 022-legacy-file-binary-migration 파일 바이너리 이관 러너
#
# 020 run.sh(DB 이관 전용, phase='cutover')와 별도 파일로 분리한다 — 파일 바이너리 이관은
# 재구조화가 없는 identity 복사(레거시 key == R2 key)라 단일 책임상 별도 스크립트가 적합하다
# (research.md "기술 선택 조사"). lib/common.sh(run_psql·log_line·mask_dsn·load_migration_config)
# 만 재사용하고, 020 의 run.sh·extract.sh·load.sh·sql/{00,10,20}_*.sql 은 수정하지 않는다.
#
# 020 전용 러너 이미지(scripts/migration/Dockerfile, rclone 확장 — T-B03)에서 실행하는 전제.
# 빌드:
#   docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration
#
# 서브커맨드(canonical, tasks.md/test 정적 검증과 동일 참조):
#   precheck    — 레거시 버킷 실측(개수·총바이트) + files.files UPLOADED 카운트 리포트(FR-009).
#   precopy     — 020 컷오버 윈도우 개시 전 벌크 사전 복사(FR-002, 시간상한 없음 — NFR-002).
#   delta       — 윈도우 내 최종 델타. precopy 와 동일 명령 재실행, rclone checksum skip 으로
#                 이미 복사된 객체는 건너뛰고 신규 UPLOADED 만 전송(FR-003, ADR-003).
#   verify      — 개수 대조 + 샘플 체크섬(멀티파트 ETag 는 콘텐츠 바이트 대조 fallback, ASM-003).
#   url-update  — 복사 완료 후 files.files.url 갱신(FR-004, sql/30_file_url_update.sql).
#
# 복사 대상 SoT(ADR-004): files.files WHERE status='UPLOADED' 의 key 목록. PENDING 은 제외(FR-001).
# rclone remote 는 RCLONE_CONFIG_<REMOTE>_* 환경변수로 정의한다(rclone.conf 파일 불요) — 자격증명이
# 프로세스 인자(ps 노출)에 나타나지 않도록 하기 위함(NFR-004/ADR-009).
#
# 실패 처리(FR-006): rclone copy 는 기본적으로 개별 객체 실패로 전체를 중단하지 않는다. 1차 복사 후
# `rclone lsf --files-from` 재대조로 실패(미존재) key 를 산출해 1회 재시도하고, 그래도 남은 잔존
# 실패는 `<label>-remaining-failures.md` 에 "컷오버 개시 전 사용자 재확인 필요" 문구와 함께 기록한다
# (FR-007 — 이 문구가 최종 사전평가 리포트(FILE-PRE-ASSESSMENT.md)에 반영되어야 한다).
#
# 감사(NFR-005): stage_run 이 각 서브커맨드 실행을 migration_staging.verification_runs 에
# phase='file-migration' 로 기록한다(020 run.sh 의 stage_run 패턴 복제 — 020 은 phase='cutover'
# 하드코딩이라 재사용 불가).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

FILE_URL_UPDATE_SQL="${SCRIPT_DIR}/sql/30_file_url_update.sql"

SUBCOMMAND="${1:-}"; shift || true

usage() {
  cat >&2 <<'EOF'
사용법: files-migrate.sh <precheck|precopy|delta|verify|url-update>
EOF
}

if [[ -z "$SUBCOMMAND" ]]; then
  usage
  exit 1
fi

load_migration_config

# 레거시 S3·R2 rclone 설정 필수값 검증(config.example.env 슬롯, T-B04) — 미설정 시 즉시 중단.
assert_file_migration_config() {
  : "${LEGACY_S3_ENDPOINT:?config.env 에 LEGACY_S3_ENDPOINT 미설정}"
  : "${LEGACY_S3_BUCKET:?config.env 에 LEGACY_S3_BUCKET 미설정}"
  : "${LEGACY_S3_ACCESS_KEY_ID:?config.env 에 LEGACY_S3_ACCESS_KEY_ID 미설정}"
  : "${LEGACY_S3_SECRET_ACCESS_KEY:?config.env 에 LEGACY_S3_SECRET_ACCESS_KEY 미설정}"
  : "${R2_ACCOUNT_ID:?config.env 에 R2_ACCOUNT_ID 미설정}"
  : "${R2_BUCKET:?config.env 에 R2_BUCKET 미설정}"
  : "${R2_ACCESS_KEY_ID:?config.env 에 R2_ACCESS_KEY_ID 미설정}"
  : "${R2_SECRET_ACCESS_KEY:?config.env 에 R2_SECRET_ACCESS_KEY 미설정}"
  : "${R2_PUBLIC_BASE_URL:?config.env 에 R2_PUBLIC_BASE_URL 미설정}"
}
assert_file_migration_config

: "${TARGET_DSN:?config.env 에 TARGET_DSN 미설정}"

OUT_DIR="${MIGRATION_OUT_DIR:-./migration-run}"
mkdir -p "$OUT_DIR"
KEY_LIST_FILE="${OUT_DIR}/files-uploaded-keys.txt"

# R2 S3 호환 엔드포인트는 계정 ID 로 결정된다(Cloudflare 표준 형식) — 021 이 이미 R2_ACCOUNT_ID 로
# 도입한 설정을 재사용(R2_ENDPOINT 를 별도 변수로 중복 요구하지 않는다).
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# rclone remote 정의(env var 기반, rclone.conf 불요) — access_key_id·secret_access_key 가
# 프로세스 인자에 노출되지 않는다(NFR-004/ADR-009).
export RCLONE_CONFIG_LEGACYS3_TYPE="s3"
export RCLONE_CONFIG_LEGACYS3_PROVIDER="Other"
export RCLONE_CONFIG_LEGACYS3_ENV_AUTH="false"
export RCLONE_CONFIG_LEGACYS3_ACCESS_KEY_ID="$LEGACY_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_LEGACYS3_SECRET_ACCESS_KEY="$LEGACY_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_LEGACYS3_ENDPOINT="$LEGACY_S3_ENDPOINT"
export RCLONE_CONFIG_LEGACYS3_REGION="${LEGACY_S3_REGION:-auto}"

export RCLONE_CONFIG_R2REMOTE_TYPE="s3"
export RCLONE_CONFIG_R2REMOTE_PROVIDER="Cloudflare"
export RCLONE_CONFIG_R2REMOTE_ENV_AUTH="false"
export RCLONE_CONFIG_R2REMOTE_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2REMOTE_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2REMOTE_ENDPOINT="$R2_ENDPOINT"

legacy_remote() { printf 'legacys3:%s' "$LEGACY_S3_BUCKET"; }
r2_remote() { printf 'r2remote:%s' "$R2_BUCKET"; }

# ============================================================
# key 목록 추출 (ADR-004) — files.files WHERE status='UPLOADED' 가 복사 대상 SoT.
# ============================================================
extract_key_list() {
  local out="$1"
  run_psql "$TARGET_DSN" -t -A -c \
    "SELECT key FROM files.files WHERE status='UPLOADED' ORDER BY key;" > "$out"
}

# rclone lsf --files-from 재대조로 keylist 중 R2 에 실제 존재하지 않는(=실패) key 산출(ADR-007).
detect_failed_keys() {
  local keylist="$1" out="$2" present_file
  present_file="${out}.present"
  rclone lsf "$(r2_remote)" --files-from "$keylist" 2>/dev/null | sort > "$present_file" || true
  comm -23 <(sort "$keylist") "$present_file" > "$out"
}

count_present_in_r2() {
  local keylist="$1"
  rclone lsf "$(r2_remote)" --files-from "$keylist" 2>/dev/null | wc -l | tr -d ' '
}

# ============================================================
# 감사 기록(NFR-005/SC-015) — 020 run.sh stage_run 패턴 복제(phase='file-migration' 고정,
# 020 원본은 phase='cutover' 하드코딩이라 재사용 불가 — tasks.md T-B02 상세).
# 각 서브커맨드는 실행 전 STAGE_DETAIL_JSON 을 설정해 대상/실패 건수 등을 detail 에 남길 수 있다.
# ============================================================
STAGE_DETAIL_JSON='{}'

stage_run() {
  local step="$1"; shift
  local func="$1"; shift
  local run_id started
  started="$(date +%s)"
  STAGE_DETAIL_JSON='{}'
  run_id="$(run_psql "$TARGET_DSN" -t -A -c \
    "INSERT INTO migration_staging.verification_runs (phase, step, status) VALUES ('file-migration', '${step}', 'running') RETURNING id;")"
  log_line INFO "단계 시작: ${step} (verification_runs.id=${run_id})"

  local status="pass"
  if ! "$func" "$@"; then
    status="fail"
  fi

  local elapsed=$(( $(date +%s) - started ))
  run_psql "$TARGET_DSN" -v detail_json="$STAGE_DETAIL_JSON" -c \
    "UPDATE migration_staging.verification_runs SET status='${status}', finished_at=now(), detail=jsonb_build_object('elapsed_sec', ${elapsed}) || :'detail_json'::jsonb WHERE id='${run_id}';" \
    >/dev/null
  log_line INFO "단계 종료: ${step} status=${status} elapsed=${elapsed}s"
  [[ "$status" == "pass" ]]
}

# ============================================================
# precheck — 레거시 실측(개수·총바이트) + files.files UPLOADED 카운트 리포트(FR-009).
# ============================================================
do_precheck() {
  local uploaded_count
  uploaded_count="$(run_psql "$TARGET_DSN" -t -A -c "SELECT count(*) FROM files.files WHERE status='UPLOADED';")"
  log_line INFO "precheck: files.files UPLOADED count=${uploaded_count}"

  local legacy_size_json legacy_count legacy_bytes
  legacy_size_json="$(rclone size --json "$(legacy_remote)" 2>/dev/null || echo '{}')"
  legacy_count="$(printf '%s' "$legacy_size_json" | grep -oE '"count":[0-9]+' | head -1 | cut -d: -f2)"
  legacy_bytes="$(printf '%s' "$legacy_size_json" | grep -oE '"bytes":[0-9]+' | head -1 | cut -d: -f2)"

  local report_file="${OUT_DIR}/precheck-report.json"
  cat > "$report_file" <<EOF
{
  "files_files_uploaded_count": ${uploaded_count},
  "legacy_bucket_object_count": ${legacy_count:-null},
  "legacy_bucket_total_bytes": ${legacy_bytes:-null}
}
EOF
  STAGE_DETAIL_JSON="$(cat "$report_file")"
  log_line INFO "precheck 리포트: ${report_file} — FILE-PRE-ASSESSMENT.md 총개수·총용량·예상소요 슬롯에 반영할 것"
  return 0
}

# ============================================================
# precopy / delta 공통 복사 로직 — rclone copy(checksum skip 멱등) + 실패 재대조·재시도(FR-006).
# ============================================================
run_copy_pass() {
  local label="$1" keylist="$2"
  local total
  total="$(wc -l < "$keylist" | tr -d ' ')"
  if [[ "$total" -eq 0 ]]; then
    log_line INFO "${label}: UPLOADED 대상 0건 — 복사 0건, 정상 종료"
    STAGE_DETAIL_JSON='{"target_count":0,"failed_count":0}'
    return 0
  fi
  log_line INFO "${label}: 대상 ${total}건 복사 시작"

  local copy_log="${OUT_DIR}/rclone-${label}.log"
  rclone copy "$(legacy_remote)" "$(r2_remote)" \
    --files-from "$keylist" \
    --checksum \
    --retries "${RCLONE_RETRIES:-3}" \
    --retries-sleep "${RCLONE_RETRIES_SLEEP:-10s}" \
    --transfers "${RCLONE_TRANSFERS:-8}" \
    --log-file "$copy_log" \
    --log-level INFO || true

  local failed_file="${OUT_DIR}/${label}-failed-keys.txt"
  detect_failed_keys "$keylist" "$failed_file"
  local failed_count
  failed_count="$(wc -l < "$failed_file" | tr -d ' ')"

  if [[ "$failed_count" -gt 0 ]]; then
    log_line WARN "${label}: 1차 실패 ${failed_count}건 — 재시도(FR-006)"
    rclone copy "$(legacy_remote)" "$(r2_remote)" \
      --files-from "$failed_file" \
      --checksum \
      --retries "${RCLONE_RETRIES:-3}" \
      --retries-sleep "${RCLONE_RETRIES_SLEEP:-10s}" \
      --log-file "$copy_log" \
      --log-level INFO || true
    detect_failed_keys "$keylist" "$failed_file"
    failed_count="$(wc -l < "$failed_file" | tr -d ' ')"
  fi

  log_line INFO "${label} 완료: 대상=${total} 잔존실패=${failed_count}"
  STAGE_DETAIL_JSON="$(printf '{"target_count":%s,"failed_count":%s}' "$total" "$failed_count")"

  if [[ "$failed_count" -gt 0 ]]; then
    local remaining_report="${OUT_DIR}/${label}-remaining-failures.md"
    {
      printf '## %s 잔존 실패 목록 (재시도 후에도 미해소)\n\n' "$label"
      printf '컷오버 개시 전 사용자 재확인 필요\n\n'
      cat "$failed_file"
    } > "$remaining_report"
    log_line WARN "${label}: 잔존 실패 ${failed_count}건 — ${remaining_report} 참조. 컷오버 개시 전 사용자 재확인 필요"
  fi

  [[ "$failed_count" -eq 0 ]]
}

do_precopy() {
  extract_key_list "$KEY_LIST_FILE"
  run_copy_pass "precopy" "$KEY_LIST_FILE"
}

do_delta() {
  # 윈도우 개시 시점의 현재 UPLOADED 전건을 재조회 — precopy 이후 신규 UPLOADED 도 포함된다.
  # rclone --checksum skip 이 이미 복사된 key 는 건너뛰므로 실제 전송은 신규분만 발생(ADR-003).
  extract_key_list "$KEY_LIST_FILE"
  run_copy_pass "delta" "$KEY_LIST_FILE"
}

# ============================================================
# verify — 개수 대조 + 샘플 체크섬(멀티파트 ETag 는 콘텐츠 바이트 대조 fallback, ASM-003).
# ============================================================
do_verify() {
  extract_key_list "$KEY_LIST_FILE"
  local uploaded_count present_count mismatch
  uploaded_count="$(wc -l < "$KEY_LIST_FILE" | tr -d ' ')"
  present_count="$(count_present_in_r2 "$KEY_LIST_FILE")"
  mismatch=$(( uploaded_count - present_count ))
  log_line INFO "verify: 개수대조 uploaded=${uploaded_count} r2_present=${present_count} mismatch=${mismatch}"

  local sample_size=0
  if [[ "$uploaded_count" -gt 0 ]]; then
    sample_size=$(( uploaded_count / 100 ))
    [[ "$sample_size" -lt 100 ]] && sample_size=100
    [[ "$sample_size" -gt "$uploaded_count" ]] && sample_size="$uploaded_count"
  fi

  local fallback_rc=0
  local diff_count=0
  if [[ "$sample_size" -gt 0 ]]; then
    local sample_file="${OUT_DIR}/verify-sample-keys.txt"
    shuf -n "$sample_size" "$KEY_LIST_FILE" 2>/dev/null > "$sample_file" || head -n "$sample_size" "$KEY_LIST_FILE" > "$sample_file"

    local combined_out="${OUT_DIR}/verify-check-combined.txt"
    rclone check "$(legacy_remote)" "$(r2_remote)" --files-from "$sample_file" --checksum \
      --combined "$combined_out" --log-file "${OUT_DIR}/rclone-check.log" --log-level INFO || true

    # combined 출력의 '*'(differ)·'!'(check 실패) 표시만 불일치 후보로 취급(ASM-003 안전망).
    local diff_file="${OUT_DIR}/verify-checksum-diff-keys.txt"
    grep -E '^[*!] ' "$combined_out" 2>/dev/null | cut -c3- > "$diff_file" || true
    diff_count="$(wc -l < "$diff_file" 2>/dev/null | tr -d ' ')"

    if [[ "$diff_count" -gt 0 ]]; then
      log_line WARN "verify: checksum 불일치 후보 ${diff_count}건 — 멀티파트 ETag false-mismatch 가능성(ASM-003), --download 콘텐츠 바이트 대조 fallback 수행"
      rclone check "$(legacy_remote)" "$(r2_remote)" --files-from "$diff_file" --download \
        --log-file "${OUT_DIR}/rclone-check.log" --log-level INFO || fallback_rc=$?
    fi
  fi

  local report_file="${OUT_DIR}/verify-report.json"
  cat > "$report_file" <<EOF
{
  "uploaded_count": ${uploaded_count},
  "r2_present_count": ${present_count},
  "count_mismatch": ${mismatch},
  "checksum_sample_size": ${sample_size},
  "checksum_diff_candidate_count": ${diff_count},
  "checksum_download_fallback_rc": ${fallback_rc}
}
EOF
  STAGE_DETAIL_JSON="$(cat "$report_file")"
  log_line INFO "verify 리포트: ${report_file}"

  [[ "$mismatch" -eq 0 && "$fallback_rc" -eq 0 ]]
}

# ============================================================
# url-update — 복사 완료 후 files.files.url 갱신(FR-004, 멱등).
# ============================================================
do_url_update() {
  log_line INFO "url-update: files.files.url 갱신 시작(base=${R2_PUBLIC_BASE_URL})"
  run_psql "$TARGET_DSN" -v base="$R2_PUBLIC_BASE_URL" -f "$FILE_URL_UPDATE_SQL"
}

case "$SUBCOMMAND" in
  precheck)
    stage_run "precheck" do_precheck
    ;;
  precopy)
    stage_run "precopy" do_precopy
    ;;
  delta)
    stage_run "delta" do_delta
    ;;
  verify)
    stage_run "verify" do_verify
    ;;
  url-update)
    stage_run "url-update" do_url_update
    ;;
  *)
    usage
    exit 1
    ;;
esac
