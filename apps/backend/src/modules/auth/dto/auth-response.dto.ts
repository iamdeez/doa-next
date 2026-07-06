import { ApiProperty } from '@nestjs/swagger';

/** 인증 도메인 응답 DTO (문서 전용 — 런타임 변환 없음). */
export class RegisterResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}

export class LoginResponse {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken!: string;
}

export class RefreshResponse {
  @ApiProperty({ description: 'JWT access token (재발급)' })
  accessToken!: string;
}

export class AuthProfileResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  name?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty()
  isAdmin!: boolean;
}

export class FindEmailResponse {
  @ApiProperty({ example: 'us**@example.com', description: '마스킹된 이메일' })
  email!: string;
}

export class SocialLoginResponse {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken!: string;
}

/** 네이버 code-exchange CSRF state 발급 응답. */
export class NaverStateResponse {
  @ApiProperty({ description: 'CSRF 방지용 state 값(base64url, 1회성)' })
  state!: string;
}
