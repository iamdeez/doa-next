---
작성: Security Agent
버전: v1.0
최종 수정: 2026-07-03 16:13
상태: 확정
---

# 보안 감사 결과 — 016-naver-state-redirect-hardening

> base commit: `6b64c24` (014 완료 시점, 015 미커밋으로 015+016 이 working tree 에 공존).
> 본 감사는 `docs/specs/v1.1.0/015-naver-code-exchange/security/security-report.md`(v1.1, `status:
> COMPLETE`, `gate: PASS`)가 잔존 권고로 남긴 **SEC-015-02(Medium)**·**SEC-015-03(Low)** 에 대한
> **재감사**다. spec.md NFR-006/007·SC-014/015 가 본 재감사를 "RESOLVED 여부의 최종 판정자"로
> 명시적으로 지정했다. Critical/High 신규 취약점 유무, kakao/google 회귀 여부도 함께 점검한다.

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [SEC-015-02 재감사 — state(CSRF) 서버측 검증](#sec-015-02-재감사--statecsrf-서버측-검증)
- [SEC-015-03 재감사 — redirect_uri 조건부 지원](#sec-015-03-재감사--redirect_uri-조건부-지원)
- [신규 공격 표면 점검 (016 이 도입한 표면)](#신규-공격-표면-점검-016-이-도입한-표면)
- [카카오·구글 회귀 확인](#카카오구글-회귀-확인)
- [취약점 목록](#취약점-목록)
- [NFR-XXX / SC-XXX 보안 요구사항 이행 현황](#nfr-xxx--sc-xxx-보안-요구사항-이행-현황)
- [OWASP Top 10 매핑](#owasp-top-10-매핑)
- [권고사항](#권고사항)

---

## 검토 범위

DIFF-016(`docs/specs/v1.1.0/DIFF-016-naver-state-redirect-hardening.md`) 변경 파일 중 보안 관련 전부를
코드 레벨로 직접 확인했다. plan.md 인터페이스 계약(`POST /auth/naver/state` 익명 엔드포인트 신설,
`SocialAuthService.login` state 분기)·research.md 영향 범위와 대조하여 검토 대상을 좁혔다.

**직접 검토 파일**:

- `apps/backend/src/modules/auth/social/oauth-state.service.ts` (신규 — state 발급·소비)
- `apps/backend/src/modules/auth/auth.repository.ts` (신규 메서드 — `createOAuthState`·`consumeOAuthState`·`deleteExpiredOAuthStates`)
- `apps/backend/src/modules/auth/social-auth.service.ts` (state 검증 배선 — `login()` 진입부)
- `apps/backend/src/modules/auth/social/naver.provider.ts` (redirect_uri 조건부 조회·포함)
- `apps/backend/src/modules/auth/auth.controller.ts` (`POST /auth/naver/state` 신규 익명 엔드포인트)
- `apps/backend/src/modules/auth/auth.module.ts` (`OAuthStateService` provider 등록)
- `apps/backend/src/modules/auth/auth.constants.ts` (`NAVER_STATE_TTL_MIN=10`)
- `apps/backend/src/modules/auth/dto/social-login.dto.ts`·`dto/auth-response.dto.ts` (state 필드·응답 타입)
- `apps/backend/prisma/schema.prisma`·`prisma/migrations/20260703070000_add_oauth_states/migration.sql` (신규 `oauth_states` 테이블)
- `apps/backend/.env.example` (`NAVER_REDIRECT_URI` 문서화)

**대조 확인(무변경 검증, NFR-003 회귀 방지 목적)**:

- `apps/backend/src/modules/auth/social/kakao.provider.ts`, `google.provider.ts` — `git diff 6b64c24`
  결과 diff 0(무변경) 직접 확인. naver 전용 state 분기(`provider === 'naver'` 조건)가 kakao/google 호출
  경로를 물리적으로 우회하지 않는지 `social-auth.service.ts:64-69` 대조.
- 전역 rate limiting 미들웨어(`@nestjs/throttler` 등) — `apps/backend/src/main.ts`·`app.module.ts`·
  `auth.controller.ts` grep 결과 존재하지 않음을 확인(015 SEC-004 원 상태 그대로, 신규 회귀 아님).

**제외 파일 및 사유**: 신규/수정 테스트 파일(`oauth-state.service.spec.ts`·
`social-auth.service.naver-state.spec.ts`·`naver.provider.spec.ts` 등)은 SC 커버리지 검증(coverage.md
대조)·프로덕션 로직의 기대 동작 재현 용도로만 열람했으며 보안 취약점 판정의 직접 근거로는 사용하지
않았다(테스트 코드는 공격 표면이 아님).

---

## 요약

- 대상 파일 수: 10 (보안 관련 직접 검토) + 2 (무변경 대조) + 1 (rate limiting 부재 확인)
- **Critical 0건 / High 0건 / Medium 0건 / Low 0건(신규) / 정보성 1건**
- **SEC-015-02(Medium) → RESOLVED**: 서버측 state 발급·원자적 1회성 검증이 원 위협모델(state
  pass-through 미검증)을 완전히 제거했다. SC-014 충족.
- **SEC-015-03(Low) → RESOLVED(코드 레벨) / 잔존-권고(운영 확인 대기)**: redirect_uri 조건부 지원이
  fail-safe 로 구현되었다. 네이버 공식 문서상 실제 요구 여부는 여전히 미확정이나, 이는 spec.md 가
  이미 범위 외로 명시한 운영 셋업 항목이며 NFR-007 이 정확히 이 상태("RESOLVED 또는 잔존-권고")를
  허용 판정으로 정의했다. SC-015 충족.
- 신규 공격 표면(`POST /auth/naver/state` 익명 발급 엔드포인트)에 대해 flooding/replay/timing/데이터
  노출 4개 축을 점검한 결과 신규 Critical/High/Medium 취약점 없음. flooding 위험은 기존 SEC-004(rate
  limit 부재, 015 에서 이미 별도 과제로 인지·범위 외 처리됨)와 동일 축이며 TTL+opportunistic 정리로
  구조적으로 바운딩되어 정보성 항목으로만 기록한다.
- kakao·google 경로 회귀 0건 확인(코드 diff 0 + `provider === 'naver'` 조건부 분기 코드 검증).
- **최종 판정: `status: COMPLETE`, `gate: PASS`.** Critical/High 없음 → Performance Agent 진행 가능
  (agent-rules.md §0 캐스케이딩 규칙).

---

## Constitution 보안 조항 이행 현황

`.claude/docs/constitution.md` 확인 결과 보안·인증 전용 조항은 없음(P-001~P-007 은 모듈 경계·AWS
배제·단일 DB·클라우드 중립·결제 정합성·테스트·스펙 범위 원칙). P-003(단일 DB 원칙)은 본 spec 의
state 저장 방식 선택(PostgreSQL 신규 테이블, ADR-001)과 직접 관련되며, Redis 등 외부 저장소를
도입하지 않았음을 `package.json`/`pnpm-lock.yaml` 대조로 확인했다(SC-012, 신규 npm 의존 0건). 해당
사항 외 보안 전용 조항은 없음.

---

## SEC-015-02 재감사 — state(CSRF) 서버측 검증

### 원 위협모델 (015 v1.1 재감사 확정)

> `naver.provider.ts` 가 클라이언트로부터 받은 `state` 값을 네이버 토큰 엔드포인트에 **그대로
> 전달만 할 뿐, 그 값이 실제로 유효한 CSRF 방지 근거인지 자체 검증하지 않는다(순수
> pass-through)**. 커스텀 URL 스킴(ADR-006) 기반 리다이렉트는 동일 스킴을 등록한 악성 앱에 의한
> 콜백 가로채기(scheme hijacking) 위험이 있으며, state 검증이 이 공격에 대한 1차 방어선이다.

### 하드닝 구현 검증 (4단계)

**1) 발급 — `oauth-state.service.ts:15-26`**

```ts
const state = randomBytes(32).toString('base64url');   // 256bit CSPRNG
const expiresAt = new Date(Date.now() + NAVER_STATE_TTL_MIN * 60_000);
await this.repo.deleteExpiredOAuthStates(new Date());    // opportunistic 정리
await this.repo.createOAuthState({ state, provider, expiresAt });
```

`node:crypto randomBytes(32)` 는 Node 20 CSPRNG — 예측·재현 불가(NFR-002). 코드 주석이 명시하듯
`globalThis.crypto`/`crypto.subtle`(Web Crypto) 대신 서버 native 모듈을 사용해 Secure Context 제약
(HTTP+비localhost 환경 실패, `~/.claude/rules/on-demand/typescript.md`)을 구조적으로 회피한다 —
브라우저 기반이 아닌 서버 발급이므로 이 제약 자체가 애초에 적용되지 않는 설계다. **확인.**

**2) 검증 — `social-auth.service.ts:61-69`**

```ts
if (provider === 'naver') {
  const ok = await this.oauthStateService.consume('naver', state);
  if (!ok) throw new UnauthorizedException('Invalid or expired state');
}
// ... (이후에만) providerImpl.verify(token, ...)
```

state 검증이 `providerImpl.verify()`(네이버 아웃바운드 2건: 토큰 교환 + 프로필 조회) **이전**에
실행됨을 코드 순서로 직접 확인했다. 무효 state 요청은 네이버 서버에 도달하지 않고 즉시 401
거부된다 — 원 위협모델의 "pass-through" 특성이 제거되었다. **확인.**

**3) 1회성 소비(원자성) — `auth.repository.ts:166-171`**

```ts
async consumeOAuthState(provider: string, state: string, now: Date): Promise<number> {
  const result = await this.prisma.oAuthState.deleteMany({
    where: { state, provider, expiresAt: { gt: now } },
  });
  return result.count;
}
```

확인+소비가 단일 SQL 문(조건부 `DELETE`)으로 원자화되어 있다. PostgreSQL 은 매칭 행에 대해
row-level lock 을 획득하므로, 동일 state 로 동시에 도달하는 두 트랜잭션 중 먼저 커밋하는
트랜잭션만 행을 삭제(`count===1`)하고, 뒤이은 트랜잭션은 재평가 시점에 행이 이미 사라져
`count===0`(거부)을 반환한다 — 애플리케이션 레벨 락 없이 DB MVCC 로 Check-Then-Act 레이스가
방지된다(`plan.md` §6 공유 상태 설계와 일치). `oauth-state.service.ts:28-32` 의
`consume()`(`return deletedCount === 1`)도 이 count 를 그대로 판단에 사용해 부울 반환 로직에
결함이 없음을 확인했다. **확인.**

**4) 엔드포인트 — `auth.controller.ts:63-69`**

`POST /auth/naver/state` 는 익명(인증 불요)이다. 로그인 이전에 CSRF nonce 를 발급하는 목적상
당연한 설계이며(로그인 전이므로 인증 주체가 없음), 기존 `/auth/social-login` 과 동일한 익명
엔드포인트 패턴이다. 이 설계 자체가 CSRF 방지 목적에 반하지 않는다 — nonce 발급은 익명이어도
무방하며, 방어의 핵심은 "이 nonce 를 서버가 발급했다는 사실 자체"와 "1회성 소비"에 있다. **확인.**

### 판정

원 SEC-015-02 의 정의된 결함("백엔드가 자체 검증하지 않는 pass-through")은 코드 수준에서 완전히
제거되었다. 발급→검증→소비 3단계 전부가 백엔드 내부에서 완결되며, 어떤 단계도 클라이언트가
제공한 값을 무검증 신뢰하지 않는다.

**추가 관찰(정보성, RESOLVED 판정에 영향 없음)**: 015 원 보고서는 state 검증을 "커스텀 URL 스킴
가로채기(scheme hijacking)에 대한 **1차 방어선**"으로 서술했다(전체 방어가 아님을 이미 명시). 본
하드닝은 "서버가 발급한 유효한 state 값만 통과"를 보장하지만, 만약 악성 앱이 동일 URL 스킴을
등록해 정당하게 발급된 state+code 쌍 자체를 가로챈다면(발급은 정상이나 소비 주체가 바뀌는
시나리오), 그 state 값 자체는 여전히 유효하므로 서버측 검증만으로는 구분할 수 없다 — 이는 원
보고서가 "1차 방어선"이라고 표현한 것과 정확히 일치하는 한계이며, 016 spec 의 FR-001~006(발급·
TTL·검증·거부·1회성·kakao/google 제외)이 정의한 범위를 완전히 충족했으므로 SEC-015-02 자체의
RESOLVED 판정과는 별개다. 네이티브 SDK 연동(운영 셋업, spec 범위 외)이 착수되면 이 잔여 시나리오는
"사후 운영 검증"(PROC-014 시나리오 1)에서 재평가 대상이다. 신규 SEC 번호 부여 없이 권고사항에만
기록한다(아래 권고 3).

**SEC-015-02: RESOLVED.**

---

## SEC-015-03 재감사 — redirect_uri 조건부 지원

### 원 위협모델 (015 v1.0/v1.1)

> 토큰 교환 요청에 `redirect_uri` 파라미터가 포함되지 않는다. 요구 여부는 `[TO-VERIFY]`(공식 문서
> 미확인) 상태.

### 구현 검증 — `naver.provider.ts:56-59`

```ts
const redirectUri = this.configService.get<string>('NAVER_REDIRECT_URI');
if (redirectUri) body.set('redirect_uri', redirectUri);
```

`getOrThrow` 가 아닌 `get`(optional) 조회 — 미설정 시 `undefined` 이며 `if` 분기 미진입, 파라미터
미포함(015 기존 동작과 100% 동일, fail-safe). 설정 시에만 포함(FR-007). `.env.example:34` 에
`NAVER_REDIRECT_URI=`(빈 값, 미설정 기본) 항목이 문서화되어 있음을 확인했다(NFR-005, SC-013).

### 판정

코드 구현은 완결됐다 — 미설정 상태에서 회귀 없음(현재 상태 그대로 안전), 설정 시 즉시 활성화되는
조건부 지원이 fail-safe 로 정확히 구현되었다. 다만 네이버가 실제로 이 파라미터를 요구하는지 여부는
여전히 `[TO-VERIFY]`(공식 문서 미확인)이며, 이는 spec.md 가 "범위 외"로 명시한 **운영 크레덴셜
등록·공식 문서 확인** 작업에 속한다. NFR-007 은 이 상태를 "RESOLVED 또는 잔존-권고(운영 확인
대기)" 양쪽 모두 허용 판정으로 정의했으므로, 코드 레벨 RESOLVED + 운영 확인 잔존이라는 현재 상태가
정확히 SC-015 의 정의된 합격 조건에 해당한다.

**SEC-015-03: RESOLVED(코드 레벨) / 잔존-권고(운영 확인 대기, NFR-007 정의된 허용 상태).**

---

## 신규 공격 표면 점검 (016 이 도입한 표면)

### 1) 익명 state 발급 엔드포인트 flooding (DoS)

- **위험**: `POST /auth/naver/state` 는 인증·rate limit 없이 무제한 호출 가능. 매 호출마다
  `oauth_states` 행 1개 INSERT.
- **완화 확인**: (1) TTL 10분(`NAVER_STATE_TTL_MIN`) — 무한정 누적되지 않음. (2) 발급 직전
  `deleteExpiredOAuthStates`(opportunistic 정리)로 이미 만료된 행을 제거 — `oauth-state.service.ts:22`
  코드로 확인. (3) `@@index([expiresAt])`(schema.prisma:170) — 정리 쿼리 성능 저하 없음.
- **잔여 위험**: opportunistic 정리는 "이미 만료된" 행만 제거하므로, TTL 10분 이내에 지속적으로
  대량 요청이 유입되면(예: 초당 수백 건) 그 순간의 테이블 크기는 요청률 × TTL 만큼 일시적으로
  증가할 수 있다. 이는 IP 단위 rate limiting 부재(SEC-004, 015 에서 이미 별도 과제로 인지된 기존
  갭)와 동일한 근본 원인이며, `POST /auth/naver/state` 가 이 갭의 신규 인스턴스를 하나 추가한
  것이지 새로운 근본 원인은 아니다. plan.md 위험 완화 설계 절이 이 위험을 이미 인지·기술했고
  SEC-004 후속 과제로 명시적으로 위임했다(spec 범위 외).
- **판정**: **정보성(Informational)** — Low 미만. 근본 원인(rate limit 전역 부재)이 016 신규
  결함이 아니라 기존에 인지된 갭의 연장이므로 016 자체에 신규 Low/Medium 항목을 부여하지 않되,
  SEC-004 추적 시 본 엔드포인트도 대상에 포함하도록 권고에 기록한다(아래 권고 1).

### 2) state 예측·재현 (guessing)

- 256bit CSPRNG(`randomBytes(32)`) — 무차별 대입으로 유효 state 를 추측할 확률은 무시 가능한
  수준(2^256 공간, TTL 10분 내 유효). SC-010(연속 20회 발급 시 전부 상이) 테스트로 실제 비결정성도
  간접 확인됨(coverage.md PASS). **문제 없음.**

### 3) state replay (재전송)

- delete-on-consume 원자적 조건부 DELETE 로 방어됨(위 SEC-015-02 §3 참조). 동시 요청 시에도
  PostgreSQL row-level lock 기반으로 정확히 1건만 성공. **문제 없음.**

### 4) timing / enumeration (검증 실패 사유 노출)

- `social-auth.service.ts:67` — state 불일치·만료·미제공 모든 실패 케이스가 동일한 메시지
  (`'Invalid or expired state'`)와 동일한 401 상태코드로 응답한다. "값이 존재했었는지",
  "만료였는지", "애초에 발급 이력이 없었는지"를 구분하는 정보가 응답에 노출되지 않는다 —
  enumeration 공격에 활용할 정보 누출 없음. **문제 없음.**

### 5) oauth_states 데이터 민감도

- `state`(난수 문자열)·`provider`·`expiresAt`·`createdAt` 만 저장 — PII 아님(spec-input Q12/Q22,
  plan.md 데이터 모델 절과 일치). `oauth-state.service.ts`·`auth.repository.ts` 전체를 검토한 결과
  `console.log`/`Logger` 등으로 state 원문을 로깅하는 코드 없음(grep 0건). **문제 없음.**

---

## 카카오·구글 회귀 확인

- `git diff 6b64c24 -- apps/backend/src/modules/auth/social/kakao.provider.ts
  apps/backend/src/modules/auth/social/google.provider.ts` 결과 **diff 0(완전 무변경)** — 직접 실행
  확인.
- `social-auth.service.ts:61-69` 의 state 검증 분기는 `if (provider === 'naver')` 로 명시적으로
  게이팅되어 있어, kakao/google 요청은 `oauthStateService.consume` 자체를 호출하지 않고 곧바로
  `providerImpl.verify(token)`(state 인자 없이 단일 인자 호출, `:75-76` 삼항 분기)로 진입한다 —
  코드 경로 물리적 확인.
- `AUTO_LINK_PROVIDERS = new Set(['kakao', 'google'])`(:36) 무변경 — naver 자동연동 배제(SEC-015-01
  RESOLVED, 015 v1.1 확정) 상태도 그대로 유지됨을 재확인. 본 spec 이 계정해석 로직·화이트리스트를
  건드리지 않았음(NFR-003)이 코드로 확인된다.
- coverage.md 기록(SC-011 PASS, 015 카카오·구글 기존 단위 스위트 100% PASS, 회귀 0)과 코드 검토
  결과가 일치한다.

**kakao/google 경로: 회귀 0건 확인.**

---

## 취약점 목록

### SEC-015-02 — state(CSRF) 파라미터의 서버측 실질 검증 부재 (015 계승)

- **심각도**: Medium → **RESOLVED**
- **OWASP**: A01:2021 (Broken Access Control, CSRF 하위 유형)
- **위치**: `apps/backend/src/modules/auth/social/oauth-state.service.ts`(신규),
  `apps/backend/src/modules/auth/auth.repository.ts:157-178`(신규 메서드),
  `apps/backend/src/modules/auth/social-auth.service.ts:61-69`(검증 배선)
- **재감사 결과**: 서버측 발급(`randomBytes(32)` CSPRNG)·TTL(10분)·`verify()` 호출 이전 검증·원자적
  1회성 소비(조건부 `deleteMany`)를 코드로 확인. 원 위협모델(클라이언트 값 무검증 pass-through)이
  완전히 제거됨.
- **상태**: **RESOLVED.**

### SEC-015-03 — redirect_uri 미검증(토큰 교환 요청에 미포함) (015 계승)

- **심각도**: Low → **RESOLVED(코드 레벨) / 잔존-권고(운영 확인 대기)**
- **OWASP**: A05:2021 (Security Misconfiguration) 인접
- **위치**: `apps/backend/src/modules/auth/social/naver.provider.ts:56-59`
- **재감사 결과**: `NAVER_REDIRECT_URI` optional 조회 + 조건부 포함(fail-safe) 구현 확인. 실제
  네이버 요구 여부는 여전히 `[TO-VERIFY]`(운영 셋업 범위, spec 범위 외 명시).
- **상태**: **RESOLVED(코드 레벨) / 잔존-권고.** NFR-007 이 정의한 허용 판정 범위 내.

### (신규, 정보성) 익명 state 발급 엔드포인트의 flooding 노출 — SEC-004 계열

- **심각도**: Informational (Low 미만)
- **OWASP**: A04:2021 (Insecure Design) 인접 — rate limiting 부재
- **위치**: `apps/backend/src/modules/auth/auth.controller.ts:63-69`(`POST /auth/naver/state`)
- **설명**: 익명·무제한 호출 가능. TTL+opportunistic 정리로 정상 상태 테이블 크기는 바운딩되나,
  TTL 윈도우 내 고빈도 요청 시 일시적 테이블 증가 가능. 근본 원인은 016 신규가 아니라 기존
  SEC-004(전역 rate limit 부재, 015 인지·범위 외)의 연장.
- **상태**: 정보성 기록(차단 사유 아님). SEC-004 후속 추적 시 본 엔드포인트 포함 권고.

---

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-002 | state 예측 불가·TTL 보관·1회성 검증·소비 | **이행** | `randomBytes(32)` CSPRNG, TTL 10분, delete-on-consume 원자적 소비 코드 확인(SC-010 PASS) |
| NFR-003 | 카카오·구글 기존 동작 회귀 없음 | **이행** | `kakao.provider.ts`/`google.provider.ts` diff 0, `provider==='naver'` 게이팅 확인, `AUTO_LINK_PROVIDERS` 무변경 |
| NFR-004 | 신규 외부 데이터 저장소 미도입 | **이행** | PostgreSQL 신규 테이블 1개(`oauth_states`)만 추가, Redis 등 신규 npm 의존 0건(SC-012) |
| NFR-006 | SEC-015-02 재감사 RESOLVED 판정 | **충족** | 본 감사 "SEC-015-02 재감사" 절 — RESOLVED 확정 |
| NFR-007 | SEC-015-03 재감사 RESOLVED 또는 잔존-권고 판정 | **충족** | 본 감사 "SEC-015-03 재감사" 절 — RESOLVED(코드)/잔존-권고 확정, NFR-007 정의된 허용 범위 내 |
| SC-014 | SEC-015-02 RESOLVED 판정 | **PASS** | 위 SEC-015-02 취약점 목록 항목 참조 |
| SC-015 | SEC-015-03 RESOLVED/잔존-권고 판정 | **PASS** | 위 SEC-015-03 취약점 목록 항목 참조 |

---

## OWASP Top 10 매핑

| 항목 | 점검 결과 |
|---|---|
| A01 접근 제어 취약점 | state CSRF 검증 신설로 강화(SEC-015-02 RESOLVED). `POST /auth/naver/state` 익명은 nonce 발급 목적상 의도된 설계(민감 자원 미접근). |
| A02 암호화 실패 | 해당 없음(신규 암호화 로직 없음. `randomBytes` 는 난수 발급이지 암호화가 아님). `client_secret`(naver.provider.ts) 은 015 그대로 무노출 확인. |
| A03 인젝션 | Prisma ORM 파라미터 바인딩 사용(`deleteMany({ where: {...} })`) — SQL 인젝션 경로 없음. |
| A04 안전하지 않은 설계 | state flooding 정보성 항목(위 참조) 외 신규 결함 없음. delete-on-consume 원자성 설계는 §6 동시성 검토와 일치. |
| A05 보안 설정 오류 | redirect_uri 조건부 처리 fail-safe(SEC-015-03 RESOLVED). `.env.example` 문서화 확인(SC-013). |
| A06 취약한 컴포넌트 | 신규 npm 의존 0건(SC-012) — 해당 없음. |
| A07 인증·세션 관리 | state 는 세션이 아닌 1회성 CSRF nonce — 소비 후 즉시 무효화 확인. |
| A08 소프트웨어 무결성 | 해당 없음(CI/CD·서명 관련 변경 없음). |
| A09 로깅·모니터링 | state 원문 미로깅 확인(§5 데이터 민감도 참조). 검증 실패 로깅 여부는 별도 요구사항 없음(spec 범위 외). |
| A10 SSRF | 해당 없음(신규 아웃바운드 호출 없음, 기존 네이버 엔드포인트 2건 015 그대로). |

---

## 권고사항

1. **(정보성 항목 추적)** `POST /auth/naver/state` 익명 엔드포인트를 기존 SEC-004(소셜 로그인
   아웃바운드 rate limit 부재, 015 gaps 인지) 후속 과제 범위에 명시적으로 포함할 것을 권고한다.
   본 감사는 이를 차단 사유로 삼지 않았으나(TTL+opportunistic 정리로 구조적 바운딩), 전역 rate
   limiting 도입 시 이 엔드포인트를 누락 없이 포함해야 한다.
2. **(context.md 갱신 권고, PROC-013-03)** SEC-015-02·SEC-015-03 이 모두 RESOLVED 로 전이되었으므로,
   015 재감사 권고 2가 `context.md §6` 등재를 권고했던 문구("네이버 소셜 로그인의 CSRF state
   파라미터는 현재 백엔드에서 클라이언트 값을 그대로 전달만 하며 자체 검증하지 않는다...")는 이제
   **더 이상 유효하지 않다**. context.md §6 에 해당 항목이 이미 등재되어 있다면 제거하거나
   "016-naver-state-redirect-hardening 에서 해소됨"으로 갱신할 것을 Docs/Retrospective 에 권고한다
   (Security Agent 는 context.md 직접 수정 권한 없음 — agent-rules.md §3.1).
3. **(scheme hijacking 잔여 시나리오 기록 권고)** SEC-015-02 재감사 절의 "추가 관찰" — 서버측 state
   검증은 "서버가 발급한 유효 state 만 통과"를 보장하지만, 악성 앱의 URL 스킴 가로채기로 정당하게
   발급된 state+code 쌍 자체가 탈취되는 시나리오는 방어 범위 밖이다(015 원 보고서가 이미 "1차
   방어선"으로 명시한 한계와 일치, 신규 결함 아님). 네이티브 SDK 연동(운영 셋업) 착수 시 사후 운영
   검증(spec.md PROC-014 시나리오 1)에서 이 잔여 시나리오를 재점검할 것을 권고한다.
4. **gaps.md/GAP-015-04 및 관련 항목 상태 갱신 권고**: 015 security-report.md 권고 5(GAP-015-04
  "Security 재감사 대기" → "해결됨" 전이)가 SEC-015-01 RESOLVED 로 이미 처리되었는지 Docs/main
  session 확인 요망. 본 016 재감사로 SEC-015-02/03 도 RESOLVED 확정되었으므로, 015/016 gaps.md 상의
  대응 항목이 있다면 동일하게 상태 갱신을 권고한다(Security Agent 직접 수정 권한 없음).
