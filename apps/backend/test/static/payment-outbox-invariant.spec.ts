/**
 * 정적 코드 검증 — SC-014 (v1.1.0/021 spec) [env:unit]
 *
 * 대상 SC: SC-014 (NFR-002 관련, GAP-021-01 옵션1/ADR-008 확정 회귀 가드)
 * 검증 방법: Node.js fs + payment.service.ts 텍스트 파싱(실행/DB 연결 없음)
 *
 * 검증 내용:
 *   결제/환불 "완료(성공)" 상태 변경은 반드시 outbox 기록과 동반되어야 하며,
 *   PG 실패(`failed`) 분기는 outbox 를 기록하지 않는 기존 계약이 본 spec 으로
 *   회귀되지 않았음을 확인한다(ADR-008 — 신규 재시도 메커니즘·payment_outbox
 *   실패기록을 추가하지 않는다는 GAP-021-01 옵션1 확정 사항의 정적 가드).
 *
 *   구체적으로:
 *     1. pay() 내 createOutbox 호출은 `status === PaymentStatus.completed`
 *        조건 안에서만 이루어진다(무조건·실패 분기 호출 없음).
 *     2. refund() 내 createOutbox 호출은 `refundResult.success` 조건 안에서만
 *        이루어진다.
 *     3. payment.service.ts 전체에서 createOutbox 호출 횟수는 정확히 2회
 *        (pay 성공 1회·refund 성공 1회) — 신규 실패분기 outbox 기록 추가 없음.
 *
 * 실행: 앱 기동·DB 연결 불필요. 파일 텍스트 검증만.
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVICE_PATH = path.resolve(
  __dirname,
  '../../src/modules/payment/payment.service.ts',
);

describe('SC-014 (021): outbox 기록 없이 성공 상태만 변경하는 경로 부재 (정적 검증)', () => {
  it('when_inspect_source_then_service_file_exists', () => {
    expect(fs.existsSync(SERVICE_PATH)).toBe(true);
  });

  it('when_inspect_createOutbox_call_count_then_exactly_two_success_paths', () => {
    const source = fs.readFileSync(SERVICE_PATH, 'utf-8');
    const occurrences = source.match(/createOutbox\s*\(/g) ?? [];

    // pay() 성공분기 1회 + refund() 성공분기 1회 = 2회. 신규 실패분기 outbox 기록 추가 시 초과됨.
    expect(occurrences).toHaveLength(2);
  });

  it('when_inspect_pay_then_createOutbox_is_guarded_by_completed_status_check', () => {
    const source = fs.readFileSync(SERVICE_PATH, 'utf-8');

    // pay() 성공분기: `if (status === PaymentStatus.completed) { ... createOutbox(...) ... }`
    const guardedCompletedPattern =
      /if\s*\(\s*status\s*===\s*PaymentStatus\.completed\s*\)\s*\{[^]*?createOutbox\s*\(/;
    expect(source).toMatch(guardedCompletedPattern);
  });

  it('when_inspect_refund_then_createOutbox_is_guarded_by_success_check', () => {
    const source = fs.readFileSync(SERVICE_PATH, 'utf-8');

    // refund() 성공분기: `if (refundResult.success) { ... createOutbox(...) ... }`
    const guardedSuccessPattern =
      /if\s*\(\s*refundResult\.success\s*\)\s*\{[^]*?createOutbox\s*\(/;
    expect(source).toMatch(guardedSuccessPattern);
  });

  it('when_inspect_source_then_no_outbox_reference_in_failed_status_branch', () => {
    const source = fs.readFileSync(SERVICE_PATH, 'utf-8');

    // status 대입에 PaymentStatus.failed 가 등장하는 라인 근방에 createOutbox 호출이
    // 없어야 한다(실패 분기에 신규 outbox 기록 코드가 추가되지 않았음을 확인).
    const lines = source.split('\n');
    const failedAssignmentLineIdx = lines.findIndex((line) =>
      /PaymentStatus\.failed/.test(line) && /status/.test(line),
    );
    expect(failedAssignmentLineIdx).toBeGreaterThanOrEqual(0);

    // 실패 상태 대입 라인 직후 5줄 이내에 createOutbox 호출이 없어야 함(무조건 기록 금지)
    const windowAfterFailedAssignment = lines
      .slice(failedAssignmentLineIdx, failedAssignmentLineIdx + 5)
      .join('\n');
    expect(windowAfterFailedAssignment).not.toMatch(/createOutbox\s*\(/);
  });
});
