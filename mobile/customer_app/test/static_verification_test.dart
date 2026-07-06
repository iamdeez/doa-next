// static_verification_test.dart — [env:static]
//
// T020: Flutter 정적 검증
// 대상 SC: SC-002, SC-005, SC-009, SC-010, SC-011, SC-013, SC-026
//
// 검증 방식:
//   - dart:io 파일 존재 확인 (SC-002: CategoryScreen, SC-005: 라우트, SC-009: kSupportEmail 상수)
//   - 파일 내 심볼 포함 여부 (grep 대용)
//   - flutter analyze 는 CI 에서 수행; 여기서는 파일 구조·심볼 존재를 단위 검증
//
// 주의 (AUTHORING — TDD Red):
//   - 검증 대상 파일이 미구현 상태이면 테스트 실패 허용.
//   - Production 파일 경로 확인 목적 (contract 검증).

import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

/// 프로젝트 루트에서 lib/ 기준 경로 반환
/// (테스트는 mobile/customer_app/ 에서 실행 가정)
String libPath(String relativePath) {
  return p.join(Directory.current.path, 'lib', relativePath);
}

/// 파일 내 특정 문자열 포함 여부 확인
bool fileContains(String filePath, String searchString) {
  final file = File(filePath);
  if (!file.existsSync()) return false;
  return file.readAsStringSync().contains(searchString);
}

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

void main() {
  group('Static Verification — Flutter 파일 구조 (T020)', () {
    // ─────────────────────────────────────────────
    // SC-002: CategoryScreen 파일 존재
    // ─────────────────────────────────────────────
    test(
      'test_category_screen_file_exists — '
      'SC-002: features/category/category_screen.dart 파일 존재',
      () {
        // SC-002: CategoryScreen 구현 파일이 존재해야 함.
        final path = libPath('features/category/category_screen.dart');
        expect(
          File(path).existsSync(),
          isTrue,
          reason: 'SC-002: $path 파일이 존재해야 함',
        );
      },
    );

    // ─────────────────────────────────────────────
    // SC-005: 라우터 파일 존재 + 주요 라우트 정의
    // ─────────────────────────────────────────────
    test(
      'test_router_file_exists — '
      'SC-005: core/router.dart 또는 app_router.dart 파일 존재',
      () {
        // SC-005: 라우터 파일이 존재해야 함 (go_router 또는 Navigator 라우트 정의).
        final candidates = [
          libPath('core/router.dart'),
          libPath('core/app_router.dart'),
          libPath('app/router.dart'),
          libPath('router.dart'),
        ];
        final anyExists = candidates.any((p) => File(p).existsSync());
        expect(
          anyExists,
          isTrue,
          reason: 'SC-005: 라우터 파일(router.dart 또는 app_router.dart)이 존재해야 함',
        );
      },
    );

    // ─────────────────────────────────────────────
    // SC-009: kSupportEmail 상수 정의 존재
    // ─────────────────────────────────────────────
    test(
      'test_support_email_constant_exists — '
      'SC-009: kSupportEmail 상수가 app_config.dart 또는 constants.dart 에 정의됨',
      () {
        // SC-009: 1:1 문의 이메일 주소가 kSupportEmail 상수로 정의되어야 함.
        final candidates = [
          libPath('core/app_config.dart'),
          libPath('core/constants.dart'),
          libPath('constants.dart'),
          libPath('config/app_config.dart'),
        ];
        final foundInAny = candidates.any(
          (path) => fileContains(path, 'kSupportEmail'),
        );
        expect(
          foundInAny,
          isTrue,
          reason: 'SC-009: kSupportEmail 상수가 정의된 파일이 존재해야 함',
        );
      },
    );

    // ─────────────────────────────────────────────
    // SC-010: FaqScreen 파일 존재
    // ─────────────────────────────────────────────
    test(
      'test_faq_screen_file_exists — '
      'SC-010: features/support/faq_screen.dart 파일 존재',
      () {
        // SC-010: FaqScreen 구현 파일이 존재해야 함.
        final path = libPath('features/support/faq_screen.dart');
        expect(
          File(path).existsSync(),
          isTrue,
          reason: 'SC-010: $path 파일이 존재해야 함',
        );
      },
    );

    // ─────────────────────────────────────────────
    // SC-011: NoticeScreen 파일 존재
    // ─────────────────────────────────────────────
    test(
      'test_notice_screen_file_exists — '
      'SC-011: features/support/notice_screen.dart 파일 존재',
      () {
        // SC-011: NoticeScreen 구현 파일이 존재해야 함.
        final path = libPath('features/support/notice_screen.dart');
        expect(
          File(path).existsSync(),
          isTrue,
          reason: 'SC-011: $path 파일이 존재해야 함',
        );
      },
    );

    // ─────────────────────────────────────────────
    // SC-013: MileageScreen 파일 존재
    // ─────────────────────────────────────────────
    test(
      'test_mileage_screen_file_exists — '
      'SC-013: features/mypage/mileage_screen.dart 파일 존재',
      () {
        // SC-013: MileageScreen 구현 파일이 존재해야 함.
        final path = libPath('features/mypage/mileage_screen.dart');
        expect(
          File(path).existsSync(),
          isTrue,
          reason: 'SC-013: $path 파일이 존재해야 함',
        );
      },
    );

    // ─────────────────────────────────────────────
    // SC-026: NotificationSettingsScreen + SharedPreferences 의존 확인
    // ─────────────────────────────────────────────
    test(
      'test_notification_screen_file_exists — '
      'SC-026: features/notification/notification_settings_screen.dart 파일 존재',
      () {
        // SC-026: NotificationSettingsScreen 구현 파일이 존재해야 함.
        final path = libPath(
            'features/notification/notification_settings_screen.dart');
        expect(
          File(path).existsSync(),
          isTrue,
          reason: 'SC-026: $path 파일이 존재해야 함',
        );
      },
    );

    test(
      'test_pubspec_has_shared_preferences — '
      'SC-026 보조: pubspec.yaml 에 shared_preferences 의존성 포함',
      () {
        // SC-026: SharedPreferences 사용을 위해 pubspec.yaml 에 의존성이 있어야 함.
        final pubspecPath =
            p.join(Directory.current.path, 'pubspec.yaml');
        final pubspecContent = File(pubspecPath).readAsStringSync();
        expect(
          pubspecContent.contains('shared_preferences'),
          isTrue,
          reason: 'SC-026: pubspec.yaml 에 shared_preferences 의존성이 있어야 함',
        );
      },
    );

    test(
      'test_pubspec_has_url_launcher — '
      'SC-008 보조: pubspec.yaml 에 url_launcher 의존성 포함',
      () {
        // SC-008: url_launcher 사용을 위해 pubspec.yaml 에 의존성이 있어야 함.
        final pubspecPath =
            p.join(Directory.current.path, 'pubspec.yaml');
        final pubspecContent = File(pubspecPath).readAsStringSync();
        expect(
          pubspecContent.contains('url_launcher'),
          isTrue,
          reason: 'SC-008: pubspec.yaml 에 url_launcher 의존성이 있어야 함',
        );
      },
    );
  });
}
