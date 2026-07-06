import { Injectable, Logger } from '@nestjs/common';
import { MailerPort } from './mailer.port';

/**
 * StubMailer — 실제 이메일을 보내지 않고 로그만 출력한다.
 * NODE_ENV !== 'production' 환경에서 SMTP 의존 없이 동작 가능하도록.
 * lastSent: 테스트에서 마지막 발송 내용을 확인하는 데 사용한다.
 */
@Injectable()
export class StubMailer extends MailerPort {
  private readonly logger = new Logger(StubMailer.name);

  /** 마지막으로 발송된 OTP 정보. 테스트 픽스처에서 OTP 검증 등에 활용. */
  lastSent: { to: string; otp: string } | null = null;

  async sendOtpEmail(to: string, otp: string): Promise<void> {
    this.lastSent = { to, otp };
    this.logger.log(`[STUB] Mail to=${to} otp=${otp}`);
  }
}
