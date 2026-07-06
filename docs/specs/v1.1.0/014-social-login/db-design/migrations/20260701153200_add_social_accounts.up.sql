-- Migration: 20260701153200_add_social_accounts (UP)
-- Spec: v1.1.0/014-social-login
-- 변경 내용:
--   1. users.social_accounts 신규 테이블 (ADR-004, FR-009)
--   2. users.users.password NOT NULL 해제 (ADR-005, FR-007)

-- ============================================================
-- 1. social_accounts 신규 테이블 생성
-- ============================================================

CREATE TABLE "users"."social_accounts" (
    "id"         TEXT          NOT NULL,
    "userId"     TEXT          NOT NULL,
    "provider"   TEXT          NOT NULL,
    "providerId" TEXT          NOT NULL,
    "email"      TEXT          NOT NULL,
    "name"       TEXT,
    "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- 복합 유니크: 동일 소셜 계정 중복 연동 차단 + 동시성 P2002 방어 (ADR-004, FR-004)
-- findByProviderAndProviderId 쿼리 인덱스로도 사용
ALTER TABLE "users"."social_accounts"
    ADD CONSTRAINT "social_accounts_provider_providerId_key"
    UNIQUE ("provider", "providerId");

-- userId 인덱스: 사용자별 연동 소셜 계정 목록 조회 (FR-009)
CREATE INDEX "social_accounts_userId_idx"
    ON "users"."social_accounts" ("userId");

-- FK: userId → users.id (동일 스키마 — Prisma FK 선언 가능, P-001 위배 아님)
-- onDelete Cascade: 사용자 삭제(탈퇴) 시 연동 소셜 계정 자동 삭제
-- onUpdate Cascade: users.id PK 변경 시(cuid 불변이므로 실질적으로 미발생) 연동 유지
ALTER TABLE "users"."social_accounts"
    ADD CONSTRAINT "social_accounts_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "users"."users" ("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ============================================================
-- 2. User.password nullable 전환
-- ============================================================

-- Additive 변경: 기존 password 보유 사용자 행에 영향 없음.
-- 신규 소셜 전용 사용자만 password=NULL 허용 (ADR-005, FR-007).
ALTER TABLE "users"."users"
    ALTER COLUMN "password" DROP NOT NULL;
