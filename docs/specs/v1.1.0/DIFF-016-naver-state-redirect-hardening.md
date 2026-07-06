---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-07-03 16:01
상태: 확정
---

# Diff: 016-naver-state-redirect-hardening

## 목차

- [base commit 주의 (015 미커밋 상황)](#base-commit-주의-015-미커밋-상황)
- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

---

## base commit 주의 (015 미커밋 상황)

016 착수 시점에 `v1.1.0/015-naver-code-exchange` 가 아직 커밋되지 않은 상태였다(working tree 공존, 둘 다
base `6b64c24` 에서 분기). 따라서 `git diff 6b64c24` 는 **015 와 016 두 spec 의 변경분을 합산**한다.

아래 "변경 요약"·"변경 파일 및 라인 수" 절은 016 **고유 변경**에 집중했다. 015 산출물(`DIFF-015-naver-code-exchange.md`)의 기존 라인 수치와 현재 `git diff 6b64c24 --numstat` 실측치를 대조하여 016 이 추가한 증분만 best-effort 로 분리했다:

- **5개 tracked 파일**(`auth.controller.ts`·`auth.module.ts`·`social-auth.service.ts`·`naver.provider.ts`·`social-auth.service.autolink-policy.spec.ts`)은 015 변경분과 016 변경분이 **물리적으로 혼재**한다(같은 파일 내 서로 다른 라인 블록). 아래 표의 "016 증분(추정)" 컬럼은 (현재 총합 − DIFF-015 기록치)로 계산했다.
- **3개 untracked 파일**(`naver.provider.spec.ts`·`social-auth.service.naver.spec.ts`·`social-auth.service.naver-autolink-exclusion.spec.ts`)은 015 가 신규 생성했고 016 이 §F 마이그레이션(DI mock 추가·STALE_SC 마커 정정)으로 추가 수정했다. untracked 파일은 `git diff --numstat` 에 잡히지 않으므로, 현재 `wc -l` 실측치와 DIFF-015 기록 라인 수의 차이로 016 증분을 추정했다(순증분, +/- 세부 분리 불가).
- 그 외 파일(`dto/social-login.dto.ts`·`social/social-provider.port.ts`·`social/social-provider.resolver.ts`·Flutter 5개 파일)은 016 이 변경하지 않았다(015 전량, 016 증분 0).

**재생성 명령** (015 완료 커밋 생성 후 재확정 필요):

```bash
# 1. 현재(015+016 합산) — 참고용
git diff 6b64c24 -- apps/backend mobile/customer_app

# 2. 015 완료 커밋 생성 후 016 단독 diff 재산출 (권장)
git diff {015-완료-커밋} -- \
  apps/backend/src/modules/auth/social \
  apps/backend/prisma/migrations/20260703070000_add_oauth_states \
  apps/backend/prisma/schema.prisma \
  apps/backend/src/modules/auth/auth.constants.ts \
  apps/backend/src/modules/auth/auth.repository.ts \
  apps/backend/src/modules/auth/auth.controller.ts \
  apps/backend/src/modules/auth/auth.module.ts \
  apps/backend/src/modules/auth/social-auth.service.ts \
  apps/backend/src/modules/auth/social-auth.service.spec.ts \
  apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts \
  apps/backend/src/modules/auth/dto/auth-response.dto.ts \
  apps/backend/.env.example
```

---

## 커밋 메시지용 한 줄 요약

- **KO**: 네이버 code-exchange 로그인에 서버 발급 state(CSRF) 원자적 1회성 검증과 redirect_uri 조건부 지원을 추가해 SEC-015-02(Medium)·SEC-015-03(Low)를 백엔드 단독으로 하드닝 (v1.1.0/016)
- **EN**: Harden Naver code-exchange login with server-issued atomic single-use state (CSRF) verification and conditional redirect_uri support, addressing SEC-015-02 (Medium) and SEC-015-03 (Low) entirely server-side (v1.1.0/016)

## 변경 요약

- **state(CSRF) 서버측 발급·원자적 1회성 검증 (SEC-015-02)**: 신규 `POST /auth/naver/state`(익명) 엔드포인트가
  `node:crypto randomBytes(32).toString('base64url')` 로 예측 불가능한 state 값을 발급하고, 신규
  `oauth_states` 테이블(`users` 스키마)에 TTL(`NAVER_STATE_TTL_MIN=10분`)과 함께 저장한다(FR-001/002,
  NFR-002). `SocialAuthService.login()` 진입부에서 provider가 `'naver'` 인 경우에만
  `OAuthStateService.consume()` 을 `providerImpl.verify()` 호출 **이전**에 실행해 값 일치·미만료·미소비
  여부를 검증한다(FR-003/004). 검증-소비는 단일 조건부 `deleteMany({ where:{ state, provider,
  expiresAt:{gt:now} } })` 로 원자화(delete-on-consume)되어, 동일 state 로 동시·재요청 시 정확히 1건만
  성공한다(FR-005, PostgreSQL row-level lock 기반 — 앱 레이어 Lock 불요). 카카오·구글은 이 분기에
  진입하지 않아 기존 클라이언트 토큰 검증 흐름이 완전히 보존된다(FR-006, NFR-003).
- **redirect_uri 조건부 지원 (SEC-015-03)**: `NaverProvider.verify()` 가 `NAVER_REDIRECT_URI` 환경변수를
  optional 로 조회하여, 설정된 경우에만 토큰 교환 요청에 `redirect_uri` 파라미터를 포함한다(FR-007).
  미설정 시 015 의 기존 동작(파라미터 미포함)이 그대로 유지되는 fail-safe 설계로 회귀가 없다(FR-008).
- **저장소 — 신규 외부 의존 없이 기존 단일 PostgreSQL 재사용 (NFR-004, constitution P-003)**: `oauth_states`
  테이블 1개 추가(Database Design Agent 산출, 마이그레이션 `20260703070000_add_oauth_states`)로 구현했다.
  in-memory TTL Map 대안은 Fly.io scale-to-zero 콜드 스타트·rolling deploy 시 발급/콜백 인스턴스 불일치로
  인한 false rejection 위험 때문에 채택하지 않았다(ADR-001).
- **§F 회귀 마이그레이션(T012)**: `SocialAuthService` 생성자에 `OAuthStateService` 4번째 인자가 추가되어,
  이를 호출하는 015/014 기존 테스트 5개 파일(`social-auth.service.spec.ts`·
  `social-auth.service.autolink-policy.spec.ts`·`social-auth.service.naver.spec.ts`·
  `social-auth.service.naver-autolink-exclusion.spec.ts`·`naver.provider.spec.ts`)에 DI mock·
  `configService.get` mock 을 추가해 회귀를 방지했다(NFR-003, SC-011).
- **STALE_SC 정정**: `social-auth.service.autolink-policy.spec.ts`(SC-006/008)·`social-auth.service.naver.spec.ts`(SC-010) 3개소에 015 spec 잔존 SC 번호임을 명시하는 `(v1.1.0/015 spec)` exact-match 마커를 추가했다(PATCH-A18 옵션 A, 주석 서식만 — 테스트 로직·단언 무변경).
- **신규 npm 의존 0건**(SC-012 — `node:crypto`·Prisma·`@nestjs/config` 전부 기존 재사용).

## 변경 파일 및 라인 수

> "016 증분(추정)" = 현재 `git diff 6b64c24` 총합 − `DIFF-015-naver-code-exchange.md` 기록치(tracked 파일),
> 또는 현재 `wc -l` − DIFF-015 기록 라인수(untracked 파일, 순증분만). 5개 tracked·3개 untracked 파일은
> 015/016 물리적 혼재로 인한 best-effort 추정치이며, 나머지는 실측 `git diff --numstat`/`wc -l` 값이다.

### 016 신규 파일 (실측)

| 파일 | 라인 수 | 비고 |
|---|---|---|
| `apps/backend/src/modules/auth/social/oauth-state.service.ts` | 33 | `OAuthStateService` — issue/consume |
| `apps/backend/src/modules/auth/social/oauth-state.service.spec.ts` | 93 | SC-001/002/010 |
| `apps/backend/src/modules/auth/social-auth.service.naver-state.spec.ts` | 185 | SC-003~006 |
| `apps/backend/prisma/migrations/20260703070000_add_oauth_states/migration.sql` | 16 | Database Design Agent 산출 |
| `apps/backend/prisma/migrations/20260703070000_add_oauth_states/rollback.sql` | 10 | 참조용 |

### 016 고유 수정 (실측, 015 미변경 파일)

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | +15 | -0 |
| `apps/backend/src/modules/auth/auth.repository.ts` | +28 | -0 |
| `apps/backend/src/modules/auth/dto/auth-response.dto.ts` | +6 | -0 |
| `apps/backend/src/modules/auth/auth.constants.ts` | +3 | -0 |
| `apps/backend/.env.example` | +2 | -0 |
| `apps/backend/src/modules/auth/social-auth.service.spec.ts` | +13 | -0 |

### 016 증분 (추정, 015 와 물리적 혼재 파일)

| 파일 | 현재 총합(실측) | 015 기록치(DIFF-015) | 016 증분(추정) |
|---|---|---|---|
| `apps/backend/src/modules/auth/auth.controller.ts` | +12/-1 | +1/-1 | **약 +11/-0** |
| `apps/backend/src/modules/auth/auth.module.ts` | +4/-1 | +2/-1 | **약 +2/-0** |
| `apps/backend/src/modules/auth/social-auth.service.ts` | +47/-18 | +30/-17 | **약 +17/-1** |
| `apps/backend/src/modules/auth/social/naver.provider.ts` | +71/-26 | +66/-26 | **약 +5/-0** |
| `apps/backend/src/modules/auth/social-auth.service.autolink-policy.spec.ts` | +43/-13 | +23/-11 | **약 +20/-2** |
| `apps/backend/src/modules/auth/social/naver.provider.spec.ts` (untracked) | 238줄(wc -l) | 183줄 | **약 +55** |
| `apps/backend/src/modules/auth/social-auth.service.naver.spec.ts` (untracked) | 296줄(wc -l) | 280줄 | **약 +16** |
| `apps/backend/src/modules/auth/social-auth.service.naver-autolink-exclusion.spec.ts` (untracked) | 161줄(wc -l) | 148줄 | **약 +13** |

### 016 이 변경하지 않은 파일 (참고 — 전량 015 귀속)

`dto/social-login.dto.ts`·`social/social-provider.port.ts`·`social/social-provider.resolver.ts`·
`mobile/customer_app/lib/core/providers.dart`·`mobile/customer_app/lib/features/auth/login_screen.dart`·
`mobile/customer_app/lib/features/auth/social_auth_service.dart`·`mobile/customer_app/pubspec.lock`·
`mobile/customer_app/pubspec.yaml`·`mobile/customer_app/test/features/social_login_flow_test.dart`

## Diff

> 전체 diff 는 박제하지 않는다 — git 이 형상관리 SoT. base commit + 재생성 명령은 위
> "base commit 주의 (015 미커밋 상황)" 절 참조.
