/**
 * 정적 코드 검증 — trust proxy + tracker 헤더 — [env:static]
 *
 * 대상 SC: SC-008 (v1.1.0/018 spec, FR-004·NFR-008)
 * 검증 방법: Node.js fs + 소스 텍스트 파싱(grep 등가)
 *
 * 검증 내용:
 *   - `main.ts` 에 클라이언트 IP 신뢰 설정(trust proxy)이 존재한다.
 *   - rate limit 트래킹 로직(`client-ip.util.ts`)이 Fly-Client-IP/X-Forwarded-For
 *     헤더 기반 IP 를 우선 사용함을 코드 정적 검증으로 확인한다.
 *
 * 실행: 앱 기동·DB 연결 불필요. 파일 텍스트 검증만.
 */

import * as fs from 'fs';
import * as path from 'path';

// apps/backend/test/static/ → 2단계 상위 = apps/backend
const BACKEND_ROOT = path.resolve(__dirname, '../../');
const MAIN_TS_PATH = path.join(BACKEND_ROOT, 'src/main.ts');
const CLIENT_IP_UTIL_PATH = path.join(BACKEND_ROOT, 'src/shared/security/client-ip.util.ts');

describe('SC-008 (v1.1.0/018 spec): trust proxy + tracker 헤더 정적 검증 (FR-004·NFR-008)', () => {
  it('test_SC008_018_main_ts_sets_trust_proxy', () => {
    /**
     * SC-008 (v1.1.0/018 spec): main.ts 에 클라이언트 IP 신뢰 설정(trust proxy)이
     * 존재함을 코드 정적 검증으로 확인한다.
     */
    expect(fs.existsSync(MAIN_TS_PATH)).toBe(true);

    const mainTsSource = fs.readFileSync(MAIN_TS_PATH, 'utf-8');

    expect(mainTsSource).toMatch(/trust proxy/);
  });

  it('test_SC008_018_client_ip_util_prefers_fly_client_ip_and_xff', () => {
    /**
     * SC-008 (v1.1.0/018 spec): rate limit 트래킹 로직이 Fly-Client-IP 헤더
     * (또는 표준 X-Forwarded-For)를 사용함을 코드 정적 검증으로 확인한다.
     */
    expect(fs.existsSync(CLIENT_IP_UTIL_PATH)).toBe(true);

    const clientIpUtilSource = fs.readFileSync(CLIENT_IP_UTIL_PATH, 'utf-8');

    expect(clientIpUtilSource).toMatch(/fly-client-ip/);
    expect(clientIpUtilSource).toMatch(/x-forwarded-for/);
  });
});
