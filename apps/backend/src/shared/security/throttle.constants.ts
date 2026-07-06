/**
 * rate limit 임계값 상수 — NFR-001~006 단일 소스.
 * 컨트롤러/모듈에 매직넘버를 산개시키지 않고 이 상수만 참조한다.
 */

/** 공통 윈도우 60초(ms 단위 — @nestjs/throttler v6 ttl 은 밀리초). */
export const THROTTLE_TTL_MS = 60_000;

/** 전역 기본 rate limit(NFR-001): IP 당 20회/60초. */
export const THROTTLE_DEFAULT_LIMIT = 20;

/** POST /auth/social-login 개별 임계값(NFR-002): IP 당 10회/60초. */
export const THROTTLE_SOCIAL_LOGIN_LIMIT = 10;

/** POST /auth/naver/state 개별 임계값(NFR-003): IP 당 20회/60초. */
export const THROTTLE_NAVER_STATE_LIMIT = 20;

/** POST /auth/forgot-password 개별 임계값(NFR-004): IP 당 5회/60초. */
export const THROTTLE_FORGOT_PASSWORD_LIMIT = 5;

/** POST /auth/find-email 개별 임계값(NFR-005): IP 당 5회/60초. */
export const THROTTLE_FIND_EMAIL_LIMIT = 5;

/** POST /auth/reset-password 개별 임계값(NFR-006): IP 당 10회/60초. */
export const THROTTLE_RESET_PASSWORD_LIMIT = 10;
