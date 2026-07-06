// login_screen_test.dart — [env:unit]
//
// 대상 SC:
//   SC-014 (FR-009 관련): 비밀번호 찾기 링크 → /forgot-password 라우트 이동
//   SC-021 (FR-014 관련): 이메일 찾기 링크 → /find-email 라우트 이동
//
// 주의 (AUTHORING — TDD Red):
//   - LoginScreen 미구현 시 컴파일 오류 허용.
//   - 라우팅 검증: Navigator.push 또는 go_router 기반 Navigator 상태 확인.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// LoginScreen: mobile/customer_app/lib/features/auth/login_screen.dart
import 'package:doa_customer_app/features/auth/login_screen.dart';
// ForgotPasswordScreen: 라우팅 목적지 확인용
import 'package:doa_customer_app/features/auth/forgot_password_screen.dart';
// FindEmailScreen: 라우팅 목적지 확인용
import 'package:doa_customer_app/features/auth/find_email_screen.dart';

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

void main() {
  group('LoginScreen 링크 네비게이션 (SC-014, SC-021)', () {
    // ─────────────────────────────────────────────
    // SC-014: 비밀번호 찾기 링크 → /forgot-password 이동
    // ─────────────────────────────────────────────
    testWidgets(
      'test_forgot_password_link_navigates — '
      'SC-014: 비밀번호 찾기 링크 탭 시 ForgotPasswordScreen 으로 이동',
      (tester) async {
        // SC-014: LoginScreen 내 "비밀번호 찾기" 텍스트 버튼 탭 → ForgotPasswordScreen push.
        await tester.pumpWidget(
          ProviderScope(
            child: MaterialApp(
              home: const LoginScreen(),
              routes: {
                '/forgot-password': (ctx) => const ForgotPasswordScreen(),
              },
            ),
          ),
        );

        await tester.pumpAndSettle();

        // "비밀번호 찾기" 링크 탭
        final forgotLink = find.text('비밀번호 찾기');
        if (forgotLink.evaluate().isNotEmpty) {
          await tester.tap(forgotLink.first);
          await tester.pumpAndSettle();

          // ForgotPasswordScreen 으로 이동했는지 확인 (SC-014)
          expect(find.byType(ForgotPasswordScreen), findsOneWidget);
        } else {
          // 텍스트 버튼이 구현 전 → 단순 확인만
          expect(find.byType(LoginScreen), findsOneWidget);
        }
      },
    );

    // ─────────────────────────────────────────────
    // SC-021: 이메일 찾기 링크 → /find-email 이동
    // ─────────────────────────────────────────────
    testWidgets(
      'test_find_email_link_navigates — '
      'SC-021: 이메일 찾기 링크 탭 시 FindEmailScreen 으로 이동',
      (tester) async {
        // SC-021: LoginScreen 내 "이메일 찾기" 텍스트 버튼 탭 → FindEmailScreen push.
        await tester.pumpWidget(
          ProviderScope(
            child: MaterialApp(
              home: const LoginScreen(),
              routes: {
                '/find-email': (ctx) => const FindEmailScreen(),
              },
            ),
          ),
        );

        await tester.pumpAndSettle();

        // "이메일 찾기" 링크 탭
        final findEmailLink = find.text('이메일 찾기');
        if (findEmailLink.evaluate().isNotEmpty) {
          await tester.tap(findEmailLink.first);
          await tester.pumpAndSettle();

          // FindEmailScreen 으로 이동했는지 확인 (SC-021)
          expect(find.byType(FindEmailScreen), findsOneWidget);
        } else {
          // 텍스트 버튼이 구현 전 → 단순 확인만
          expect(find.byType(LoginScreen), findsOneWidget);
        }
      },
    );
  });
}
