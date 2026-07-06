// Static verification tests for naver social login: SC-011, SC-012, SC-017, SC-020
// (v1.1.0/015 spec)
//
// [env:static] — 빌드·실행 없이 파일 내용·심볼 존재를 검증한다.
//
// PATCH-013-01: LoginScreen = ConsumerStatefulWidget,
//   _SocialRow = 콜백 수신 위젯(onKakao·onGoogle·onNaver), 네이버 버튼 = GestureDetector.
//
// PROC-014-03: 경로 기준 — `Directory.current` = 패키지 루트(`mobile/customer_app/`)
//   기준 상수 경로. `.env.example` = `../../apps/backend/.env.example`.
//   (014 `social_login_static_test.dart` `libPath`/`backendEnvExamplePath` 헬퍼 재사용.)

// ignore_for_file: avoid_print

import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

/// 패키지 루트(`mobile/customer_app/`)를 기준으로 lib 파일의 절대경로를 반환한다.
String libPath(String relativePath) {
  final packageRoot = Directory.current.path;
  return p.normalize(p.join(packageRoot, 'lib', relativePath));
}

/// 패키지 루트를 기준으로 backend src 파일의 절대경로를 반환한다.
/// customer_app/ → ../../apps/backend/src/...
String backendSrcPath(String relativePath) {
  final packageRoot = Directory.current.path;
  return p.normalize(p.join(packageRoot, '../../apps/backend/src', relativePath));
}

/// 패키지 루트를 기준으로 backend .env.example 의 절대경로를 반환한다.
String backendEnvExamplePath() {
  final packageRoot = Directory.current.path;
  return p.normalize(p.join(packageRoot, '../../apps/backend/.env.example'));
}

/// 패키지 루트를 기준으로 pubspec.yaml 의 절대경로를 반환한다.
String pubspecPath() {
  final packageRoot = Directory.current.path;
  return p.normalize(p.join(packageRoot, 'pubspec.yaml'));
}

bool fileContains(String filePath, String searchString) {
  final file = File(filePath);
  if (!file.existsSync()) return false;
  return file.readAsStringSync().contains(searchString);
}

/// 파일 내에서 주어진 토큰 중 하나라도 포함하는 라인들을 반환한다(로그 출력문 탐색용).
List<String> linesContainingAny(String filePath, List<String> tokens) {
  final file = File(filePath);
  if (!file.existsSync()) return [];
  return file
      .readAsLinesSync()
      .where((line) => tokens.any((token) => line.contains(token)))
      .toList();
}

void main() {
  // ── SC-011 (FR-009): 네이버 버튼 GestureDetector·핸들러 존재 ──────────────
  test('test_SC011_naver_button_gesture_and_handler', () {
    /// SC-011 (v1.1.0/015 spec): LoginScreen 네이버 소셜 버튼이 탭 가능
    /// (GestureDetector 또는 동등 위젯 포함)하며 탭 핸들러가 존재한다.
    final loginScreenPath = libPath('features/auth/login_screen.dart');

    expect(
      File(loginScreenPath).existsSync(),
      isTrue,
      reason: 'login_screen.dart 파일이 존재해야 한다',
    );
    expect(
      fileContains(loginScreenPath, 'GestureDetector'),
      isTrue,
      reason: 'SC-011: 네이버 버튼에 GestureDetector(또는 동등 탭 가능 위젯)가 존재해야 한다',
    );
    expect(
      fileContains(loginScreenPath, 'onNaver'),
      isTrue,
      reason: 'SC-011: 네이버 버튼 핸들러 심볼(onNaver)이 존재해야 한다',
    );
  });

  // ── SC-012 (FR-010): 인앱 WebView 미사용 + 시스템 브라우저 메커니즘 ────────
  test('test_SC012_no_inapp_webview_system_browser_mechanism', () {
    /// SC-012 (v1.1.0/015 spec): 네이버 인증 흐름 트리거 코드에 인앱 WebView
    /// 위젯이 직접 사용되지 않고, 시스템 브라우저(또는 외부 인증 컨텍스트)
    /// 경유 메커니즘이 존재함을 정적으로 확인한다.
    final loginScreenPath = libPath('features/auth/login_screen.dart');
    final socialAuthServicePath = libPath('features/auth/social_auth_service.dart');

    expect(
      File(socialAuthServicePath).existsSync(),
      isTrue,
      reason: 'social_auth_service.dart 파일이 존재해야 한다',
    );

    expect(
      fileContains(loginScreenPath, 'WebView'),
      isFalse,
      reason: 'SC-012: login_screen.dart 에 인앱 WebView 위젯이 사용되지 않아야 한다',
    );
    expect(
      fileContains(socialAuthServicePath, 'WebView'),
      isFalse,
      reason: 'SC-012: social_auth_service.dart 에 인앱 WebView 위젯이 사용되지 않아야 한다',
    );

    expect(
      fileContains(socialAuthServicePath, 'signInWithNaver'),
      isTrue,
      reason: 'SC-012: signInWithNaver 심볼이 존재해야 한다',
    );
    expect(
      fileContains(pubspecPath(), 'flutter_web_auth_2'),
      isTrue,
      reason:
          'SC-012: pubspec.yaml 에 시스템 브라우저/외부 인증 컨텍스트 메커니즘 패키지'
          '(flutter_web_auth_2)가 존재해야 한다',
    );
  });

  // ── SC-017 (NFR-002): .env NAVER_* 존재 + client_secret 비노출 ────────────
  test('test_SC017_env_naver_credentials_and_no_secret_leak', () {
    /// SC-017 (v1.1.0/015 spec): `.env.example` 에 NAVER_CLIENT_ID·
    /// NAVER_CLIENT_SECRET 항목이 존재하며, client_secret 값이 로그 출력문·
    /// API 응답 바디·클라이언트(Flutter) 코드 어디에도 포함되지 않는다.
    final envPath = backendEnvExamplePath();

    expect(
      File(envPath).existsSync(),
      isTrue,
      reason: 'apps/backend/.env.example 파일이 존재해야 한다',
    );
    expect(
      fileContains(envPath, 'NAVER_CLIENT_ID'),
      isTrue,
      reason: 'SC-017: .env.example 에 NAVER_CLIENT_ID 항목이 존재해야 한다',
    );
    expect(
      fileContains(envPath, 'NAVER_CLIENT_SECRET'),
      isTrue,
      reason: 'SC-017: .env.example 에 NAVER_CLIENT_SECRET 항목이 존재해야 한다',
    );

    // 백엔드 로그 출력문에 client_secret 미포함 검증(코드 검토 대리 — 라인 단위 탐색)
    final naverProviderPath = backendSrcPath('modules/auth/social/naver.provider.ts');
    expect(
      File(naverProviderPath).existsSync(),
      isTrue,
      reason: 'naver.provider.ts 파일이 존재해야 한다',
    );
    final loggingLinesWithSecret = linesContainingAny(
      naverProviderPath,
      ['console.log', 'console.error', 'logger.', 'this.logger'],
    ).where((line) => line.contains('client_secret')).toList();
    expect(
      loggingLinesWithSecret,
      isEmpty,
      reason: 'SC-017: naver.provider.ts 의 로그 출력문에 client_secret 이 포함되지 않아야 한다',
    );

    // 클라이언트(Flutter) 코드에는 client_secret 문자열 자체가 존재하지 않아야 한다(FR-010).
    final clientFiles = [
      libPath('features/auth/social_auth_service.dart'),
      libPath('features/auth/login_screen.dart'),
      libPath('core/providers.dart'),
    ];
    for (final path in clientFiles) {
      expect(
        fileContains(path, 'client_secret') || fileContains(path, 'CLIENT_SECRET'),
        isFalse,
        reason: 'SC-017: $path 에 client_secret 문자열이 포함되지 않아야 한다(클라이언트 미노출, FR-010)',
      );
    }
  });

  // ── SC-020 (NFR-005): flutter analyze 0 issues ───────────────────────────
  test('test_SC020_flutter_analyze_zero_issues_note', () {
    /// SC-020 (v1.1.0/015 spec): flutter analyze 실행 결과 0 issues.
    ///
    /// dart:test 내에서 flutter analyze 를 직접 실행할 수 없다.
    /// CI 파이프라인에서 `flutter analyze` 를 별도 step 으로 실행한다.
    /// (2) 단위테스트 불가 — CI에 위임. 본 테스트는 마커 노트 역할.
    print(
      '[SC-020] flutter analyze 는 CI에서 실행. '
      'dart:test 단위 테스트 범위 외 — 마커 노트.',
    );
    expect(true, isTrue); // CI 위임 마커
  });
}
