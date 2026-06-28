/** 조건부 className 결합 유틸 (falsy 제거 후 공백 join). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
