// notice_screen_test.dart — [env:unit]
//
// 대상 SC:
//   SC-011 (FR-007 관련): 공지사항 화면 진입 시 콘텐츠 표시
//
// [B] 재작업 (5a, 2회차):
//   - NoticeScreen 은 ConsumerWidget(ref.watch(noticeProvider)) — ProviderScope 필요
//   - noticeProvider 는 FutureProvider(정적 데이터) — override 불필요, pumpAndSettle() 후 항목 표시
//   - noticeProvider 정적 데이터 ≥1건 확인 (SC-011 커버리지 확보)

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// NoticeScreen: mobile/customer_app/lib/features/support/notice_screen.dart
import 'package:doa_customer_app/features/support/notice_screen.dart';

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

void main() {
  group('NoticeScreen (SC-011)', () {
    testWidgets(
      'test_notice_shows_title — '
      'SC-011: 공지사항 화면 진입 시 콘텐츠(항목 ≥1) 표시',
      (tester) async {
        // SC-011: NoticeScreen 은 ConsumerWidget(ref.watch(noticeProvider)) 이므로 ProviderScope 필요.
        // noticeProvider 는 FutureProvider(정적 목록 반환) — pumpAndSettle() 로 async 완료 대기.
        // 정적 데이터 2건 중 첫 번째 공지 "서비스 오픈 안내" 존재 확인(항목 ≥1).
        await tester.pumpWidget(
          const ProviderScope(child: MaterialApp(home: NoticeScreen())),
        );
        await tester.pumpAndSettle();

        // 항목 ≥1건 확인 (SC-011)
        expect(find.text('서비스 오픈 안내'), findsAtLeastNWidgets(1));
      },
    );

    testWidgets(
      'test_notice_renders_without_exception — '
      'SC-011 Edge: 공지사항 화면 렌더 시 예외 없음',
      (tester) async {
        // SC-011 Edge: NoticeScreen 정상 렌더 (런타임 오류 없음).
        // ProviderScope 로 감싸 ConsumerWidget 렌더 가능하게 함 — [B] 수정
        await tester.pumpWidget(
          const ProviderScope(child: MaterialApp(home: NoticeScreen())),
        );
        await tester.pumpAndSettle();

        // 오류 없이 렌더됨
        expect(tester.takeException(), isNull);
      },
    );
  });
}
