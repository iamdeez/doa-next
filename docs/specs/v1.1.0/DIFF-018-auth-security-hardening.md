---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-07-04 06:25
상태: 확정
---

# Diff: 018-auth-security-hardening

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

---

## 커밋 메시지용 한 줄 요약

- **KO**: auth 보안 하드닝 — 계층형 rate limit(전역+라우트별)·Fly.io trust proxy 실 IP 식별·소셜가입/비밀번호재설정 트랜잭션 원자화·보안 감사 로그 3종 (v1.1.0/018)
- **EN**: Auth security hardening — tiered rate limiting, Fly.io trust-proxy real IP resolution, atomic social signup / password-reset transactions, and 3 security audit log events (v1.1.0/018)

## 변경 요약

`context.md §6` 에 013~016 스펙의 Security Agent 감사에서 Medium/Low 로 판정되어 Retrospective 위임으로 누적된 auth 도메인 보안 부채 4건(SEC-002~004 계열)을 하나의 보안 하드닝 릴리즈로 해소했다.

- **트랙 1 — rate limit 인프라 (`shared/security/`)**: `@nestjs/throttler`(신규 의존, 인-메모리 스토리지) 기반 전역 가드(`APP_GUARD`)를 도입했다. 전역 기본 IP당 20회/60초(NFR-001) + 고위험 5개 엔드포인트(`social-login` 10·`naver/state` 20·`forgot-password` 5·`find-email` 5·`reset-password` 10 회/60초) 개별 override(`@Throttle`). `GET /health` 는 `@SkipThrottle()` 로 Fly 헬스체크 폴링을 보호한다.
- **트랙 2 — 실 클라이언트 IP 식별**: `main.ts` 에 `app.set('trust proxy', 1)`(Fly 엣지 첫 홉만 신뢰)을 추가하고, `FlyThrottlerGuard.getTracker` 가 `resolveClientIp()`(`Fly-Client-IP`→`X-Forwarded-For`[0]→`req.ip` 폴백)로 rate limit 버킷 키를 결정하도록 했다. trust proxy 미설정 시 모든 요청이 프록시 연결 IP 단일 버킷으로 집계되어 rate limit 이 운영에서 무력화되는 문제를 차단한다.
- **트랙 3 — 소셜 신규가입 트랜잭션 원자화**: `SocialAuthService.login()` path 3c 의 `createUser`+`createSocialAccount` 두 INSERT 를 `PrismaService.runInTransaction` 으로 래핑했다. 두 번째 쓰기 실패 시 `password: null` orphan user 가 이메일 슬롯을 점유하던 문제를 해소한다. 기존 P2002 동시성 경합 폴백(재가입 레이스 복구)은 트랜잭션 **외부**에 그대로 유지하여 회귀를 방지했다.
- **트랙 4 — 비밀번호 재설정 세션 폐기 원자화**: `AuthRepository.revokeAllRefreshTokensByUser` 를 root 클라이언트에서 tx-aware(`this.prisma.tx`)로 전환하고, `AuthService.resetPassword` 가 `markOtpConsumed`+`revokeAllRefreshTokensByUser` 를 단일 `runInTransaction` 으로 묶도록 했다. 어느 한쪽이 실패하면 비밀번호 변경·세션 폐기 모두 롤백된다.
- **트랙 5 — 보안 감사 로그 3종**: 신규 `SecurityAuditLogger`(PinoLogger 래퍼)가 `otpVerificationFailed`(OTP 불일치)·`rateLimitExceeded`(429 발생)·`findEmailAccessed`(PII 조회) 이벤트를 WARN 수준으로 기록한다. 전 메서드가 내부 try/catch(best-effort)로 감싸져 로깅 실패가 원 요청 흐름을 차단하지 않는다. 신규 `maskPhone` 유틸(뒤 4자리만 노출)로 로그 내 전화번호를 마스킹한다.

데이터 모델 변경·신규 Prisma 마이그레이션은 없다(트랜잭션 경계 조정만). 신규 npm 의존은 `@nestjs/throttler` 1건(인-메모리 스토리지, Redis 등 외부 저장소 미도입 — NFR-007/constitution P-003 준수).

## 변경 파일 및 라인 수

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/package.json` | +1 | -0 |
| `apps/backend/src/app.module.ts` | +2 | -0 |
| `apps/backend/src/health/health.controller.ts` | +2 | -0 |
| `apps/backend/src/main.ts` | +7 | -1 |
| `apps/backend/src/modules/auth/auth.controller.ts` | +14 | -0 |
| `apps/backend/src/modules/auth/auth.module.ts` | +2 | -0 |
| `apps/backend/src/modules/auth/auth.repository.ts` | +3 | -1 |
| `apps/backend/src/modules/auth/auth.service.spec.ts` | +194 | -0 |
| `apps/backend/src/modules/auth/auth.service.ts` | +25 | -4 (net; 상세는 git diff 참조) |
| `apps/backend/src/modules/auth/auth.util.spec.ts` | +72 | -0 |
| `apps/backend/src/modules/auth/auth.util.ts` | +13 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` | +14 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.naver-autolink-exclusion.spec.ts` | +14 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.naver-state.spec.ts` | +14 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` | +14 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.spec.ts` | +128 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.ts` | +34 | -25 |
| `pnpm-lock.yaml` | +16 | -0 |
| `apps/backend/src/shared/security/throttle.constants.ts` (신규) | +25 | -0 |
| `apps/backend/src/shared/security/client-ip.util.ts` (신규) | +31 | -0 |
| `apps/backend/src/shared/security/fly-throttler.guard.ts` (신규) | +45 | -0 |
| `apps/backend/src/shared/security/security-audit.logger.ts` (신규) | +47 | -0 |
| `apps/backend/src/shared/security/security.module.ts` (신규) | +27 | -0 |
| `apps/backend/src/shared/security/client-ip.util.spec.ts` (신규) | +117 | -0 |
| `apps/backend/src/shared/security/security-audit.logger.spec.ts` (신규) | +184 | -0 |
| `apps/backend/src/shared/security/throttler-exception.spec.ts` (신규) | +54 | -0 |
| `apps/backend/test/rate-limit.e2e-spec.ts` (신규) | +201 | -0 |
| `apps/backend/test/auth-reset-atomicity.e2e-spec.ts` (신규) | +144 | -0 |
| `apps/backend/test/static/rate-limit-trust-proxy.spec.ts` (신규) | +48 | -0 |
| `apps/backend/test/static/rate-limit-no-redis.spec.ts` (신규) | +71 | -0 |

> `apps/backend/src/modules/auth/auth.service.ts` 의 삭제 라인 수는 `git diff --stat` 요약치(+25/-소량, 정확한 삭제 라인 수는 재생성 명령으로 확인)이며, 나머지 tracked 17개 파일 합계는 `git diff b3f427d --stat -- apps/backend`(+529/-25) 로 확인했다. 신규(untracked) 12개 파일 합계는 994줄이다.

## Diff

전체 diff 는 박제하지 않는다 — git 이 형상관리 SoT. base commit 기준 재생성:

```bash
git diff b3f427d -- apps/backend pnpm-lock.yaml
```

신규(untracked) 파일은 diff 대상이 아니므로 별도로 확인한다:

```bash
git status --porcelain -- apps/backend/src/shared/security apps/backend/test
```
