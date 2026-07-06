/**
 * 정적 코드 검증 — SC-006 (v1.1.0/021 spec) [env:static]
 *
 * 대상 SC: SC-006 (FR-003 관련)
 * 검증 방법: Node.js fs + inicis-payment-gateway.ts 텍스트 파싱(실행/네트워크 호출 없음)
 *
 * 검증 내용:
 *   IniisisPaymentGateway.charge()/refund() 가 KG이니시스 요청 페이로드에
 *   idempotencyKey(멱등성 키)를 포함하는지 소스 텍스트 수준으로 확인한다.
 *   실제 서명·엔드포인트 등 세부 필드명은 [TO-VERIFY](research.md §4-3)이므로
 *   본 테스트는 "idempotencyKey 식별자가 charge/refund 메서드 본문 내에서
 *   페이로드 구성에 사용되는지"만 텍스트로 확인한다.
 *
 * 실행: 앱 기동·네트워크 호출 불필요. 파일 텍스트 검증만.
 */

import * as fs from 'fs';
import * as path from 'path';

const GATEWAY_PATH = path.resolve(
  __dirname,
  '../../src/modules/payment/inicis-payment-gateway.ts',
);

/**
 * 소스 텍스트에서 `charge(`/`refund(` 메서드 시작 위치부터 그 다음 메서드(또는 파일 끝)
 * 직전까지의 텍스트 구간을 추출한다. TS 제네릭 반환타입(`Promise<{...}>`)에 포함된 중괄호
 * 때문에 단순 중괄호 매칭이 불안정할 수 있어, "다음 멤버 시작 지점"을 경계로 사용하는
 * 방식을 채택한다(과도한 파서 구현 대신 실용적 텍스트 구간 추출).
 */
function extractMemberSection(source: string, memberName: string, nextMemberNames: string[]): string {
  const startRegex = new RegExp(`\\b${memberName}\\s*\\(`);
  const startMatch = startRegex.exec(source);
  if (!startMatch) return '';

  const searchFrom = startMatch.index + startMatch[0].length;
  let endIdx = source.length;
  for (const next of nextMemberNames) {
    const nextRegex = new RegExp(`\\b${next}\\s*\\(`);
    nextRegex.lastIndex = 0;
    const rest = source.slice(searchFrom);
    const nextMatch = nextRegex.exec(rest);
    if (nextMatch) {
      const idx = searchFrom + nextMatch.index;
      if (idx < endIdx) endIdx = idx;
    }
  }

  return source.slice(startMatch.index, endIdx);
}

describe('SC-006 (021): charge/refund 페이로드에 멱등성 키(idempotencyKey) 포함 (정적 검증)', () => {
  it('when_inspect_gateway_source_then_source_file_exists', () => {
    // TDD Red: IniisisPaymentGateway 미구현 상태에서는 명시적으로 FAIL한다(조용한 skip 금지).
    expect(fs.existsSync(GATEWAY_PATH)).toBe(true);
  });

  it('when_inspect_charge_method_then_payload_includes_idempotencyKey', () => {
    const source = fs.readFileSync(GATEWAY_PATH, 'utf-8');
    const chargeSection = extractMemberSection(source, 'charge', ['refund', 'buildSignature']);

    expect(chargeSection.length).toBeGreaterThan(0);
    expect(chargeSection).toMatch(/idempotencyKey/);
  });

  it('when_inspect_refund_method_then_payload_includes_idempotencyKey', () => {
    const source = fs.readFileSync(GATEWAY_PATH, 'utf-8');
    const refundSection = extractMemberSection(source, 'refund', ['buildSignature']);

    expect(refundSection.length).toBeGreaterThan(0);
    expect(refundSection).toMatch(/idempotencyKey/);
  });
});
