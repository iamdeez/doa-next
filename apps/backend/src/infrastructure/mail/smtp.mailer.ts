import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailerPort } from './mailer.port';
import { OTP_TTL_MIN } from '../../modules/auth/auth.constants';

@Injectable()
export class SmtpMailer extends MailerPort {
  private readonly logger = new Logger(SmtpMailer.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    super();
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT') ?? 587,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendOtpEmail(to: string, otp: string): Promise<void> {
    const from = this.configService.get<string>('MAIL_FROM') ?? 'noreply@doa.market';
    await this.transporter.sendMail({
      from,
      to,
      subject: '[DOA Market] 비밀번호 재설정 인증번호',
      text: `인증번호: ${otp}\n\n유효시간: ${OTP_TTL_MIN}분\n\n본인이 요청하지 않은 경우 이 메일을 무시하세요.`,
    });
    this.logger.log(`Mail sent to ${to}`);
  }
}
