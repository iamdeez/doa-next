/**
 * 파일 이관 사전평가 리포트 정적 검증 — [env:static] (v1.1.0/022 spec)
 *
 * 대상 SC: SC-007 (FR-007), SC-009 (FR-009)
 * 검증 방법: `fs.readFileSync` 로 `scripts/migration/FILE-PRE-ASSESSMENT.md` 를
 *   파싱한다. DB 기동·레거시 접속·플랫폼 채널 의존 없음(순수 파일 텍스트 검증).
 *
 * 근거: tasks.md T-C02 — 총개수·총용량·예상소요 3항목 슬롯 존재(SC-009) +
 *   잔존 실패 목록 + "컷오버 개시 전 사용자 재확인 필요" 문구 존재(SC-007).
 *
 * 대상 파일은 4단계 Development(C 레이어, T-C02)가 PPG-1 병렬 생성한다 — 본
 * 테스트는 AUTHORING 시점에 아직 파일이 없으면 하드 assert 로 FAIL 한다
 * (PROC-014-03 — 조건부 skip 금지).
 */

import * as fs from 'fs';
import * as path from 'path';

// apps/backend/test/static/ → 4단계 상위 = repo-root (PROC-014-03 하네스 canonical)
const PRE_ASSESSMENT_PATH = path.resolve(
  __dirname,
  '../../../../scripts/migration/FILE-PRE-ASSESSMENT.md',
);

describe('FILE-PRE-ASSESSMENT.md 존재 전제', () => {
  it('test_file_migration_pre_assessment_exists', () => {
    expect(fs.existsSync(PRE_ASSESSMENT_PATH)).toBe(true);
  });
});

describe('SC-009: 총 개수·총 용량·예상 소요 3항목 기재 (FR-009)', () => {
  it('test_SC009_pre_assessment_has_total_count_capacity_duration_slots', () => {
    /**
     * SC-009 (v1.1.0/022 spec): 사전 평가 리포트에 레거시 파일 총 개수·총
     * 용량 실측값과 예상 소요 시간이 기재되어 있어야 한다(tasks.md canonical
     * 검증 대상 — "총 개수"·"총 용량"·"예상 소요" 3항목 헤더/컬럼).
     */
    const content = fs.readFileSync(PRE_ASSESSMENT_PATH, 'utf-8');

    expect(content).toMatch(/총\s*개수/);
    expect(content).toMatch(/총\s*용량/);
    expect(content).toMatch(/예상\s*소요/);
  });
});

describe('SC-007: 잔존 실패 목록 + "재확인 필요" 문구 (FR-007)', () => {
  it('test_SC007_pre_assessment_documents_residual_failure_reconfirmation', () => {
    /**
     * SC-007 (v1.1.0/022 spec): 사전 복사 완료 후에도 미해결 실패가 잔존하는
     * 경우, 사전 평가 리포트에 잔존 실패 목록과 "컷오버 개시 전 사용자
     * 재확인 필요" 문구가 포함되어야 한다(tasks.md canonical 검증 대상 —
     * "재확인" + "잔존 실패"(또는 실패 목록) 문구).
     */
    const content = fs.readFileSync(PRE_ASSESSMENT_PATH, 'utf-8');

    expect(content).toMatch(/재확인/);
    expect(content).toMatch(/잔존\s*실패|실패\s*목록/);
  });
});
