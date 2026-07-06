// faq_screen_test.dart — [env:unit]
//
// 대상 SC:
//   SC-010 (FR-006 관련): FAQ 화면 진입 시 콘텐츠 표시
//
// [B] 재작업 (5a, 2회차):
//   - FaqScreen 은 ConsumerWidget(ref.watch(faqProvider)) — ProviderScope 필요
//   - faqProvider 는 FutureProvider(정적 데이터) — override 불필요, pumpAndSettle() 후 항목 표시
//   - faqProvider 정적 데이터 ≥1건 확인 (SC-010 커버리지 확보)

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// FaqScreen: mobile/customer_app/lib/features/support/faq_screen.dart
import 'package:doa_customer_app/features/support/faq_screen.dart';

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

void main() {
  group('FaqScreen (SC-010)', () {
    testWidgets(
      'test_faq_has_items — '
      'SC-010: FAQ 화면 진입 시 콘텐츠(항목 ≥1) 표시',
      (tester) async {
        // SC-010: FaqScreen 은 ConsumerWidget(ref.watch(faqProvider)) 이므로 ProviderScope 필요.
        // faqProvider 는 FutureProvider(정적 목록 반환) — pumpAndSettle() 로 async 완료 대기.
        // 정적 데이터 3건 중 첫 번째 항목 텍스트 "배송은 얼마나 걸리나요?" 존재 확인(항목 ≥1).
        await tester.pumpWidget(
          const ProviderScope(child: MaterialApp(home: FaqScreen())),
        );
        await tester.pumpAndSettle();

        // 항목 ≥1건 확인 (SC-010)
        expect(find.text('배송은 얼마나 걸리나요?'), findsAtLeastNWidgets(1));
      },
    );

    testWidgets(
      'test_faq_renders_without_exception — '
      'SC-010 Edge: FAQ 화면 렌더 시 예외 없음',
      (tester) async {
        // SC-010 Edge: FaqScreen 정상 렌더 (런타임 오류 없음).
        // ProviderScope 로 감싸 ConsumerWidget 렌더 가능하게 함 — [B] 수정
        await tester.pumpWidget(
          const ProviderScope(child: MaterialApp(home: FaqScreen())),
        );
        await tester.pumpAndSettle();

        // 오류 없이 렌더됨
        expect(tester.takeException(), isNull);
      },
    );
  });
}
