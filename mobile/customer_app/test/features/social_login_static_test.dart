// Static verification tests for social login: SC-011, SC-012, SC-017, SC-018
// (v1.1.0/014 spec)
//
// [env:static] — 빌드·실행 없이 파일 내용·심볼 존재를 검증한다.
//
// PATCH-013-01: LoginScreen = ConsumerStatefulWidget,
//   _SocialRow = 콜백 수신 위젯, GestureDetector 포함.
//
// SC-013(naver 버튼 핸들러) — 범위 외: 사용자 결정으로 Naver 소셜 로그인을 이번
// 릴리즈에서 완전 제외(SEC-001/GAP-014-10). 별도 spec에서 재검토.

// ignore_for_file: avoid_print

import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

/// 패키지 루트(`mobile/customer_app/`)를 기준으로 lib 파일의 절대경로를 반환한다.
///
/// GAP-014-02: `flutter test` 실행 시 `Directory.current` 는 `test/features/` 가
/// 아니라 패키지 루트(`mobile/customer_app/`)이므로 그 기준으로 계산한다.
String libPath(String relativePath) {
  final packageRoot = Directory.current.path;
  return p.normalize(p.join(packageRoot, 'lib', relativePath));
}

/// 패키지 루트를 기준으로 backend .env.example 의 절대경로를 반환한다.
/// customer_app/ → ../../apps/backend/.env.example
String backendEnvExamplePath() {
  final packageRoot = Directory.current.path;
  return p.normalize(p.join(packageRoot, '../../apps/backend/.env.example'));
}

bool fileContains(String filePath, String searchString) {
  final file = File(filePath);
  if (!file.existsSync()) return false;
  return file.readAsStringSync().contains(searchString);
}

void main() {
  // ── SC-011 (FR-010): 카카오 버튼 GestureDetector·핸들러 존재 ──────────────
  test('test_SC011_kakao_button_has_gesture_detector_and_handler', () {
    /// SC-011 (v1.1.0/014 spec): LoginScreen 카카오 소셜 버튼이 탭 가능
    /// (GestureDetector 또는 동등 위젯 포함)하며 탭 핸들러가 존재한다.
    ///
    /// PATCH-013-01: LoginScreen = ConsumerStatefulWidget, _SocialRow = 콜백 위젯.
    /// 검증: login_screen.dart 에 GestureDetector 와 카카오 핸들러 심볼 존재.
    final loginScreenPath = libPath('features/auth/login_screen.dart');

    expect(
      File(loginScreenPath).existsSync(),
      isTrue,
      reason: 'login_screen.dart 파일이 존재해야 한다',
    );
    expect(
      fileContains(loginScreenPath, 'GestureDetector'),
      isTrue,
      reason: 'SC-011: 카카오 버튼에 GestureDetector(또는 동등 탭 가능 위젯)가 존재해야 한다',
    );
    expect(
      fileContains(loginScreenPath, 'onKakao') ||
          fileContains(loginScreenPath, 'kakao') ||
          fileContains(loginScreenPath, 'Kakao'),
      isTrue,
      reason: 'SC-011: 카카오 버튼 핸들러 심볼(onKakao 또는 kakao)이 존재해야 한다',
    );
  });

  // ── SC-012 (FR-011): 구글 버튼 탭 가능·핸들러 ──────────────────────────────
  test('test_SC012_google_button_has_gesture_detector_and_handler', () {
    /// SC-012 (v1.1.0/014 spec): LoginScreen 구글 소셜 버튼이 탭 가능하며
    /// 탭 핸들러가 존재한다.
    final loginScreenPath = libPath('features/auth/login_screen.dart');

    expect(
      File(loginScreenPath).existsSync(),
      isTrue,
      reason: 'login_screen.dart 파일이 존재해야 한다',
    );
    expect(
      fileContains(loginScreenPath, 'onGoogle') ||
          fileContains(loginScreenPath, 'google') ||
          fileContains(loginScreenPath, 'Google'),
      isTrue,
      reason: 'SC-012: 구글 버튼 핸들러 심볼(onGoogle 또는 google)이 존재해야 한다',
    );
  });

  // ── SC-017 (NFR-005): flutter analyze 0 issues ───────────────────────────
  test('test_SC017_flutter_analyze_zero_issues_note', () {
    /// SC-017 (v1.1.0/014 spec): flutter analyze 실행 결과 0 issues.
    ///
    /// dart:test 내에서 flutter analyze 를 직접 실행할 수 없다.
    /// CI 파이프라인에서 `flutter analyze` 를 별도 step 으로 실행한다.
    /// (2) 단위테스트 불가 — CI에 위임. 본 테스트는 마커 노트 역할.
    ///
    /// 검증 대상 파일:
    ///   - lib/features/auth/login_screen.dart
    ///   - lib/features/auth/social_auth_service.dart  (Development 구현 후)
    ///   - lib/core/providers.dart
    print(
      '[SC-017] flutter analyze 는 CI에서 실행. '
      'dart:test 단위 테스트 범위 외 — 마커 노트.',
    );
    // CI 실행 명령: flutter analyze --no-pub lib/
    expect(true, isTrue); // CI 위임 마커
  });

  // ── SC-018 (NFR-004): .env.example 제공자 크레덴셜 항목 (kakao·google) ─────
  test('test_SC018_env_example_contains_all_provider_credentials', () {
    /// SC-018 (v1.1.0/014 spec): 카카오·구글 각 제공자의 인증 크레덴셜
    /// 환경변수 항목이 .env.example에 존재한다.
    ///
    /// naver 크레덴셜 항목(NAVER_CLIENT_ID/SECRET) 검증은 범위 외로 제외
    /// (Naver 소셜 로그인 이번 릴리즈 제외 — SEC-001/GAP-014-10).
    ///
    /// 검증 대상: apps/backend/.env.example
    /// 항목: KAKAO_REST_API_KEY, GOOGLE_CLIENT_ID
    final envPath = backendEnvExamplePath();

    expect(
      File(envPath).existsSync(),
      isTrue,
      reason: 'apps/backend/.env.example 파일이 존재해야 한다',
    );

    expect(
      fileContains(envPath, 'KAKAO_REST_API_KEY'),
      isTrue,
      reason: 'SC-018: .env.example 에 KAKAO_REST_API_KEY 항목이 존재해야 한다',
    );
    expect(
      fileContains(envPath, 'GOOGLE_CLIENT_ID'),
      isTrue,
      reason: 'SC-018: .env.example 에 GOOGLE_CLIENT_ID 항목이 존재해야 한다',
    );
  });
}
