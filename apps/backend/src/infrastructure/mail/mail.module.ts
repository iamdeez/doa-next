import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerPort } from './mailer.port';
import { SmtpMailer } from './smtp.mailer';
import { StubMailer } from './stub.mailer';

const mailerProvider = {
  provide: MailerPort,
  useClass: process.env['NODE_ENV'] === 'production' ? SmtpMailer : StubMailer,
};

@Module({
  imports: [ConfigModule],
  providers: [mailerProvider, SmtpMailer, StubMailer],
  exports: [MailerPort],
})
export class MailModule {}
