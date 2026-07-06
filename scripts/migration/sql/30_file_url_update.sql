-- scripts/migration/sql/30_file_url_update.sql — 022-legacy-file-binary-migration
-- files.files.url 갱신(FR-004) + 검증용 쿼리 3종. DDL 변경 없음(url·key·status 컬럼 기존재).
--
-- 실행 전제: rclone copy(precopy/delta)로 레거시→R2 오브젝트 복사가 완료된 후 실행한다
-- (files-migrate.sh url-update 서브커맨드가 -v base="$R2_PUBLIC_BASE_URL" 로 :base 를 주입).
-- key 컬럼은 갱신하지 않는다(리키잉 범위 외 — spec.md "범위 외" 절).
--
-- 대상 필터: WHERE status = 'UPLOADED' 가 (a)·(d) 양쪽의 단일 필터 지점이다(PENDING 제외, FR-001).
-- 멱등성: url = base||'/'||key 는 key 당 결정적 값이므로 재실행해도 동일 결과(부작용 없음).

-- ============================================================
-- (a) url 갱신 (FR-004) — 멱등. :base 는 -v base="$R2_PUBLIC_BASE_URL" 로 주입되는 psql 변수.
-- ============================================================

UPDATE files.files
SET url = :'base' || '/' || key
WHERE status = 'UPLOADED';

-- ============================================================
-- (b) 개수 대조 — R2 실측 개수(rclone size --json, files-migrate.sh verify)와 대조(SC-005/013)
-- ============================================================

SELECT count(*) AS uploaded_count
FROM files.files
WHERE status = 'UPLOADED';

-- ============================================================
-- (c) url 형식 검증 (SC-004) — 샘플 행의 url = base||'/'||key 이고 key 불변인지 확인.
-- 갱신 후 불일치 행이 있으면 (a) 갱신 실패 또는 base 값 오류를 의미한다(0건이어야 GO).
-- ============================================================

SELECT count(*) AS url_mismatch_count
FROM files.files
WHERE status = 'UPLOADED'
  AND url IS DISTINCT FROM (:'base' || '/' || key);

-- ============================================================
-- (d) key 목록 추출 (ADR-004) — rclone --files-from 전달용 복사 대상 SoT. PENDING 제외(FR-001).
-- ============================================================

SELECT key
FROM files.files
WHERE status = 'UPLOADED'
ORDER BY key;
