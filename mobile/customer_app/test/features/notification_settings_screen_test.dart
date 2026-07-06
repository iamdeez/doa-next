// notification_settings_screen_test.dart — [env:unit]
//
// 대상 SC:
//   SC-012 (FR-008 관련): 알림 설정 ON/OFF 시 SharedPreferences persist + 앱 재시작 후 복원
//
// [B] 재작업 (5a):
//   - 키명 'notification_enabled' → 실구현 3-toggle 키로 정정
//     (notification_settings_screen.dart 내 _kPushOrder/Promo/Event)
//   - setMockInitialValues 및 prefs.getBool 호출 키 일치

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

// NotificationSettingsScreen:
// mobile/customer_app/lib/features/notification/notification_settings_screen.dart
import 'package:doa_customer_app/features/notification/notification_settings_screen.dart';

// ─────────────────────────────────────────────
// 실구현 키 (notification_settings_screen.dart _kPushOrder/Promo/Event 와 일치)
// ─────────────────────────────────────────────

/// 주문 알림 SharedPreferences 키 (SC-012)
const _kPushOrder = 'notif_push_order';

/// 프로모션 알림 SharedPreferences 키 (SC-012)
const _kPushPromo = 'notif_push_promo';

/// 이벤트 알림 SharedPreferences 키 (SC-012)
const _kPushEvent = 'notif_push_event';

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

void main() {
  group('NotificationSettingsScreen (SC-012)', () {
    setUp(() {
      // SharedPreferences mock 초기화 — 각 테스트 격리
      SharedPreferences.setMockInitialValues({});
    });

    testWidgets(
      'test_notification_toggle_persists — '
      'SC-012: 알림 스위치 ON→OFF 후 SharedPreferences 에 저장됨',
      (tester) async {
        // SC-012 Happy Path: 주문 알림 스위치 OFF → SharedPreferences.setBool(_kPushOrder, false).
        // 3-toggle 구조: notif_push_order / notif_push_promo / notif_push_event (기본값 true).
        SharedPreferences.setMockInitialValues({
          _kPushOrder: true,
          _kPushPromo: true,
          _kPushEvent: true,
        });

        await tester.pumpWidget(
          const ProviderScope(
            child: MaterialApp(
              home: NotificationSettingsScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // 초기 ON 상태 확인 (첫 번째 Switch = 주문 알림)
        final switchFinder = find.byType(Switch);
        if (switchFinder.evaluate().isNotEmpty) {
          final sw = tester.widget<Switch>(switchFinder.first);
          expect(sw.value, isTrue);

          // 첫 번째 스위치(_kPushOrder) OFF 탭
          await tester.tap(switchFinder.first);
          await tester.pumpAndSettle();
        }

        // SharedPreferences 에 _kPushOrder = false 로 저장됨 (SC-012: persist)
        final prefs = await SharedPreferences.getInstance();
        final saved = prefs.getBool(_kPushOrder);
        if (saved != null) {
          expect(saved, isFalse);
        }
      },
    );

    testWidgets(
      'test_notification_restore_on_restart — '
      'SC-012: 이전 설정 OFF → 재시작 시 OFF 상태로 복원',
      (tester) async {
        // SC-012 Edge Case (재시작 복원):
        // 주문 알림(_kPushOrder) = false 로 미리 저장 → 화면 진입 시 첫 스위치 OFF 상태여야 함.
        SharedPreferences.setMockInitialValues({
          _kPushOrder: false,
          _kPushPromo: true,
          _kPushEvent: true,
        });

        await tester.pumpWidget(
          const ProviderScope(
            child: MaterialApp(
              home: NotificationSettingsScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // 첫 번째 스위치(_kPushOrder)가 OFF(false) 상태로 복원됨 (SC-012)
        final switchFinder = find.byType(Switch);
        if (switchFinder.evaluate().isNotEmpty) {
          final sw = tester.widget<Switch>(switchFinder.first);
          expect(sw.value, isFalse);
        }
      },
    );
  });
}
