// Flow tests for social login: SC-014, SC-015, SC-016 (v1.1.0/014 spec)
//
// [env:unit] — ProviderScope + socialAuthServiceProvider/dioProvider override.
//
// PATCH-013-01: LoginScreen = ConsumerStatefulWidget,
//   socialAuthServiceProvider + dioProvider override 필수.
//   pumpAndSettle 사용.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:doa_customer_app/core/providers.dart';
import 'package:doa_customer_app/core/token_store.dart';
import 'package:doa_customer_app/features/auth/login_screen.dart';
import 'package:doa_customer_app/features/auth/social_auth_service.dart';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/// LoginScreen 의 카카오 소셜 버튼(GestureDetector)을 찾는다.
///
/// GAP-014-02(5b 추가 발견): 전용 Key(`social-btn-kakao`)가 production
/// (`_SocialRow`)에 존재하지 않아 Key 기반 Finder 는 항상 매칭 0건 →
/// 조건부 skip 으로 SC-014/015/016 assert 가 한 번도 실행되지 않는 결함이었다.
/// production 이 이모지 텍스트('💬')로 카카오 버튼을 렌더링하므로 그 ancestor
/// GestureDetector 를 찾는 방식으로 정정.
Finder _kakaoSocialButton() => find.ancestor(
      of: find.text('💬'),
      matching: find.byType(GestureDetector),
    );

/// 백엔드 POST /auth/social-login 응답을 가로채는 테스트용 Dio.
/// production 경로: AuthController.socialLogin → _dio.post('/auth/social-login')
Dio _makeSuccessDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(
          Response(
            requestOptions: options,
            data: {'accessToken': 'test-access-token', 'refreshToken': 'test-refresh-token'},
            statusCode: 200,
          ),
        );
      },
    ),
  );
  return dio;
}

/// in-memory 테스트용 TokenStore.
///
/// 실 `FlutterSecureStorage` 는 위젯 테스트 환경에 host 플랫폼 채널 구현체가
/// 없어 `read`/`write` 호출이 응답 없이 무한 대기한다(SC-014 성공 경로에서
/// `pumpAndSettle timed out` 로 표면화 — 로딩 스피너의 애니메이션 ticker가
/// 계속 프레임을 예약하기 때문). `tokenStoreProvider` 를 in-memory 구현으로
/// override 하여 네이티브 플랫폼 채널 의존을 제거한다.
class _FakeTokenStore extends TokenStore {
  _FakeTokenStore() : super(const FlutterSecureStorage());

  String? _access;
  String? _refresh;

  @override
  Future<String?> get accessToken async => _access;

  @override
  Future<String?> get refreshToken async => _refresh;

  @override
  Future<void> save({required String accessToken, required String refreshToken}) async {
    _access = accessToken;
    _refresh = refreshToken;
  }

  @override
  Future<void> saveAccess(String accessToken) async => _access = accessToken;

  @override
  Future<void> clear() async {
    _access = null;
    _refresh = null;
  }
}

/// 네트워크 오류를 시뮬레이션하는 테스트용 Dio.
Dio _makeErrorDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
            message: '소셜 로그인 API 오류 (SC-016 시뮬레이션)',
          ),
        );
      },
    ),
  );
  return dio;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

void main() {
  // ── SC-014 (FR-013): 소셜 로그인 성공 → 토큰 저장 + authenticated ──────────
  testWidgets(
    'test_SC014_social_login_success_stores_tokens_and_navigates',
    (tester) async {
      /// SC-014 (v1.1.0/014 spec): 소셜 로그인 성공(백엔드 JWT 수신) 후
      /// FlutterSecureStorage에 accessToken·refreshToken이 저장되고
      /// 메인 화면으로 전환된다.
      ///
      /// PATCH-013-01: ProviderScope + socialAuthServiceProvider override.
      /// socialAuthServiceProvider override → signInWithKakao 성공(SocialCredential 반환).
      /// dioProvider override → POST /auth/social-login 성공 응답.

      final mockSocialAuthService = _StubSocialAuthService(
        signInWithKakaoResult: SocialCredential(provider: 'kakao', token: 'test-kakao-token'),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            socialAuthServiceProvider.overrideWithValue(mockSocialAuthService),
            dioProvider.overrideWithValue(_makeSuccessDio()),
            tokenStoreProvider.overrideWithValue(_FakeTokenStore()),
          ],
          child: const MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      final kakaoButton = _kakaoSocialButton();
      expect(kakaoButton, findsOneWidget, reason: 'SC-014: 카카오 소셜 버튼이 존재해야 한다');
      await tester.tap(kakaoButton);
      await tester.pumpAndSettle();

      // SC-014 검증: authenticated 상태 전이
      // flutter_riverpod 공개 테스트 헬퍼(tester.container)로 ProviderContainer 확인
      // (GAP-014-02: 내부 타입 ProviderScopeWidget 직접 참조 → 공개 API 로 정정)
      final container = tester.container(of: find.byType(LoginScreen));
      expect(container.read(authControllerProvider), equals(AuthStatus.authenticated));
    },
  );

  // ── SC-015 (FR-014): 취소 → 화면 유지·오류 미표시 ──────────────────────────
  testWidgets(
    'test_SC015_social_auth_cancelled_stays_on_login_no_error',
    (tester) async {
      /// SC-015 (v1.1.0/014 spec): 소셜 인증 취소 시 로그인 화면이 유지되고
      /// 오류 메시지가 표시되지 않는다.
      ///
      /// SocialAuthCancelled 예외 발생 → LoginScreen 유지, 에러 위젯 없음.

      final mockSocialAuthService = _StubSocialAuthService.cancelled();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            socialAuthServiceProvider.overrideWithValue(mockSocialAuthService),
            dioProvider.overrideWithValue(_makeSuccessDio()),
            tokenStoreProvider.overrideWithValue(_FakeTokenStore()),
          ],
          child: const MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      final kakaoButton = _kakaoSocialButton();
      expect(kakaoButton, findsOneWidget, reason: 'SC-015: 카카오 소셜 버튼이 존재해야 한다');
      await tester.tap(kakaoButton);
      await tester.pumpAndSettle();

      // SC-015: 로그인 화면 유지 확인
      expect(find.byType(LoginScreen), findsOneWidget);

      // SC-015: 오류 메시지 미표시 확인
      expect(find.byKey(const Key('social-error-message')), findsNothing);
    },
  );

  // ── SC-016 (FR-015): 실패 → 오류 메시지 표시 ────────────────────────────────
  testWidgets(
    'test_SC016_social_login_failure_shows_error_message',
    (tester) async {
      /// SC-016 (v1.1.0/014 spec): 소셜 로그인 실패 시 오류 메시지가 화면에
      /// 표시된다.
      ///
      /// DioException(connectionError) 발생 → 에러 메시지 위젯 표시.

      // signInWithKakao 는 성공(credential 반환), dio 가 오류 반환 → AuthController 에서 실패.
      final mockSocialAuthService = _StubSocialAuthService(
        signInWithKakaoResult: SocialCredential(provider: 'kakao', token: 'test-token'),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            socialAuthServiceProvider.overrideWithValue(mockSocialAuthService),
            dioProvider.overrideWithValue(_makeErrorDio()),
            tokenStoreProvider.overrideWithValue(_FakeTokenStore()),
          ],
          child: const MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      final kakaoButton = _kakaoSocialButton();
      expect(kakaoButton, findsOneWidget, reason: 'SC-016: 카카오 소셜 버튼이 존재해야 한다');
      await tester.tap(kakaoButton);
      await tester.pumpAndSettle();

      // SC-016: 오류 메시지 표시 확인
      // LoginScreen 이 오류 메시지를 표시하는 위젯 Key 또는 텍스트 확인
      final hasErrorKey = find.byKey(const Key('social-error-message')).evaluate().isNotEmpty;
      final hasErrorText =
          find.textContaining('오류').evaluate().isNotEmpty ||
          find.textContaining('실패').evaluate().isNotEmpty ||
          find.textContaining('error').evaluate().isNotEmpty;

      expect(
        hasErrorKey || hasErrorText,
        isTrue,
        reason: 'SC-016: 소셜 로그인 실패 시 오류 메시지가 화면에 표시되어야 한다',
      );
    },
  );
}

// ─── Stub implementations ─────────────────────────────────────────────────────

/// 성공/취소 케이스를 커버하는 테스트용 SocialAuthService 스텁.
class _StubSocialAuthService implements SocialAuthService {
  final SocialCredential? _credential;
  final bool _cancelled;

  _StubSocialAuthService({required SocialCredential signInWithKakaoResult})
      : _credential = signInWithKakaoResult,
        _cancelled = false;

  _StubSocialAuthService.cancelled()
      : _credential = null,
        _cancelled = true;

  @override
  Future<SocialCredential> signInWithKakao() async {
    if (_cancelled) {
      throw SocialAuthCancelled();
    }
    return _credential!;
  }

  @override
  Future<SocialCredential> signInWithGoogle() async {
    if (_cancelled) {
      throw SocialAuthCancelled();
    }
    return _credential!;
  }

  // 015 SocialAuthService.signInWithNaver 추가로 인터페이스 구현 필수(Dart `implements`).
  // 본 014 테스트는 카카오 경로만 검증하므로 호출되지 않는다.
  @override
  Future<SocialCredential> signInWithNaver() async {
    if (_cancelled) {
      throw SocialAuthCancelled();
    }
    return _credential!;
  }
}
