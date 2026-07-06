/**
 * MailerPort — 이메일 전송 추상 계층.
 * 구현체: SmtpMailer (운영), StubMailer (테스트/개발).
 * MailModule 이 NODE_ENV 에 따라 적절한 구현체를 제공한다.
 */
export abstract class MailerPort {
  abstract sendOtpEmail(to: string, otp: string): Promise<void>;
}
