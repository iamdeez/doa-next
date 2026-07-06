// mypage_screen_test.dart — [env:unit]
//
// 대상 SC:
//   SC-004 (FR-003 관련): MyPageScreen 표시 시 GET /auth/me API 호출 + 이름·이메일 렌더
//
// 주의 (AUTHORING — TDD Red):
//   - MyPageScreen, authMeProvider 미구현 시 컴파일 오류 허용.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// MyPageScreen: mobile/customer_app/lib/features/mypage/mypage_screen.dart
import 'package:doa_customer_app/features/mypage/mypage_screen.dart';
// authMeProvider: mobile/customer_app/lib/core/providers.dart
import 'package:doa_customer_app/core/providers.dart';

// ─────────────────────────────────────────────
// Mock 데이터
// ─────────────────────────────────────────────

/// GET /auth/me mock 응답
final Map<String, dynamic> _mockAuthMe = {
  'id': 'user-001',
  'email': 'testuser@example.com',
  'name': '테스트 유저',
  'isAdmin': false,
  'createdAt': '2026-01-01T00:00:00.000Z',
};

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

void main() {
  group('MyPageScreen (SC-004)', () {
    testWidgets(
      'test_mypage_shows_profile — '
      'SC-004: authMeProvider 응답의 name·email이 화면에 표시됨',
      (tester) async {
        // SC-004: MyPageScreen 표시 시 GET /auth/me 응답의 name·email 렌더.
        // authMeProvider 를 mock 응답으로 override.
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              authMeProvider.overrideWith(
                (ref) async => _mockAuthMe,
              ),
            ],
            child: const MaterialApp(
              home: MyPageScreen(),
            ),
          ),
        );

        await tester.pump();
        await tester.pumpAndSettle();

        // 이름 표시 확인 (SC-004)
        expect(find.text('테스트 유저'), findsOneWidget);
        // 이메일 표시 확인 (SC-004)
        expect(find.text('testuser@example.com'), findsOneWidget);
      },
    );
  });
}
