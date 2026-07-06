-- Migration: 20260701153200_add_social_accounts (DOWN / Rollback)
-- Spec: v1.1.0/014-social-login
--
-- 실행 전 필수 확인 (password NOT NULL 복원):
--   SELECT COUNT(*) FROM "users"."users" WHERE password IS NULL;
--   → 결과 0건이어야 안전. 1건 이상이면 data-model.md §롤백 전략 참조.

-- ============================================================
-- 1. social_accounts 테이블 삭제
-- ============================================================

-- CASCADE: FK 제약·유니크 제약·인덱스 포함 자동 삭제.
-- 모든 소셜 연동 이력이 삭제된다.
DROP TABLE IF EXISTS "users"."social_accounts";

-- ============================================================
-- 2. User.password NOT NULL 복원
-- ============================================================

-- 실행 전 소셜 전용 사용자(password IS NULL) 0건 확인 필수.
-- 소셜 전용 사용자 존재 시 이 구문이 실패한다.
ALTER TABLE "users"."users"
    ALTER COLUMN "password" SET NOT NULL;
