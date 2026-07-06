/**
 * 이메일 주소를 마스킹한다.
 * local 파트 최대 2자 노출, 나머지 ** 로 치환.
 * 예: ab@example.com → ab**@example.com, a@example.com → a**@example.com
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const keep = local.slice(0, Math.min(2, local.length));
  return `${keep}**@${domain}`;
}

/**
 * 전화번호를 마스킹한다(NFR-009).
 * 뒤 4자리만 노출, 나머지 * 로 치환. 길이<4 는 전체 마스킹.
 * 예: 01012345678 → *******5678
 */
export function maskPhone(phone: string): string {
  if (phone.length < 4) {
    return '*'.repeat(phone.length);
  }
  const last4 = phone.slice(-4);
  return '*'.repeat(phone.length - 4) + last4;
}
