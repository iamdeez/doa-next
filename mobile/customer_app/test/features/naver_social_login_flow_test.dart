// Flow tests for naver social login: SC-013, SC-014, SC-015 (v1.1.0/015 spec)
//
// [env:unit] — ProviderScope + socialAuthServiceProvider/dioProvider/tokenStoreProvider override.
//
// PATCH-013-01: LoginScreen = ConsumerStatefulWidget,
//   socialAuthServiceProvider + dioProvider + tokenStoreProvider override 필수.
//   pumpAndSettle 사용.
//
// PROC-014-03: 네이버 버튼 Finder 는 실제 렌더 텍스트('N') 기반 하드 assert.
//   `if (finder.isEmpty) markTestSkipped` 조건부 skip anti-pattern 금지(GAP-014-02 재발 방지).
//   FlutterSecureStorage 플랫폼 채널 의존은 tokenStoreProvider 를 _FakeTokenStore 로 override.

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

/// LoginScreen 의 네이버 소셜 버튼(GestureDetector)을 찾는다.
///
/// PROC-014-03(3): 전용 Key 가 production(`_SocialRow`)에 존재하지 않으므로,
/// production 이 텍스트('N')로 네이버 버튼을 렌더링하는 전제(tasks.md T-C3)에
/// 따라 그 ancestor GestureDetector 를 찾는 방식으로 하드 assert 한다.
/// `isEmpty` 조건부 skip 은 사용하지 않는다(GAP-014-02 재발 방지).
Finder _naverSocialButton() => find.ancestor(
      of: find.text('N'),
      matching: find.byType(GestureDetector),
    );

/// 백엔드 POST /auth/social-login 응답을 가로채는 테스트용 Dio(성공).
Dio _makeSuccessDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(
          Response(
            requestOptions: options,
            data: {
              'accessToken': 'naver-test-access-token',
              'refreshToken': 'naver-test-refresh-token',
            },
            statusCode: 200,
          ),
        );
      },
    ),
  );
  return dio;
}

/// 네트워크/제공자 오류를 시뮬레이션하는 테스트용 Dio.
Dio _makeErrorDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
            message: '네이버 소셜 로그인 API 오류 (SC-014 시뮬레이션)',
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
/// 없어 `read`/`write` 호출이 응답 없이 무한 대기한다(`pumpAndSettle timed out`
/// 로 표면화). `tokenStoreProvider` 를 in-memory 구현으로 override 하여 네이티브
/// 플랫폼 채널 의존을 제거한다(PROC-014-03(2)).
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

/// 네이버 흐름을 커버하는 테스트용 SocialAuthService 스텁.
/// signInWithKakao/Google 은 본 파일 시나리오에서 호출되지 않는다(네이버 버튼만 탭).
class _StubSocialAuthService implements SocialAuthService {
  final SocialCredential? _naverCredential;
  final bool _cancelled;

  _StubSocialAuthService({required SocialCredential signInWithNaverResult})
      : _naverCredential = signInWithNaverResult,
        _cancelled = false;

  _StubSocialAuthService.cancelled()
      : _naverCredential = null,
        _cancelled = true;

  @override
  Future<SocialCredential> signInWithKakao() async =>
      const SocialCredential(provider: 'kakao', token: 'unused-kakao-token');

  @override
  Future<SocialCredential> signInWithGoogle() async =>
      const SocialCredential(provider: 'google', token: 'unused-google-token');

  @override
  Future<SocialCredential> signInWithNaver() async {
    if (_cancelled) {
      throw SocialAuthCancelled('naver');
    }
    return _naverCredential!;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

void main() {
  // ── SC-013 (FR-011): 취소 → 화면 유지·오류 미표시 ──────────────────────────
  testWidgets(
    'test_SC013_naver_cancelled_stays_no_error',
    (tester) async {
      /// SC-013 (v1.1.0/015 spec): 네이버 인증 취소 시 로그인 화면이 유지되고
      /// 오류 메시지가 표시되지 않는다.
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

      final naverButton = _naverSocialButton();
      expect(naverButton, findsOneWidget, reason: 'SC-013: 네이버 소셜 버튼이 존재해야 한다');
      await tester.tap(naverButton);
      await tester.pumpAndSettle();

      // SC-013: 로그인 화면 유지 확인
      expect(find.byType(LoginScreen), findsOneWidget);

      // SC-013: 오류 메시지 미표시 확인
      expect(find.byKey(const Key('social-error-message')), findsNothing);
      expect(find.textContaining('실패'), findsNothing);
    },
  );

  // ── SC-014 (FR-012): 실패(4xx/네트워크) → 오류 메시지 표시 ─────────────────
  testWidgets(
    'test_SC014_naver_failure_shows_error',
    (tester) async {
      /// SC-014 (v1.1.0/015 spec): 네이버 소셜 로그인 실패(제공자 오류·네트워크
      /// 오류·code 교환 실패·이메일 미반환 등) 시 오류 메시지가 화면에 표시된다.
      // signInWithNaver 는 성공(credential 반환), dio 가 오류 반환 → AuthController 에서 실패.
      final mockSocialAuthService = _StubSocialAuthService(
        signInWithNaverResult: const SocialCredential(
          provider: 'naver',
          token: 'test-naver-code',
          state: 'test-state',
        ),
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

      final naverButton = _naverSocialButton();
      expect(naverButton, findsOneWidget, reason: 'SC-014: 네이버 소셜 버튼이 존재해야 한다');
      await tester.tap(naverButton);
      await tester.pumpAndSettle();

      final hasErrorKey = find.byKey(const Key('social-error-message')).evaluate().isNotEmpty;
      final hasErrorText =
          find.textContaining('오류').evaluate().isNotEmpty ||
          find.textContaining('실패').evaluate().isNotEmpty ||
          find.textContaining('error').evaluate().isNotEmpty;

      expect(
        hasErrorKey || hasErrorText,
        isTrue,
        reason: 'SC-014: 네이버 소셜 로그인 실패 시 오류 메시지가 화면에 표시되어야 한다',
      );
    },
  );

  // ── SC-015 (FR-013): 성공 → TokenStore 저장 + authenticated 전이 ──────────
  testWidgets(
    'test_SC015_naver_success_stores_tokens_navigates',
    (tester) async {
      /// SC-015 (v1.1.0/015 spec): 네이버 소셜 로그인 성공(백엔드 JWT 수신) 후
      /// FlutterSecureStorage 에 accessToken·refreshToken 이 저장되고 메인
      /// 화면(authenticated 상태)으로 전환된다.
      final mockSocialAuthService = _StubSocialAuthService(
        signInWithNaverResult: const SocialCredential(
          provider: 'naver',
          token: 'test-naver-code',
          state: 'test-state',
        ),
      );
      final fakeTokenStore = _FakeTokenStore();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            socialAuthServiceProvider.overrideWithValue(mockSocialAuthService),
            dioProvider.overrideWithValue(_makeSuccessDio()),
            tokenStoreProvider.overrideWithValue(fakeTokenStore),
          ],
          child: const MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      final naverButton = _naverSocialButton();
      expect(naverButton, findsOneWidget, reason: 'SC-015: 네이버 소셜 버튼이 존재해야 한다');
      await tester.tap(naverButton);
      await tester.pumpAndSettle();

      // SC-015 검증: authenticated 상태 전이
      final container = tester.container(of: find.byType(LoginScreen));
      expect(container.read(authControllerProvider), equals(AuthStatus.authenticated));

      // SC-015 검증: TokenStore 저장
      expect(await fakeTokenStore.accessToken, equals('naver-test-access-token'));
      expect(await fakeTokenStore.refreshToken, equals('naver-test-refresh-token'));
    },
  );
}
