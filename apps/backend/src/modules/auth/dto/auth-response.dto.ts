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

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
