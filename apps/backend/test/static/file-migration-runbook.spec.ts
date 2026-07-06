/**
 * 파일 이관 런북 완결성 정적 검증 — [env:static] (v1.1.0/022 spec)
 *
 * 대상 SC: SC-008 (FR-008)
 * 검증 방법: `fs.readFileSync` 로 `scripts/migration/FILE-MIGRATION-RUNBOOK.md` 를 파싱하여
 *   tasks.md T-C01 이 명시한 필수 체크포인트·문구의 존재를 하드 assert 한다
 *   (조건부 skip 금지 — PROC-014-03). DB 기동·레거시 접속·플랫폼 채널 의존 없음
 *   (순수 파일 텍스트 검증).
 *
 * 대상 파일은 4단계 Development(C 레이어, T-C01)가 PPG-1 병렬 생성한다 — 본
 * 테스트는 AUTHORING 시점에 아직 파일이 없으면 하드 assert 로 FAIL 한다.
 *
 * SC-008 검증 설계 노트(비자명한 이유): spec.md SC-008 은 "레거시 S3 자격증명·
 * 버킷 접근이 필요한 단계마다" 문구가 반복 명시되길 요구한다. plan.md S2 컷오버
 * 통합 시퀀스에 따르면 레거시 접근이 필요한 서브커맨드는 precheck·precopy·
 * delta·verify 4개(url-update 는 타깃 DB 만 갱신하므로 레거시 접근 불요) —
 * 따라서 "사용자 환경 실행"·"결과 전달"·"검증" 3개 라벨의 최소 출현 횟수를
 * 4회로 설정한다(020 SC-015 근사 검증 패턴 승계).
 */

import * as fs from 'fs';
import * as path from 'path';

// apps/backend/test/static/ → 4단계 상위 = repo-root (PROC-014-03 하네스 canonical)
const RUNBOOK_PATH = path.resolve(
  __dirname,
  '../../../../scripts/migration/FILE-MIGRATION-RUNBOOK.md',
);

/** 레거시 S3 접근이 필요한 서브커맨드 수(precheck·precopy·delta·verify) — 설계 노트 참조 */
const MIN_LABEL_OCCURRENCES = 4;

const CANONICAL_SUBCOMMANDS = ['precheck', 'precopy', 'delta', 'verify', 'url-update'];

describe('FILE-MIGRATION-RUNBOOK.md 존재 전제', () => {
  it('test_file_migration_runbook_exists', () => {
    expect(fs.existsSync(RUNBOOK_PATH)).toBe(true);
  });
});

describe('SC-008: 단계별 절차 + S3 접근 단계마다 "사용자 환경 실행→결과 전달→검증" 명시 (FR-008)', () => {
  it.each(CANONICAL_SUBCOMMANDS)(
    'test_SC008_runbook_documents_%s_subcommand_step',
    (subcommand) => {
      /**
       * SC-008 (v1.1.0/022 spec) 전제: tasks.md Test Authoring Contract 가 고정한
       * canonical 서브커맨드명(precheck/precopy/delta/verify/url-update) 5종이
       * 런북에 단계로 언급되어야, 이어지는 "단계마다" 라벨 검증이 의미를 갖는다.
       */
      const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

      expect(content).toContain(subcommand);
    },
  );

  it('test_SC008_runbook_repeats_user_execution_transfer_verification_labels', () => {
    /**
     * SC-008 (v1.1.0/022 spec): 레거시 S3 자격증명·버킷 접근이 필요한 단계마다
     * "사용자 환경 실행 → 결과 전달 → 검증" 절차가 명시되어야 한다(tasks.md
     * canonical 검증 대상 — "사용자 환경 실행"·"결과 전달"·"검증" 라벨 최소 출현).
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    const userExecCount = (content.match(/사용자\s*환경\s*실행/g) ?? []).length;
    const transferCount = (content.match(/결과\s*전달/g) ?? []).length;
    const verifyCount = (content.match(/검증/g) ?? []).length;

    expect(userExecCount).toBeGreaterThanOrEqual(MIN_LABEL_OCCURRENCES);
    expect(transferCount).toBeGreaterThanOrEqual(MIN_LABEL_OCCURRENCES);
    expect(verifyCount).toBeGreaterThanOrEqual(MIN_LABEL_OCCURRENCES);
  });
});
