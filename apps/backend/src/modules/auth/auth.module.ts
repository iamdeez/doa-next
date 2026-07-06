import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { SecurityModule } from '../../shared/security/security.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { SocialAuthService } from './social-auth.service';
import { OAuthStateService } from './social/oauth-state.service';
import { SocialProviderResolver } from './social/social-provider.resolver';
import { KakaoProvider } from './social/kakao.provider';
import { GoogleProvider } from './social/google.provider';
import { NaverProvider } from './social/naver.provider';

@Module({
  imports: [
    // JwtModule without global secret — each signAsync call provides its own secret
    JwtModule.register({}),
    AuthSharedModule,
    MailModule,
    SecurityModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    SocialAuthService,
    OAuthStateService,
    SocialProviderResolver,
    KakaoProvider,
    GoogleProvider,
    NaverProvider,
  ],
})
export class AuthModule {}
