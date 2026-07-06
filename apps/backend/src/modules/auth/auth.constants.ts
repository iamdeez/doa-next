/** OTP 유효 기간 (분). plan.md ADR-005. */
export const OTP_TTL_MIN = 10;

/** OTP 재발송 허용 최소 간격 (초). 60초 이내 재요청 차단. */
export const OTP_RESEND_WINDOW_SEC = 60;

/** OTP 자리수. 6자리 숫자 문자열. */
export const OTP_LENGTH = 6;

/** OTP 최대 허용 시도 횟수. 초과 시 OTP를 소비 처리하여 브루트포스 차단 (SEC-001). */
export const OTP_MAX_ATTEMPTS = 5;

/** 네이버 code-exchange CSRF state 값 유효 기간 (분). */
export const NAVER_STATE_TTL_MIN = 10;
