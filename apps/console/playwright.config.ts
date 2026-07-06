import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 설정 — [env:e2e-docker]
 *
 * 실행 환경: Docker Compose (backend + console 동시 기동)
 * baseURL: http://localhost:3100 (console dev server)
 * 테스트 경로: ./e2e/
 * 실행 타임아웃: 2분 이내 (SC-020 NFR-005)
 *
 * 실행 방법 (로컬):
 *   1) DB:      docker-compose up -d postgres          # 저장소 루트
 *   2) backend: pnpm --filter backend exec prisma migrate deploy   # 스키마 적용
 *               (+ e2e 로그인 SC 는 시드 관리자/판매자 계정 필요 — 아래 주의)
 *               pnpm --filter backend start              # :3000 기동
 *   3) e2e:     pnpm --filter console e2e                # console 는 아래 webServer 가 자동 기동
 *
 * webServer 블록이 console(:3100)을 자동 기동/재사용하므로 별도 `dev &` 불필요.
 * 단, backend(:3000)+DB 는 위 1~2 로 먼저 올려야 로그인 흐름 SC(021~025)가 통과한다.
 * backend 미기동 시 미인증 리다이렉트 SC(015/016)만 통과하고 나머지는 실패한다.
 * ⚠️ SC-021~024 는 시드된 관리자(`ADMIN_USER_IDS`)·판매자 계정이 있어야 통과한다(시드 절차 별도).
 *
 * E2E SC 목록 (Option A — user local defer):
 *   SC-015: 미인증 접근 → /login 리다이렉트
 *   SC-016: 비관리자 /admin/* 접근 → /login 리다이렉트
 *   SC-021: 로그인 → 대시보드 진입
 *   SC-022: 판매자 로그인 → /seller/products 접근
 *   SC-023: 관리자 로그인 → /admin/banners 접근
 *   SC-024: 로그인 후 /admin/* 직접 접근 시 비관리자 차단
 *   SC-025: 이미지 업로드 후 상품 목록 갱신 (2분 이내)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // SC-020: 2분 이내
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false, // E2E 순서 의존성 방지
  retries: 0,
  workers: 1, // Docker 환경에서 단일 워커
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // console dev 서버(:3100)를 자동 기동한다. 이미 떠 있으면 재사용(로컬),
  // CI 에서는 항상 새로 기동. backend(:3000)+DB 는 별도 선행(위 헤더 주석 참조).
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3100',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
