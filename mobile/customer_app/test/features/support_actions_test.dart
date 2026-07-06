// support_actions_test.dart — [env:unit]
//
// 대상 SC:
//   SC-008 (FR-005 관련): 1:1 문의 항목 선택 시 kSupportEmail 을 수신처로 한 이메일 앱 실행
//
// [B] 재작업 (5a):
//   - import app_config.dart → constants.dart (kSupportEmail 위치)
//   - launchSupportEmail → openSupportEmail(BuildContext) (실구현 심볼)
//   - test() → testWidgets(): openSupportEmail 이 BuildContext 를 필요로 함

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

// openSupportEmail: mobile/customer_app/lib/features/support/support_actions.dart
import 'package:doa_customer_app/features/support/support_actions.dart';
// kSupportEmail: mobile/customer_app/lib/core/constants.dart
import 'package:doa_customer_app/core/constants.dart';

// ─────────────────────────────────────────────
// url_launcher Mock
// ─────────────────────────────────────────────

class _MockUrlLauncher extends Fake
    with MockPlatformInterfaceMixin
    implements UrlLauncherPlatform {
  String? lastLaunchedUrl;
  bool returnValue;

  _MockUrlLauncher({this.returnValue = true});

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    lastLaunchedUrl = url;
    return returnValue;
  }

  @override
  Future<bool> canLaunchUrl(String url) async => returnValue;

  // url_launcher 내부가 legacy canLaunch(String) 을 호출하므로 override 필수 — [B] 수정
  @override
  Future<bool> canLaunch(String url) async => returnValue;

  @override
  Future<void> closeWebView() async {}
}

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

void main() {
  group('support_actions (SC-008)', () {
    late _MockUrlLauncher mockLauncher;

    setUp(() {
      mockLauncher = _MockUrlLauncher(returnValue: true);
      UrlLauncherPlatform.instance = mockLauncher;
    });

    testWidgets(
      'test_support_launches_mailto — '
      'SC-008: openSupportEmail 호출 시 kSupportEmail 을 수신처로 한 mailto URI 실행',
      (tester) async {
        // SC-008: 1:1 문의하기 → openSupportEmail(context) → launchUrl(mailto:kSupportEmail).
        // openSupportEmail(BuildContext) 시그니처로 BuildContext 필요 → testWidgets + Builder 사용.
        BuildContext? capturedCtx;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Builder(builder: (ctx) {
                capturedCtx = ctx;
                return const SizedBox();
              }),
            ),
          ),
        );

        await openSupportEmail(capturedCtx!);

        // launchUrl 이 호출되었는지 확인
        expect(mockLauncher.lastLaunchedUrl, isNotNull);

        // mailto scheme 확인
        expect(mockLauncher.lastLaunchedUrl, contains('mailto'));

        // kSupportEmail 상수가 URI 에 포함되어 있는지 확인 (SC-008 + SC-009)
        expect(mockLauncher.lastLaunchedUrl, contains(kSupportEmail));
      },
    );

    testWidgets(
      'test_support_mailto_failure_fallback — '
      'SC-008 보조: launchUrl 실패 시 예외가 전파되지 않음 (SnackBar 안내로 처리)',
      (tester) async {
        // 실패 케이스: canLaunchUrl → false → else 분기 → SnackBar 안내.
        // 예외 없이 완료되어야 함.
        // ScaffoldMessenger 필요로 Scaffold + MaterialApp 으로 감쌈.
        final failLauncher = _MockUrlLauncher(returnValue: false);
        UrlLauncherPlatform.instance = failLauncher;

        BuildContext? capturedCtx;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Builder(builder: (ctx) {
                capturedCtx = ctx;
                return const SizedBox();
              }),
            ),
          ),
        );

        // 예외 없이 완료해야 함
        await expectLater(openSupportEmail(capturedCtx!), completes);
        await tester.pumpAndSettle();
      },
    );
  });
}
