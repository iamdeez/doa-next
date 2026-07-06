/**
 * 정적 코드 검증 — Redis 등 저장소 의존 부재 — [env:static]
 *
 * 대상 SC: SC-018 (v1.1.0/018 spec, NFR-007)
 * 검증 방법: Node.js fs + package.json 텍스트 파싱 (`package-no-aws.spec.ts` 패턴 준용)
 *
 * 검증 내용:
 *   apps/backend/package.json 의 dependencies·devDependencies 에 Redis 등 외부
 *   캐시/저장소 의존성(`ioredis`/`redis`/`@upstash/*` 등)이 신규로 추가되지
 *   않았음을 확인. `@nestjs/throttler` 자체(인-메모리 스토리지 기본값)는 허용한다.
 *
 * 실행: 앱 기동·DB 연결 불필요. 파일 텍스트 검증만.
 */

import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.resolve(__dirname, '../../');
const PACKAGE_JSON_PATH = path.join(BACKEND_ROOT, 'package.json');

describe('SC-018 (v1.1.0/018 spec): Redis 등 신규 저장소 의존 0건 정적 검증 (NFR-007)', () => {
  it('test_SC018_018_no_redis_storage_packages_in_package_json', () => {
    /**
     * SC-018 (v1.1.0/018 spec): apps/backend/package.json 에 Redis 등 외부
     * 캐시/저장소 의존성이 신규로 추가되지 않았음을 정적 검증한다.
     * constitution P-003(단일 DB 원칙): rate limit 은 인-메모리 스토리지 사용.
     */
    expect(fs.existsSync(PACKAGE_JSON_PATH)).toBe(true);

    const rawJson = fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8');
    const pkg = JSON.parse(rawJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    const allDeps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ];

    // Redis storage 어댑터·클라이언트 계열 패키지 (ioredis, redis, @upstash/*, @nestjs/throttler-storage-redis 등)
    const redisRelatedDeps = allDeps.filter(
      (dep) =>
        dep === 'redis' ||
        dep === 'ioredis' ||
        dep.startsWith('@upstash/') ||
        dep.includes('throttler-storage-redis'),
    );

    if (redisRelatedDeps.length > 0) {
      throw new Error(
        `SC-018 위반: Redis 등 저장소 의존 패키지가 발견됨:\n${redisRelatedDeps.join('\n')}`,
      );
    }

    expect(redisRelatedDeps).toHaveLength(0);
  });

  it('test_SC018_018_nestjs_throttler_itself_is_allowed', () => {
    /**
     * SC-018 보조: `@nestjs/throttler` 자체(NFR-007 인-메모리 기본 스토리지)는
     * 허용 대상이며 본 검증에서 위반으로 간주되지 않아야 한다.
     */
    const rawJson = fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8');
    const pkg = JSON.parse(rawJson) as { dependencies?: Record<string, string> };

    expect(pkg.dependencies).toHaveProperty('@nestjs/throttler');
  });
});
