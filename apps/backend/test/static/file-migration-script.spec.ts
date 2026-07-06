/**
 * 파일 이관 스크립트·설정·이미지 정적 검증 — [env:static] (v1.1.0/022 spec)
 *
 * 대상 SC: SC-010 (FR-010), SC-012 (NFR-002), SC-014 (NFR-004)
 * 검증 방법: `fs.readFileSync`/`fs.readdirSync` 로 `scripts/migration/Dockerfile`·
 *   `scripts/migration/files-migrate.sh`·`scripts/migration/config.example.env`
 *   를 파싱한다. DB 기동·레거시 접속·플랫폼 채널 의존 없음(순수 파일 텍스트 검증).
 *
 * 근거: tasks.md T-B01~04 — Dockerfile 에 rclone 1줄 추가·별도 신규 이미지
 *   0건(SC-010), files-migrate.sh 에 `--max-duration` 부재 + `--files-from`·
 *   `--checksum` 존재(SC-012), config.example.env 엔드포인트 https:// +
 *   평문/http 금지(SC-014).
 *
 * 대상 파일은 4단계 Development(B 레이어, T-B01~04)가 PPG-1 병렬 생성/수정
 * 한다 — 본 테스트는 AUTHORING 시점에 아직 파일이 없거나 rclone 미추가
 * 상태면 하드 assert 로 FAIL 한다(PROC-014-03 — 조건부 skip 금지). 단
 * Dockerfile·config.example.env 는 020 이 이미 생성한 기존 파일을 수정하는
 * 것이므로 파일 자체는 AUTHORING 시점에도 존재한다(존재 전제 assert 는
 * 수정 완료 여부만 가른다).
 */

import * as fs from 'fs';
import * as path from 'path';

// apps/backend/test/static/ → 4단계 상위 = repo-root (PROC-014-03 하네스 canonical)
const MIGRATION_ROOT = path.resolve(__dirname, '../../../../scripts/migration');
const DOCKERFILE_PATH = path.join(MIGRATION_ROOT, 'Dockerfile');
const FILES_MIGRATE_SH_PATH = path.join(MIGRATION_ROOT, 'files-migrate.sh');
const CONFIG_ENV_PATH = path.join(MIGRATION_ROOT, 'config.example.env');

describe('SC-010: Dockerfile rclone 확장 + 신규 별도 이미지 0건 (FR-010)', () => {
  it('test_SC010_dockerfile_exists_and_contains_rclone', () => {
    /**
     * SC-010 (v1.1.0/022 spec): 파일 이관 스크립트가 020 전용 러너 이미지
     * (`scripts/migration/Dockerfile`) 내에서 정상 실행 가능해야 한다
     * (tasks.md canonical 검증 대상 — Dockerfile 에 `rclone` 토큰 존재).
     */
    expect(fs.existsSync(DOCKERFILE_PATH)).toBe(true);

    const content = fs.readFileSync(DOCKERFILE_PATH, 'utf-8');

    expect(content).toMatch(/rclone/);
  });

  it('test_SC010_no_new_dockerfile_created_under_migration_root', () => {
    /**
     * SC-010 (v1.1.0/022 spec) 역방향 검증: 신규 별도 이미지 도입 금지
     * (FR-010) — `scripts/migration/` 하위에 020 기존 `Dockerfile` 1개만
     * 존재하고 `Dockerfile.*`·`*.dockerfile` 등 신규 이미지 파일이 없어야
     * 한다(tasks.md canonical 검증 대상).
     */
    const dockerfileEntries = fs
      .readdirSync(MIGRATION_ROOT)
      .filter((entry) => /^Dockerfile/i.test(entry));

    expect(dockerfileEntries).toEqual(['Dockerfile']);
  });
});

describe('SC-012: precopy 전체 시간상한 미설정 (NFR-002)', () => {
  it('test_SC012_files_migrate_sh_exists', () => {
    /**
     * SC-012 (v1.1.0/022 spec) 전제: `files-migrate.sh` 가 실제로 존재해야
     * 아래 플래그 존재/부재 검증이 의미를 갖는다(tasks.md T-B01 산출).
     */
    expect(fs.existsSync(FILES_MIGRATE_SH_PATH)).toBe(true);
  });

  it('test_SC012_files_migrate_sh_uses_files_from_and_checksum', () => {
    /**
     * SC-012 (v1.1.0/022 spec) 전제: 델타 캡처가 rclone 멱등 skip(ADR-003)에
     * 의존하므로 `--files-from`(key 목록 SoT)·`--checksum`(해시 기준 skip)
     * 플래그가 존재해야 한다(tasks.md canonical 검증 대상).
     */
    const content = fs.readFileSync(FILES_MIGRATE_SH_PATH, 'utf-8');

    expect(content).toMatch(/--files-from/);
    expect(content).toMatch(/--checksum/);
  });

  it('test_SC012_files_migrate_sh_has_no_max_duration_flag', () => {
    /**
     * SC-012 (v1.1.0/022 spec): 사전 대량 복사 단계는 별도 시간 상한을 두지
     * 않는다(NFR-002). `--max-duration` 등 전체 작업 상한 강제 로직이
     * 스크립트에 존재하면 안 된다(tasks.md canonical 검증 대상 — 부재 확인).
     */
    const content = fs.readFileSync(FILES_MIGRATE_SH_PATH, 'utf-8');

    expect(content).not.toMatch(/--max-duration/);
  });
});

describe('SC-014: 전송 채널 TLS/HTTPS 적용 (NFR-004)', () => {
  it('test_SC014_config_example_env_exists', () => {
    /**
     * SC-014 (v1.1.0/022 spec) 전제: `config.example.env` 가 실제로 존재해야
     * 아래 엔드포인트 스킴 검증이 의미를 갖는다(tasks.md T-B04 산출).
     */
    expect(fs.existsSync(CONFIG_ENV_PATH)).toBe(true);
  });

  it('test_SC014_config_example_env_endpoints_use_https', () => {
    /**
     * SC-014 (v1.1.0/022 spec): 이관 전송 채널 설정에 TLS/HTTPS 가 적용되어
     * 있어야 한다(tasks.md canonical 검증 대상 — 엔드포인트 `https://` 존재).
     * 020 이 이미 기재한 `TARGET_HEALTH_URL`(1건) 만으로는 본 SC(레거시 S3 +
     * R2 rclone remote 엔드포인트 신규 추가)를 검증하지 못하므로, T-B04 가
     * 추가해야 할 레거시 S3·R2 엔드포인트 최소 2건을 더한 3건 이상을
     * 요구한다(단순 존재만 확인 시 기존 무관 https:// 로 거짓 green 발생 —
     * 부분 문자열 카운트로 신규 추가분을 간접 확인).
     */
    const content = fs.readFileSync(CONFIG_ENV_PATH, 'utf-8');

    const httpsCount = (content.match(/https:\/\//g) ?? []).length;

    expect(httpsCount).toBeGreaterThanOrEqual(3);
  });

  it('test_SC014_config_example_env_has_no_plaintext_http_endpoint', () => {
    /**
     * SC-014 (v1.1.0/022 spec) 역방향 검증: 평문 HTTP 엔드포인트가 존재하면
     * NFR-004 위반이다(tasks.md canonical 검증 대상 — 평문/http 금지).
     * "https://" 는 부분 문자열로 "http://" 를 포함하지 않으므로(중간에
     * "s" 문자 존재) 아래 정규식은 https:// 오탐 없이 순수 http:// 만 검출한다.
     */
    const content = fs.readFileSync(CONFIG_ENV_PATH, 'utf-8');

    expect(content).not.toMatch(/http:\/\//);
  });
});
