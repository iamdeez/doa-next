---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-01 [시각 미확인]
상태: 적용 완료 (2026-07-01, 프로젝트 docs-change-logs/2026-07-01-001.md)
---

# Context / Infra 갱신 패치: 013-flutter-customer-phase2

> 본 Agent 는 context.md / infra.md 를 직접 수정하지 않는다. 아래 PATCH-CXT 후보를 main session 이 사용자 승인 후 적용한다.
> 모든 패치는 additive(기존 정의 부정합 아님). PROC-002 코드 검증 완료.

## 목차

- [PATCH-CXT-013-01 — infra.md (SMTP·OTP 임계값·마이그레이션)](#patch-cxt-013-01)
- [PATCH-CXT-013-02 — context.md (auth 역할·MailerPort·password_reset_otps)](#patch-cxt-013-02)
- [PATCH-CXT-013-03 — context.md §6 (Medium 보안 부채 3종)](#patch-cxt-013-03)

---

## PATCH-CXT-013-01

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/infra.md`
- **대상 섹션**: §3 배포 방식 / §7 배포 전 확인 체크리스트 / §8 알려진 인프라 제약
- **변경 내용**:
  1. **§7 배포 전 확인 체크리스트** 추가:
     - `[ ] SMTP Fly secret 설정 확인 (SMTP_HOST·SMTP_PORT·SMTP_USER·SMTP_PASS·MAIL_FROM). 미설정 시 비밀번호 재설정 OTP 이메일 발송 불가. NODE_ENV=production 에서 SmtpMailer 활성`
  2. **§8 알려진 인프라 제약** 행 추가:
     - `| SMTP 이메일 발송 의존성 | 비밀번호 재설정 OTP 발송은 SMTP provider(nodemailer) 필요. SMTP_* secret 미설정 시 발송 실패(서비스는 500 미전파·OTP DB 선기록으로 격리). 운영 SMTP provider 선정·secret 주입 필수 | auth 모듈·운영 | 013-flutter-customer-phase2 |`
     - `| OTP 운영 임계값 | 비밀번호 재설정 OTP: 유효기간 OTP_TTL_MIN=10분·재발송 간격 OTP_RESEND_WINDOW_SEC=60초·최대 시도 OTP_MAX_ATTEMPTS=5회(초과 시 소비 처리·브루트포스 차단, SEC-001). auth.constants.ts 정의 | auth 모듈 | 013 |`
  3. **§3 배포 절차 DB 마이그레이션 주의** 하단에 신규 마이그레이션 2종 존재 사실 반영(prisma migrate deploy 자동 적용 대상): `20260701022235_add_password_reset_otps`(users.password_reset_otps 신규), `20260701140100_add_otp_attempts`(attempts 컬럼 추가).
- **변경 근거**: GAP-013-03 (문서-갱신-필요). Planning selection-phases.md 가 Deploy Agent 비활성 시 "신규 환경변수·secret·infra.md §7/§8 갱신은 Docs/Retrospective 위임" 으로 명시.
- **코드 검증** (PROC-002):
  - `apps/backend/.env.example` L15~19 — SMTP_HOST·SMTP_PORT·SMTP_USER·SMTP_PASS·MAIL_FROM 확인.
  - `apps/backend/src/modules/auth/auth.constants.ts` L2/5/8/11 — OTP_TTL_MIN=10·OTP_RESEND_WINDOW_SEC=60·OTP_LENGTH=6·OTP_MAX_ATTEMPTS=5 확인.
  - `apps/backend/src/infrastructure/mail/` — mail.module.ts·mailer.port.ts·smtp.mailer.ts·stub.mailer.ts 4종 확인(NODE_ENV=production → SmtpMailer 선택).
  - `apps/backend/prisma/migrations/` — 20260701022235_add_password_reset_otps·20260701140100_add_otp_attempts 2종 존재 확인.
  - 일치 여부: 갱신 텍스트가 코드 사실과 일치.

---

## PATCH-CXT-013-02

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §2 핵심 도메인 모듈 목록(auth 행) + 공통·인프라 모듈 / §3.4 외부 시스템 연동 / §4 데이터 모델
- **변경 내용**:
  1. **§2 핵심 도메인 모듈** `auth` 행 역할 갱신:
     - 현재: `로그인/JWT/Refresh/비밀번호 재설정/세션`
     - 변경: `로그인/JWT/Refresh/비밀번호 재설정 OTP(POST /auth/forgot-password·/auth/reset-password)·이메일 찾기(POST /auth/find-email, 마스킹 반환)/세션`
  2. **§2 공통(shared)·인프라 모듈** 표에 행 추가:
     - `| MailerPort | src/infrastructure/mail/ | 이메일 발송 어댑터. abstract MailerPort + SmtpMailer(nodemailer, NODE_ENV=production)·StubMailer(무네트워크 테스트). auth OTP 발송 DI 주입 |`
  3. **§3.4 외부 시스템 연동** 표 `이메일(알림)` 행 주석 보강(또는 신규 행): auth 비밀번호 재설정 OTP 발송은 `MailerPort`(SMTP/nodemailer) 로 처리(notification 모듈의 [TBD] SaaS 미선정과 독립).
  4. **§4 데이터 모델** users 스키마 테이블 목록에 `password_reset_otps`(email·otpHash·expiresAt·consumedAt·attempts·createdAt, `@@index([email, createdAt desc])`, SHA-256 해시 저장) 추가. §4 머리말 "30테이블" → "31테이블" 표기 검토(마이그레이션 14차).
- **변경 근거**: GAP-013-04 (문서-갱신-필요, additive). 모두 기존 정의 부정합 아님.
- **코드 검증** (PROC-002):
  - `apps/backend/src/modules/auth/auth.controller.ts` L70/77/85 — forgotPassword·resetPassword·findEmail 엔드포인트 3종 확인.
  - `apps/backend/prisma/schema.prisma` L126~138 — PasswordResetOtp model(id/email/otpHash/expiresAt/consumedAt/attempts/createdAt·@@map("password_reset_otps")·@@schema("users")) 확인.
  - `apps/backend/src/infrastructure/mail/` — 어댑터 4종 확인.
  - 일치 여부: 갱신 텍스트가 코드 사실과 일치.
- **참고 (검토중 — 사용자 확인 권고)**: §4 "30테이블"→"31테이블" 및 §1 개요의 "30테이블" 문구는 password_reset_otps 추가 후 총 테이블 수 재확인 필요. 코드상 users 스키마에 신규 1테이블 추가는 확정이나, 개요 서술 수치 전면 갱신은 §1·§4 문맥 정합을 사용자가 확인 후 반영 권고.

---

## PATCH-CXT-013-03

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채
- **변경 내용**: 아래 3개 Medium 보안 부채 행 추가(다음 spec 설계 워크플로우 ③ context 확인 시 노출 목적):
  - `| auth reset-password IP rate limit 부재 (SEC-002/GAP-013-09) | forgot-password 404·find-email 이 user enumeration 표면. in-email rate limit(60초) 만 존재, 글로벌 IP rate limit 미적용 → 다수 이메일/전화 순차 조회 가능. 완화 권고: @nestjs/throttler IP rate limit. spec 변경 불요(trade-off 수용) | auth 모듈 | 013 (후속 patch spec 또는 014 위임) |`
  - `| resetPassword refresh token revoke 비원자 (SEC-003/GAP-013-10) | 비밀번호 변경(markOtpConsumed 트랜잭션) 완료 후 revokeAllRefreshTokensByUser 를 별도 best-effort 호출. 서버 비정상 종료 시 세션 미폐기 가능(access token TTL 15분 자연 만료로 Medium). 개선: revoke 를 트랜잭션 내 통합 또는 outbox | auth 모듈 | 013 (후속 위임) |`
  - `| auth 보안 감사 로그 부재 (SEC-004/GAP-013-11) | OTP 검증 실패·rate limit 위반(429)·find-email PII 접근 이벤트 감사 로그 미기재 → 브루트포스·enumeration 시도 추적 불가. SmtpMailer 성공 로그만 존재. 개선: WARN 수준 보안 이벤트 로깅 | auth 모듈·운영 | 013 (후속 위임) |`
- **변경 근거**: GAP-013-09/10/11 (Security Agent Medium 위임). PROC-013-03 — 위임된 Medium 보안 부채를 프로젝트 문서에 등재하여 무추적 소실 방지.
- **코드 검증** (PROC-002): `apps/backend/src/modules/auth/auth.service.ts` resetPassword 의 revoke best-effort 호출 위치 확인(Security run-012/016 검토 기반). 본 항목은 코드 "상태 서술"이 아닌 "미해결 부채 기록"이므로 코드 사실(현행 미적용 상태)과 일치.
- **비고**: 본 3종은 프로젝트 특정 보안 사안으로 전역 규칙(범용성 미충족) 아님 → context.md §6 이 적합한 위치. 후속 patch spec 신설 여부는 main session·사용자 결정.
