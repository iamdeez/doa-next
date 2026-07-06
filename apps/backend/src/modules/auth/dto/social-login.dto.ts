import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

// naver 는 code-exchange 전환(ADR-001)으로 앱바인딩을 확보하여 지원 provider 에 재편입되었다.
const SUPPORTED_PROVIDERS = ['kakao', 'google', 'naver'] as const;

export class SocialLoginDto {
  @ApiProperty({ enum: SUPPORTED_PROVIDERS, description: '소셜 로그인 제공자' })
  @IsIn(SUPPORTED_PROVIDERS)
  provider!: string;

  @ApiProperty({
    description:
      '클라이언트 SDK 가 발급한 access token 또는 id token. naver 는 authorization code',
  })
  @IsString()
  token!: string;

  @ApiProperty({
    required: false,
    description: 'CSRF 방지용 state — naver code-exchange 전용(ADR-007)',
  })
  @IsOptional()
  @IsString()
  state?: string;
}
