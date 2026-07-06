/** 관리자 사용자 목록 페이지네이션 기본·최대 페이지 크기 (007-admin). */
export const DEFAULT_USER_PAGE_LIMIT = 20 as const;
export const MAX_USER_PAGE_LIMIT = 100 as const;

/** 관리자 판매자 목록 페이지네이션 기본·최대 페이지 크기 (017 — user 상수 관례 승계). */
export const DEFAULT_SELLER_PAGE_LIMIT = 20 as const;
export const MAX_SELLER_PAGE_LIMIT = 100 as const;

/** 감사 로그 조회 기본·최대 개수 (013 GAP-007-01). */
export const DEFAULT_AUDIT_LOG_LIMIT = 50 as const;
export const MAX_AUDIT_LOG_LIMIT = 200 as const;

/** 감사 로그 action·targetType 상수 (013). */
export const AUDIT_ACTION = {
  SELLER_APPROVE: 'SELLER_APPROVE',
} as const;

export const AUDIT_TARGET = {
  SELLER: 'SELLER',
} as const;
