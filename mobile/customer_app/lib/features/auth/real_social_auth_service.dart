import 'package:dio/dio.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';

import 'social_auth_service.dart';

/// 실 소셜 로그인 구현체 — 카카오·구글 SDK + 네이버 code-exchange(시스템 브라우저).
///
/// 배선 전제(운영 셋업, docs/ops/social-login-setup.md 파트 3 참조):
///   1. `flutter pub get` (pubspec 에 kakao_flutter_sdk_user·google_sign_in·flutter_web_auth_2 추가됨)
///   2. main() 에서 `KakaoSdk.init(nativeAppKey: ...)` 호출
///   3. iOS Info.plist / Android manifest 에 네이버 콜백 커스텀 스킴 등록
///   4. 실행 시 dart-define 로 크레덴셜 주입:
///      --dart-define=NAVER_CLIENT_ID=xxx
///      --dart-define=NAVER_CALLBACK_SCHEME=doacustomer
///      --dart-define=GOOGLE_SERVER_CLIENT_ID=xxx.apps.googleusercontent.com
///
/// 반환 계약(백엔드 SocialAuthService 3단계 계정해석과 정합):
///   - kakao : SocialCredential(token = access_token)          — 백엔드가 kapi.kakao.com 로 검증
///   - google: SocialCredential(token = id_token)              — 백엔드가 aud/email_verified 검증
///   - naver : SocialCredential(token = authorization code, state) — 백엔드가 client_secret 으로 교환 + state 검증
class RealSocialAuthService implements SocialAuthService {
  RealSocialAuthService(this._dio);

  final Dio _dio;

  // dart-define 주입값. 미주입 시 빈 문자열 → 실행 시점 ArgumentError 로 조기 실패.
  static const _naverClientId = String.fromEnvironment('NAVER_CLIENT_ID');
  static const _naverCallbackScheme =
      String.fromEnvironment('NAVER_CALLBACK_SCHEME', defaultValue: 'doacustomer');
  static const _googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

  @override
  Future<SocialCredential> signInWithKakao() async {
    try {
      // 카카오톡 설치 시 앱 로그인, 미설치 시 계정(웹) 로그인.
      final OAuthToken token = await isKakaoTalkInstalled()
          ? await UserApi.instance.loginWithKakaoTalk()
          : await UserApi.instance.loginWithKakaoAccount();
      return SocialCredential(provider: 'kakao', token: token.accessToken);
    } on KakaoAuthException catch (e) {
      // 사용자 취소(access_denied) → silent recovery.
      if (e.error == AuthErrorCause.accessDenied) {
        throw const SocialAuthCancelled('kakao');
      }
      rethrow;
    } catch (e) {
      // 카카오톡 로그인 취소는 PlatformException 으로 오는 경우가 있어 메시지로 방어.
      if (e.toString().contains('CANCELED') || e.toString().contains('cancelled')) {
        throw const SocialAuthCancelled('kakao');
      }
      rethrow;
    }
  }

  @override
  Future<SocialCredential> signInWithGoogle() async {
    // serverClientId 를 백엔드 GOOGLE_CLIENT_ID 로 지정해야 id_token 의 aud 가 백엔드 검증과 일치.
    final googleSignIn = GoogleSignIn(
      scopes: const ['email'],
      serverClientId: _googleServerClientId.isEmpty ? null : _googleServerClientId,
    );
    final account = await googleSignIn.signIn();
    if (account == null) {
      // 사용자 취소.
      throw const SocialAuthCancelled('google');
    }
    final auth = await account.authentication;
    final idToken = auth.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw StateError('Google id_token 획득 실패 — serverClientId 설정을 확인하세요.');
    }
    return SocialCredential(provider: 'google', token: idToken);
  }

  @override
  Future<SocialCredential> signInWithNaver() async {
    if (_naverClientId.isEmpty) {
      throw ArgumentError('NAVER_CLIENT_ID 미설정 — --dart-define 으로 주입하세요.');
    }

    // 1) 백엔드에서 서버 발급 state 수신(CSRF, SEC-015-02 하드닝, 016).
    final stateRes = await _dio.post<Map<String, dynamic>>(
      '/auth/naver/state',
      options: Options(extra: {'anonymous': true}),
    );
    final state = stateRes.data?['state'] as String?;
    if (state == null || state.isEmpty) {
      throw StateError('네이버 state 발급 실패(POST /auth/naver/state).');
    }

    // 2) 네이버 인증 URL — 시스템 브라우저로 authorization code 획득(인앱 WebView 금지, ADR-006).
    final redirectUri = '$_naverCallbackScheme://oauth/naver/callback';
    final authorizeUrl = Uri.https('nid.naver.com', '/oauth2.0/authorize', {
      'response_type': 'code',
      'client_id': _naverClientId,
      'redirect_uri': redirectUri,
      'state': state,
    }).toString();

    try {
      final result = await FlutterWebAuth2.authenticate(
        url: authorizeUrl,
        callbackUrlScheme: _naverCallbackScheme,
      );
      final params = Uri.parse(result).queryParameters;
      final code = params['code'];
      // 네이버는 콜백 state 를 echo — 서버측 검증(delete-on-consume)이 최종 방어선이나
      // 클라이언트에서도 1차 대조하여 조기 차단.
      final returnedState = params['state'];
      if (params['error'] != null) {
        // access_denied 등 사용자 거부.
        throw const SocialAuthCancelled('naver');
      }
      if (code == null || code.isEmpty) {
        throw StateError('네이버 authorization code 미수신.');
      }
      if (returnedState != state) {
        throw StateError('네이버 state 불일치(CSRF 의심).');
      }
      return SocialCredential(provider: 'naver', token: code, state: state);
    } on Exception catch (e) {
      // flutter_web_auth_2 는 사용자 취소 시 PlatformException(code: 'CANCELED').
      if (e.toString().contains('CANCELED') || e.toString().contains('canceled')) {
        throw const SocialAuthCancelled('naver');
      }
      rethrow;
    }
  }
}
