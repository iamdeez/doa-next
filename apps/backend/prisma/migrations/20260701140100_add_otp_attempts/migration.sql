-- AlterTable: OTP 브루트포스 차단용 시도 횟수 컬럼 추가 (SEC-001 수정)
ALTER TABLE "users"."password_reset_otps" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
