/**
 * 정적 코드 검증 — SC-051 [env:static]
 *
 * 대상 SC: SC-051 (NFR-005 관련)
 * 검증 방법: Node.js fs + package.json 텍스트 파싱
 *
 * 검증 내용:
 *   apps/backend/package.json 의 dependencies·devDependencies 에
 *   allowlist 2개(@aws-sdk/client-s3·@aws-sdk/s3-request-presigner) 를 제외한
 *   @aws-sdk/* 패키지가 없음을 확인.
 *
 * [정밀화 — 021-payment-file-integration] constitution P-002 L32 는 파일 스토리지
 * S3 호환 엔드포인트(R2FileStorage)용 `@aws-sdk/client-s3`·`@aws-sdk/s3-request-presigner`
 * 를 명시 허용한다. 이 가드는 그 2개 패키지만 정확 매칭으로 예외 처리하고, 그 외
 * `@aws-sdk/*`·`aws-sdk`·`@aws-`·`amazon-` 패키지는 계속 차단한다(가드 무력화 아님 —
 * research.md §3-2).
 *
 * 실행: 앱 기동·DB 연결 불필요. 파일 텍스트 검증만.
 */

import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.resolve(__dirname, '../../');
const PACKAGE_JSON_PATH = path.join(BACKEND_ROOT, 'package.json');

/** P-002 L32 명시 허용 — R2 S3 호환 엔드포인트 연동 전용, 정확 매칭만 예외 */
const AWS_SDK_ALLOWLIST = ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'];

describe('SC-051: @aws-sdk/* 신규 의존 없음 정적 검증 (allowlist 정밀화)', () => {
  it('when_inspect_package_json_then_no_aws_sdk_packages_outside_allowlist', () => {
    /**
     * SC-051 (NFR-005 관련):
     * apps/backend/package.json 에 allowlist 외 @aws-sdk/* 패키지가 없어야 한다.
     * constitution P-002: AWS 전용 SDK·서비스 신규 의존 추가 금지(L32 예외: S3 호환 2종).
     *
     * 검증 전략:
     *   package.json 을 파싱하여 dependencies + devDependencies 의
     *   "@aws-sdk/" 로 시작하는 키 중 allowlist 정확 매칭이 아닌 것이 없음을 확인.
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

    const awsSdkDeps = allDeps.filter(
      (dep) => dep.startsWith('@aws-sdk/') && !AWS_SDK_ALLOWLIST.includes(dep),
    );

    if (awsSdkDeps.length > 0) {
      // 위반 목록을 메시지에 포함하여 디버깅 편의 제공
      throw new Error(
        `SC-051 위반: allowlist 외 @aws-sdk/* 패키지가 발견됨:\n${awsSdkDeps.join('\n')}`,
      );
    }

    expect(awsSdkDeps).toHaveLength(0);
  });

  it('when_inspect_package_json_then_no_aws_string_anywhere_in_deps_outside_allowlist', () => {
    /**
     * SC-051 (NFR-005 관련) — 추가 확인:
     * aws-sdk (v2) 또는 amazon 접두어 패키지도 없어야 한다(allowlist 2종 제외).
     * @aws-sdk/* (v3 modular) 외 레거시 패키지도 포함.
     */
    const rawJson = fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8');
    const pkg = JSON.parse(rawJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];

    // aws-sdk (v2 레거시) 또는 @aws-amplify, amazon-cognito 등 — allowlist 2종 제외 전부 차단
    const awsRelatedDeps = allDeps.filter(
      (dep) =>
        (dep === 'aws-sdk' || dep.startsWith('@aws-') || dep.startsWith('amazon-')) &&
        !AWS_SDK_ALLOWLIST.includes(dep),
    );

    expect(awsRelatedDeps).toHaveLength(0);
  });

  it('when_inspect_allowlist_then_arbitrary_aws_sdk_package_still_rejected', () => {
    /**
     * 가드 유효성 회귀 방지(무력화 아님을 논리로 확인) — tasks.md T007 완료 기준:
     * allowlist 에 없는 임의 @aws-sdk/* 패키지를 시뮬레이션하면 여전히 필터링됨을 확인.
     */
    const simulatedDeps = ['@aws-sdk/client-dynamodb', ...AWS_SDK_ALLOWLIST];

    const rejected = simulatedDeps.filter(
      (dep) => dep.startsWith('@aws-sdk/') && !AWS_SDK_ALLOWLIST.includes(dep),
    );

    expect(rejected).toEqual(['@aws-sdk/client-dynamodb']);
  });
});
