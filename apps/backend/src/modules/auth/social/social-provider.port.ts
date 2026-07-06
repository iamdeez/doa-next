/** 소셜 제공자로부터 받아온 프로필. email 은 제공자가 전달하지 않으면 null. */
export interface SocialProfile {
  providerId: string;
  email: string | null;
  name: string | null;
}

/**
 * verify() 에 전달되는 provider 별 부가 컨텍스트.
 * 현재는 code-exchange 흐름(Naver)의 CSRF state 전달에 사용된다.
 * redirectUri 는 토큰 교환 시 요구될 경우를 대비한 예약 필드(현재 미전송, research.md TO-VERIFY).
 */
export interface SocialVerifyContext {
  state?: string;
  redirectUri?: string;
}

/**
 * 소셜 OAuth 토큰 검증 포트.
 * NestJS DI 토큰으로 사용하기 위해 abstract class 로 선언
 * (TypeScript interface 는 런타임에 소거되므로 DI 토큰으로 사용 불가).
 */
export abstract class SocialProviderPort {
  /**
   * 클라이언트 SDK 가 발급한 access/id token(또는 Naver 의 경우 authorization code) 을
   * 검증하고 프로필을 반환한다. context 는 provider 별로 선택적으로 사용한다
   * (Kakao·Google 은 무시, Naver 는 state 를 토큰 교환에 전달).
   * @throws {UnauthorizedException} 토큰/code 검증 실패 또는 이메일 없음(FR-003)
   */
  abstract verify(token: string, context?: SocialVerifyContext): Promise<SocialProfile>;
}
