/**
 * 런북 완결성 정적 검증 — [env:static] (v1.1.0/020 spec)
 *
 * 대상 SC: SC-003 (FR-003), SC-008 (FR-006), SC-009 (FR-007), SC-010 (FR-008),
 *   SC-014 (FR-012), SC-015 (FR-013), SC-018 (FR-016), SC-019 (FR-017)
 * 검증 방법: `fs.readFileSync` 로 `scripts/migration/RUNBOOK.md` 를 파싱하여
 *   tasks.md T008 이 명시한 필수 체크포인트·문구의 존재를 하드 assert 한다
 *   (조건부 skip 금지 — PROC-014-03). DB 기동·레거시 접속·플랫폼 채널
 *   의존 없음(순수 파일 텍스트 검증).
 *
 * `RUNBOOK.md` 는 4단계 Development(C 레이어, T008)가 PPG-1 병렬 생성한다 —
 * 본 테스트는 AUTHORING 시점에 아직 파일이 없으면 하드 assert 로 FAIL 한다.
 *
 * SC-015 검증 설계 노트(비자명한 이유): "각 단계" 의 정확한 마크다운 헤더
 * 구조는 tasks.md 가 문구/체크포인트 목록만 지정하고 헤딩 컨벤션을 강제하지
 * 않는다. 단계별 1:1 대응 파싱 대신 "담당자"·"체크포인트"·"롤백 트리거"
 * 3개 라벨의 최소 출현 횟수(문서 전반에 반복 기재)로 근사 검증한다 — 정확한
 * 단계별 대응은 5b/Deploy 단계에서 문서 육안 확인으로 보완한다(test-cases.md
 * "옵션 A 실행 계약" 절 및 미커버 항목 참조).
 */

import * as fs from 'fs';
import * as path from 'path';

// apps/backend/test/static/ → 4단계 상위 = repo-root (PROC-014-03 하네스 canonical)
const RUNBOOK_PATH = path.resolve(
  __dirname,
  '../../../../scripts/migration/RUNBOOK.md',
);

/** SC-015 근사 검증 하한값 — 위 설계 노트 참조 */
const MIN_LABEL_OCCURRENCES = 5;

describe('RUNBOOK.md 존재 전제', () => {
  it('test_runbook_file_exists', () => {
    expect(fs.existsSync(RUNBOOK_PATH)).toBe(true);
  });
});

describe('SC-003: 윈도우 개시 후 레거시 쓰기 요청 일관 차단 (FR-003)', () => {
  it('test_SC003_runbook_documents_write_blocking_step', () => {
    /**
     * SC-003 (v1.1.0/020 spec): 윈도우 개시 시각 이후 레거시 API 가 쓰기
     * 요청(POST/PUT/PATCH/DELETE)에 대해 일관되게 차단 응답(예: 503 점검
     * 모드)을 반환하는 절차가 런북에 명시되어야 한다(레거시측 실행은
     * 옵션 A — test-cases.md 참조).
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    expect(content).toMatch(/쓰기\s*차단/);
    expect(content).toMatch(/503|read-only|점검\s*모드/);
  });
});

describe('SC-008: "SC-005~SC-007 전부 PASS 시에만 GO" 명시 (FR-006)', () => {
  it('test_SC008_runbook_documents_go_gate_condition', () => {
    /**
     * SC-008 (v1.1.0/020 spec): 런북 문서에 "SC-005~SC-007 전부 PASS 시에만
     * 트래픽 전환(GO) 단계 진행" 이 명시되어 있어야 한다(tasks.md T008 필수
     * 문구).
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    expect(content).toMatch(/SC-005/);
    expect(content).toMatch(/SC-007/);
    expect(content).toMatch(/GO/);
  });
});

describe('SC-009: 검증 실패 시 전환 미진행·쓰기차단 해제 (FR-007)', () => {
  it('test_SC009_runbook_documents_no_go_rollback_procedure', () => {
    /**
     * SC-009 (v1.1.0/020 spec): 검증 실패(NO-GO) 시나리오에서 절차가 트래픽
     * 전환을 진행하지 않고 레거시 쓰기 차단이 해제되어 정상 서비스가
     * 재개되는 절차가 런북에 명시되어야 한다(리허설 실행은 옵션 A).
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    expect(content).toMatch(/NO-GO/);
    expect(content).toMatch(/쓰기\s*차단\s*해제|재개/);
  });
});

describe('SC-010: PoNR(point of no return) 경고 단계 (FR-008)', () => {
  it('test_SC010_runbook_documents_point_of_no_return_warning', () => {
    /**
     * SC-010 (v1.1.0/020 spec): 런북 문서에 "컷오버 후 신규 주문/결제 1건
     * 발생 시점부터 롤백 불가(point of no return)" 경고 단계가 명시되어야
     * 한다.
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    expect(content).toMatch(/point of no return|PoNR/i);
    expect(content).toMatch(/롤백\s*불가/);
  });
});

describe('SC-014: 예상소요>50분 시 "사용자 재확인 필수" 체크포인트 (FR-012)', () => {
  it('test_SC014_runbook_documents_reconfirmation_checkpoint', () => {
    /**
     * SC-014 (v1.1.0/020 spec): 사전 평가 리포트의 예상 소요 시간이
     * NFR-005 안전마진(50분)을 초과하는 경우, 런북에 "진행 전 사용자
     * 재확인 필수" 체크포인트가 명시되어야 한다.
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    expect(content).toMatch(/50분/);
    expect(content).toMatch(/재확인/);
  });
});

describe('SC-015: 각 단계 담당자·체크포인트·롤백 트리거 조건 기재 (FR-013)', () => {
  it('test_SC015_runbook_repeats_owner_checkpoint_rollback_trigger_labels', () => {
    /**
     * SC-015 (v1.1.0/020 spec): 컷오버 실행 절차의 각 단계에 담당자·
     * 체크포인트·각 단계의 롤백 트리거 조건이 누락 없이 기재되어야 한다.
     * 근사 검증 설계는 파일 상단 노트 참조.
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    const ownerCount = (content.match(/담당자/g) ?? []).length;
    const checkpointCount = (content.match(/체크포인트/g) ?? []).length;
    const rollbackTriggerCount = (content.match(/롤백\s*트리거/g) ?? []).length;

    expect(ownerCount).toBeGreaterThanOrEqual(MIN_LABEL_OCCURRENCES);
    expect(checkpointCount).toBeGreaterThanOrEqual(MIN_LABEL_OCCURRENCES);
    expect(rollbackTriggerCount).toBeGreaterThanOrEqual(MIN_LABEL_OCCURRENCES);
  });
});

describe('SC-018: D-3일 전 사용자 공지 체크포인트 (FR-016)', () => {
  it('test_SC018_runbook_documents_d_minus_3_notice_checkpoint', () => {
    /**
     * SC-018 (v1.1.0/020 spec): 런북 문서에 컷오버 최소 D-3일 전 사용자
     * 공지 체크포인트(공지 채널·완료 확인란)가 포함되어야 한다.
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    expect(content).toMatch(/D-3/);
    expect(content).toMatch(/공지/);
  });
});

describe('SC-019: file_assets 메타 포함·바이너리 이관 범위 외 명시 (FR-017)', () => {
  it('test_SC019_runbook_documents_metadata_only_scope', () => {
    /**
     * SC-019 (v1.1.0/020 spec): 정합성 검증 대상에 `file_assets` 메타데이터
     * 레코드 수 대조가 포함되고, 실 파일 바이너리 전송 검증은 명시적으로
     * 범위 외로 기재되어야 한다(물리 테이블명은 GAP-020-02 실측 `files.files`
     * — 표기 정정은 문서 범위이므로 양쪽 표기 모두 허용).
     */
    const content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');

    expect(content).toMatch(/file_assets|files\.files/);
    expect(content).toMatch(/바이너리/);
    expect(content).toMatch(/범위\s*외|제외/);
  });
});
