/// 소셜 로그인 제공자로부터 획득한 토큰 자격증명.
/// [state] 는 naver code-exchange 전용 CSRF 파라미터(ADR-007) — kakao·google 은 null.
class SocialCredential {
  final String provider;
  final String token;
  final String? state;

  const SocialCredential({required this.provider, required this.token, this.state});
}

/// 소셜 SDK 연동 추상 인터페이스.
/// 실제 구현(KakaoSocialAuthService 등)은 각 플랫폼 SDK 패키지를 별도로 추가한 후 구현한다.
/// 테스트/개발 환경에서는 [StubSocialAuthService]를 사용한다.
///
/// naver 는 시스템 브라우저 + 커스텀 URL 스킴(`flutter_web_auth_2`)으로 authorization code 를
/// 획득한다(인앱 내장 브라우저 임베드 금지, ADR-006). 백엔드가 보유한 전용 크레덴셜로 code 를
/// 교환하므로 [signInWithNaver] 가 반환하는 [SocialCredential.token] 은 authorization code 다.
abstract class SocialAuthService {
  Future<SocialCredential> signInWithKakao();
  Future<SocialCredential> signInWithGoogle();
  Future<SocialCredential> signInWithNaver();
}

/// 개발/테스트 환경 스텁 — 실제 SDK 없이 고정 토큰 반환.
class StubSocialAuthService implements SocialAuthService {
  @override
  Future<SocialCredential> signInWithKakao() async =>
      const SocialCredential(provider: 'kakao', token: 'stub-kakao-token');

  @override
  Future<SocialCredential> signInWithGoogle() async =>
      const SocialCredential(provider: 'google', token: 'stub-google-token');

  @override
  Future<SocialCredential> signInWithNaver() async => const SocialCredential(
        provider: 'naver',
        token: 'stub-naver-code',
        state: 'stub-state',
      );
}

/// 사용자가 소셜 로그인을 취소했을 때 던지는 예외.
/// 화면 레이어에서 무시(silent recovery)해야 한다.
class SocialAuthCancelled implements Exception {
  final String provider;
  const SocialAuthCancelled([this.provider = '']);

  @override
  String toString() => 'SocialAuthCancelled($provider)';
}
