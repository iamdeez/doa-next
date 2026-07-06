/**
 * 정적 코드 검증 — SC-015 (v1.1.0/021 spec) [env:static]
 *
 * 대상 SC: SC-015 (NFR-003 관련)
 * 검증 방법: Node.js fs + inicis-payment-gateway.ts 텍스트 파싱(실행 없음)
 *
 * 검증 내용:
 *   신규 결제/환불 코드(IniisisPaymentGateway)가 금전(amount) 을 다룰 때
 *   float/number 리터럴 변환(parseFloat·Number(...)) 을 사용하지 않고,
 *   Prisma.Decimal 타입 값을 그대로 직렬화(.toString())하는지 확인한다.
 *   (schema-decimal.spec.ts 는 schema.prisma 필드 선언을 검증 — 본 파일은
 *   021 신규 게이트웨이 코드의 amount 취급 방식을 검증하는 별도 정적 테스트.)
 *
 * 실행: 앱 기동·DB 연결 불필요. 파일 텍스트 검증만.
 */

import * as fs from 'fs';
import * as path from 'path';

const GATEWAY_PATH = path.resolve(
  __dirname,
  '../../src/modules/payment/inicis-payment-gateway.ts',
);

describe('SC-015 (021): 신규 결제/환불 코드 Decimal 전용 — float 리터럴 변환 금지 (정적 검증)', () => {
  it('when_inspect_gateway_source_then_source_file_exists', () => {
    expect(fs.existsSync(GATEWAY_PATH)).toBe(true);
  });

  it('when_inspect_gateway_source_then_amount_typed_as_Prisma_Decimal', () => {
    const source = fs.readFileSync(GATEWAY_PATH, 'utf-8');
    expect(source).toMatch(/import\s*\{[^}]*Prisma[^}]*\}\s*from\s*['"]@prisma\/client['"]/);
    expect(source).toMatch(/amount\s*:\s*Prisma\.Decimal/);
  });

  it('when_inspect_gateway_source_then_no_parseFloat_or_Number_conversion_on_amount', () => {
    const source = fs.readFileSync(GATEWAY_PATH, 'utf-8');

    // float 변환 함수 자체가 파일 어디에도 없어야 한다(금전 필드가 float 로 취급되지 않음).
    expect(source).not.toMatch(/parseFloat\s*\(/);
    // amount 를 number 로 강제 변환하는 패턴 금지 (Number(amount) 형태)
    expect(source).not.toMatch(/Number\s*\(\s*amount\b/);
  });

  it('when_inspect_gateway_source_then_amount_serialized_via_toString_not_arithmetic_literal', () => {
    const source = fs.readFileSync(GATEWAY_PATH, 'utf-8');

    // Decimal → 문자열 직렬화는 .toString() 사용(부동소수점 연산 없이 그대로 전달)
    expect(source).toMatch(/amount\.toString\(\)/);
    // 금전 값에 대한 부동소수점 리터럴 산술(예: amount * 1.0, amount + 0.01)이 없어야 함
    expect(source).not.toMatch(/amount\s*[*/+-]\s*\d+\.\d+/);
  });
});
