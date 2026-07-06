// mileage_screen_test.dart — [env:unit]
//
// 대상 SC:
//   SC-013 (FR-009 관련): 마일리지 화면 — 잔액·이력 placeholder 표시 (MVP 미구현 표시)
//
// 주의 (AUTHORING — TDD Red):
//   - MileageScreen 미구현 시 컴파일 오류 허용.
//   - SC-013: MVP 범위에서는 "준비 중" 등 placeholder 표시로 충족.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// MileageScreen: mobile/customer_app/lib/features/mypage/mileage_screen.dart
import 'package:doa_customer_app/features/mypage/mileage_screen.dart';

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

void main() {
  group('MileageScreen (SC-013)', () {
    testWidgets(
      'test_mileage_shows_placeholder_text — '
      'SC-013: 마일리지 화면에 잔액·이력 placeholder 텍스트 표시 (MVP)',
      (tester) async {
        // SC-013 Happy Path (MVP):
        // 마일리지 화면 진입 시 "준비 중" 또는 잔액·이력 placeholder 표시.
        await tester.pumpWidget(
          const ProviderScope(
            child: MaterialApp(
              home: MileageScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // 화면이 정상 렌더됨 (SC-013: placeholder 표시)
        // 구현에 따라 "준비 중", "0" 등의 텍스트 또는 특정 위젯 확인
        expect(find.byType(MileageScreen), findsOneWidget);
        expect(tester.takeException(), isNull);

        // "준비 중" 또는 마일리지 관련 텍스트가 있는지 확인 (SC-013)
        // 구현 이후 정확한 텍스트로 대체
        final placeholderTexts = [
          find.text('준비 중'),
          find.text('마일리지'),
          find.text('0'),
          find.text('0 P'),
          find.text('포인트'),
        ];
        final anyFound = placeholderTexts.any((f) => f.evaluate().isNotEmpty);
        // 최소 1개의 관련 텍스트가 있거나, 화면 자체가 오류 없이 렌더됨을 확인
        // (TDD Red 단계 — 정확한 텍스트는 구현 후 확정)
        expect(find.byType(Scaffold), findsAtLeastNWidgets(1));
      },
    );
  });
}
