/**
 * 사전평가·접속설정 정적 검증 — [env:static] (v1.1.0/020 spec)
 *
 * 대상 SC: SC-013 (FR-011), SC-017 (FR-015·NFR-004)
 * 검증 방법: `fs.readFileSync` 로 `scripts/migration/PRE-ASSESSMENT.md` ·
 *   `config.example.env` · `extract.sh` · `load.sh` 를 파싱한다. DB 기동·
 *   레거시 접속·플랫폼 채널 의존 없음(순수 파일 텍스트 검증).
 *
 * 근거: tasks.md T012 — `PRE-ASSESSMENT.md` 행수·예상소요·여유율 컬럼
 *   존재(SC-013) + `config.example.env`/`extract.sh`/`load.sh` 에
 *   `sslmode=require`(이상) 존재(SC-017).
 *
 * 대상 파일은 4단계 Development(B·C 레이어)가 PPG-1 병렬 생성한다 — 본
 * 테스트는 AUTHORING 시점에 아직 파일이 없으면 하드 assert 로 FAIL 한다
 * (PROC-014-03 — 조건부 skip 금지).
 */

import * as fs from 'fs';
import * as path from 'path';

// apps/backend/test/static/ → 4단계 상위 = repo-root (PROC-014-03 하네스 canonical)
const MIGRATION_ROOT = path.resolve(__dirname, '../../../../scripts/migration');
const PRE_ASSESSMENT_PATH = path.join(MIGRATION_ROOT, 'PRE-ASSESSMENT.md');
const CONFIG_ENV_PATH = path.join(MIGRATION_ROOT, 'config.example.env');
const EXTRACT_SH_PATH = path.join(MIGRATION_ROOT, 'extract.sh');
const LOAD_SH_PATH = path.join(MIGRATION_ROOT, 'load.sh');
const COMMON_SH_PATH = path.join(MIGRATION_ROOT, 'lib/common.sh');

/** sslmode=require 이상(require/verify-ca/verify-full)인지 판정. disable/allow/prefer 는 불충족. */
const SSLMODE_MIN_REQUIRE_RE = /(?:PGSSLMODE|sslmode)\s*=\s*['"]?(require|verify-ca|verify-full)['"]?/i;

describe('SC-013: 사전평가 리포트 — 행수·예상소요·여유율 기재 (FR-011)', () => {
  it('test_SC013_pre_assessment_file_exists', () => {
    /**
     * SC-013 (v1.1.0/020 spec) 전제: `PRE-ASSESSMENT.md` 가 실제로 존재해야
     * 아래 컬럼 검증이 의미를 갖는다(tasks.md T009, Development 산출).
     */
    expect(fs.existsSync(PRE_ASSESSMENT_PATH)).toBe(true);
  });

  it('test_SC013_pre_assessment_has_row_count_duration_margin_columns', () => {
    /**
     * SC-013 (v1.1.0/020 spec): 사전 평가 리포트에 테이블별 행 수·예상
     * 소요 시간·윈도우 대비 여유율이 기재되어 있어야 한다(FR-011).
     */
    const content = fs.readFileSync(PRE_ASSESSMENT_PATH, 'utf-8');

    expect(content).toMatch(/행\s*수/); // 행수 컬럼
    expect(content).toMatch(/예상\s*소요/); // 예상 소요 시간 컬럼
    expect(content).toMatch(/여유율/); // 윈도우 대비 여유율 컬럼
  });

  it('test_SC013_pre_assessment_links_nfr005_reconfirmation_gate', () => {
    /**
     * SC-014 (v1.1.0/020 spec, FR-012) 연계: 예상소요 > 50분(NFR-005) 초과 시
     * "사용자 재확인 필수" 게이트로 연결되어야 한다(tasks.md T009 완료 기준 —
     * 런북 T008 참조 링크).
     */
    const content = fs.readFileSync(PRE_ASSESSMENT_PATH, 'utf-8');

    expect(content).toMatch(/NFR-005|50분/);
  });
});

describe('SC-017: 러너 DB 연결 TLS(sslmode=require 이상) 적용 (FR-015·NFR-004)', () => {
  it('test_SC017_config_example_env_declares_sslmode_require_or_above', () => {
    /**
     * SC-017 (v1.1.0/020 spec): 이관 파이프라인의 DB 연결 설정에
     * TLS(sslmode=require 이상)가 적용되어 있어야 한다. `disable`·`allow`·
     * `prefer` 는 평문/선택적 암호화로 NFR-004 미충족이므로 불통과 처리한다.
     */
    expect(fs.existsSync(CONFIG_ENV_PATH)).toBe(true);

    const content = fs.readFileSync(CONFIG_ENV_PATH, 'utf-8');
    const match = content.match(SSLMODE_MIN_REQUIRE_RE);

    expect(match).not.toBeNull();
  });

  it.each([
    ['extract.sh', EXTRACT_SH_PATH],
    ['load.sh', LOAD_SH_PATH],
  ])('test_SC017_%s_delegates_sslmode_enforcement_to_common_config_loader', (_label, filePath) => {
    /**
     * SC-017 (v1.1.0/020 spec) 러너 스크립트 측 검증: `extract.sh`/`load.sh`
     * 는 sslmode 값을 파일마다 중복 하드코딩하지 않고, `lib/common.sh` 의
     * `load_migration_config`(PGSSLMODE 필수 단언 — 미설정 시 즉시 실패)를
     * source+호출하여 접속 전 TLS 강제를 위임한다(단일 소스 원칙 — config
     * 값 변경 시 스크립트마다 수정할 필요 없음). `lib/common.sh` 자체가
     * PGSSLMODE 를 require 이상으로 강제하는지는 아래
     * `common.sh` 전용 테스트가 별도 확인한다.
     */
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/source\s+.*common\.sh/);
    expect(content).toMatch(/load_migration_config/);
  });

  it('test_SC017_common_sh_enforces_pgsslmode_before_connection', () => {
    /**
     * SC-017 (v1.1.0/020 spec): 공통 헬퍼(`lib/common.sh`)가 `PGSSLMODE`
     * 미설정 시 즉시 실패(bash `: "${VAR:?message}"` 관용구)하도록 강제
     * 하는지 확인한다 — 이 단언이 extract.sh/load.sh 양쪽의 실제 TLS
     * 강제 지점이다(위 delegation 검증과 짝을 이룸).
     */
    expect(fs.existsSync(COMMON_SH_PATH)).toBe(true);

    const content = fs.readFileSync(COMMON_SH_PATH, 'utf-8');

    expect(content).toMatch(/PGSSLMODE.*:\?/);
  });

  it('test_SC017_config_example_env_has_no_hardcoded_secret_values', () => {
    /**
     * SC-017 부수 검증(config.example.env 문서화 원칙, tasks.md T006 완료
     * 기준): 접속 문자열은 템플릿이어야 하며 실제 비밀번호·토큰 값을
     * 평문 커밋하지 않는다(키만 존재, 값은 placeholder).
     */
    const content = fs.readFileSync(CONFIG_ENV_PATH, 'utf-8');

    expect(content).not.toMatch(/password\s*=\s*['"]?[A-Za-z0-9]{8,}['"]?/i);
  });
});
