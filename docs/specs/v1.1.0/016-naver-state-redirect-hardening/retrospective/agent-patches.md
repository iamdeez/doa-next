---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 미제공]
상태: 적용 완료
---

# Agent Patches: 016-naver-state-redirect-hardening

## 목차

- [개요](#개요)
- [PATCH-016-01: Test Agent(EXECUTION) — STALE_SC cross-version 주석 false-positive 완화](#patch-016-01)
- [context.md / infra.md 갱신 패치 (PATCH-CXT)](#contextmd--inframd-갱신-패치-patch-cxt)

---

## 개요

본 사이클(016)은 서킷 브레이커·재작업·강제 중단 없이 gate:PASS 로 정상 완주했다. main OBS 기록
0건(agent-observations.md 미존재)이므로 gaps.md + pipeline-log.md 2중 소스로 분석했다(agent-rules.md §12).

- **전역 agent 패치**: 1건(PATCH-016-01, STALE_SC cross-version — 적합성 2단계 검토 통과).
- **context.md/infra.md 갱신 패치**: 5건(PATCH-CXT-016-01~05, GAP-016-01~04 해소 + Security 권고 2 반영).
- **프로세스 패치**: process-patches.md 참조(PROC-016-01 base commit·PROC-016-02 시각 앵커).

> [MUST NOT] 본 Agent 는 context.md/infra.md·Agent 정의·전역 규칙을 직접 수정하지 않는다.
> main session 이 사용자 승인 후 적용한다(agent-rules.md §12 절차).

---

## PATCH-016-01

### Test Agent(EXECUTION) — STALE_SC 판정 시 선행 spec 잔존 SC 번호의 cross-version false-positive 완화

- **대상 파일**: `~/.claude/agents/05-test.md` (EXECUTION 모드 STALE_SC 판정 절차, PATCH-A18 정규식)
- **대상 섹션**: STALE_SC 검출 정규식·출처 판정(PATCH-A18) / 옵션 A/B/C 확인(PATCH-A17)
- **현재 내용**(pipeline-log 발췌 기반): 5b EXECUTION 이 §F 회귀 마이그레이션으로 흡수한 015 테스트
  파일에서 015 spec 잔존 SC 번호 3건(social-auth.service.autolink-policy.spec.ts:6 SC-006·:118 SC-008,
  social-auth.service.naver.spec.ts:249 SC-010)을 STALE_SC 로 검출했다(pipeline-log L236). 이들은 016
  SC 와 **번호는 겹치나 의미가 다른** 015 잔존 마커였고, exact-match 정규식이 버전 마커 부재로
  기계적 구분 불가하여 3건 미silence → 사용자 옵션 확인(AWAITING_USER)까지 유발(L238-242). 직접
  대조로 혼동 위험 낮음을 확인 후 옵션 A(015 버전 마커 부착)로 정정(L250-254).
- **변경 내용**: EXECUTION 모드 STALE_SC 판정에 **cross-version 주석 사전 인식** 절차 추가:
  1. §F 회귀 마이그레이션(선행 spec 테스트 흡수)으로 검출 범위에 들어온 파일은, SC 주석에
     `(vX.Y.Z/NNN spec)` 형식 **버전 마커가 없더라도** 해당 파일이 선행 spec 산출물의 흡수분임을
     git blame/파일 출처로 판별되면 STALE_SC 판정 전 "cross-version 후보"로 선분류한다.
  2. cross-version 후보는 옵션 확인(AWAITING_USER) 진입 전에, 본 spec 의 SC-XXX 매핑표와 대조하여
     "본 spec SC 와 동일 번호이나 다른 검증 대상"이면 **기본 정정안 = 옵션 A(선행 버전 마커 부착,
     renumber 아님)**를 default 로 제시하여 사용자 왕복을 최소화한다.
  3. 신규 작성 테스트(§F 흡수 아님)의 SC 주석은 처음부터 `(vX.Y.Z/NNN spec)` 마커를 포함하도록
     Test Authoring Contract(5a AUTHORING)에 마커 부착을 권고 — 발생 자체를 상류에서 차단.
- **변경 근거**: pipeline-log L236·L248·L254 (016 5b STALE_SC 3건 옵션 A 정정). §F 마이그레이션이
  후속 spec 마다 반복되므로(015→016 실증) 동일 false-positive 재발 구조.
- **적합성**: 범용 O(선행 spec 테스트를 후속 spec 이 흡수하는 SDD 일반 패턴에 적용, 언어·도구 무관) /
  역할정합 O(Test Agent EXECUTION 의 STALE_SC 판정·정합성 점검 범위). 재배치 불요.
- **상태**: 적용 완료 (`~/.claude/agents/05-test.md` — 변경 로그: `~/.claude/docs-change-logs/2026-07-03-002.md`)

---

## context.md / infra.md 갱신 패치 (PATCH-CXT)

> [MUST NOT] 본 Agent 는 context.md/infra.md 를 직접 수정하지 않는다. main session 이 사용자 확인 후
> 적용한다. PROC-002 코드 검증: 각 패치의 "코드 검증" 항목에 grep/Read 로 확인한 코드 위치·일치 여부 기재.
>
> **테이블 수 사실 정정(PROC-002)**: 현재 32테이블·15차 → 016 반영 후 **33테이블·16차**(Task 프롬프트의
> "33→34"는 부정확 — retrospective-report.md 부록 참조). 아래 패치는 검증된 32→33 을 사용한다.

### PATCH-CXT-016-01: context.md — POST /auth/naver/state·OAuthStateService 반영

- 대상 파일: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- 대상 섹션: §2 핵심 도메인 모듈 목록 `auth` 행(L75) + §1 개요(L21, 선택)
- 변경 내용:
  1. **§2 auth 행(L75)**: 기존 "소셜 로그인(POST /auth/social-login — 카카오·구글·네이버 3종. 네이버는
     code-exchange ... 혼합)" 서술 끝에 additive: "+ **`POST /auth/naver/state`(익명, CSRF state 발급)**
     — `OAuthStateService`(`social/oauth-state.service.ts`)가 state 발급(randomBytes(32) base64url·TTL
     10분)·검증·원자적 1회성 소비(delete-on-consume). naver code-exchange 는 로그인 전 이 엔드포인트로
     발급받은 state 를 echo, 서버가 verify 이전 검증(SEC-015-02 하드닝, 016)".
  2. **§1 개요(L21, 선택)**: "소셜로그인(카카오·구글)" 표기가 이미 §4 등에서 네이버 3종으로 갱신됨 —
     §1 은 요약 스냅샷이므로 변경 필수 아님(현행 유지 허용).
- 변경 근거: GAP-016-01 (Docs 등재, research PATCH-A11)
- 코드 검증 (PROC-002):
  - `apps/backend/src/modules/auth/auth.controller.ts` L16 `import { OAuthStateService } from './social/oauth-state.service'`·L39 생성자 DI·L63 `@Post('naver/state')`·L66 `async naverState()`·L68 `return this.oauthStateService.issue('naver')` — grep 직접 확인, 신규 익명 엔드포인트 실재.
  - `apps/backend/src/modules/auth/auth.module.ts` `OAuthStateService` providers 등록(gaps L9/L27 grep) — DI 등록 실재.
  - `apps/backend/src/modules/auth/social-auth.service.ts` L58 생성자 4번째 인자·L64 `if (provider === 'naver')`·L65 `oauthStateService.consume('naver', state)` — verify 이전 검증 배선 실재(grep). → 변경 후 텍스트 코드 사실과 **일치**.

### PATCH-CXT-016-02: context.md — oauth_states 신규 테이블(33테이블·16차)

- 대상 파일: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- 대상 섹션: §4 데이터 모델 — 스키마 분리 구조 블록(L182 users 스키마 목록) + 실재 상태 서술(L193) + social_accounts 인접 서술(L198 아래)
- 변경 내용:
  1. **L193 실재 상태**: "**32개 테이블 실체화**(Prisma migrate 적용, 마이그레이션 15차) — `users`
     9(...)" → "**33개 테이블 실체화**(마이그레이션 16차) — `users` **10**(+ notifications·
     password_reset_otps·social_accounts·**oauth_states**) · ..." (users 스키마 테이블 수 9→10, 총계
     32→33, 15차→16차).
  2. **social_accounts(014) 서술 행 다음에 신규 행 추가**: "`users.oauth_states`(016): 네이버
     code-exchange CSRF state — state(UNIQUE·base64url 256bit CSPRNG)·provider('naver')·expiresAt(TTL
     10분)·createdAt, `@@index([expiresAt])`(만료 정리)·`@@map("oauth_states")`·`@@schema("users")`
     (마이그레이션 `20260703070000_add_oauth_states`). **FK 없음** — 익명 발급(로그인 이전, userId
     미결정) 독립 엔티티. 1회성 소비는 조건부 `deleteMany`(row-level lock)로 원자화(ADR-003).
     감사·PII 아님(delete-on-consume, consumedAt 미보유)".
  3. **§4 스키마 분리 구조 블록(L182 `schema: users` 목록)**: users 목록에 `oauth_states` 추가.
- 변경 근거: GAP-016-02 (Docs 등재)
- 코드 검증 (PROC-002):
  - `apps/backend/prisma/schema.prisma` L163 `model OAuthState`·L165 `state String @unique`·L166
    `provider String`·L167 `expiresAt DateTime`·L168 `createdAt DateTime @default(now())`·L170
    `@@index([expiresAt])`·L171 `@@map("oauth_states")`·L172 `@@schema("users")` — grep 직접 확인.
  - `apps/backend/prisma/migrations/20260703070000_add_oauth_states/migration.sql` 실재(DB Design 산출).
  - 현재 32테이블·15차 기준: context §4 L193 + DB Design data-model.md "16차(기존 15차 이후)" 대조 —
    015 는 DB 무변경(§7 L261). → 32→33·15→16 **일치**.

### PATCH-CXT-016-03: context.md §6 — SEC-015-02/03 RESOLVED 전환 (Security 권고 2, PROC-013-03)

- 대상 파일: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- 대상 섹션: §6 알려진 제약 및 기술 부채 (L244·L246·L247)
- 변경 내용:
  1. **L246 행 RESOLVED 전환**: "네이버 state(CSRF) 서버측 미검증 (SEC-015-02, Medium)" 행을 **RESOLVED
     표기**(다른 RESOLVED 행과 동일한 `~~취소선~~` 패턴)로 전환: "~~네이버 state(CSRF) 서버측 미검증
     (SEC-015-02, Medium)~~ **RESOLVED (016-naver-state-redirect-hardening)** — 서버측 state 발급
     (`OAuthStateService`, randomBytes(32) CSPRNG)·verify 이전 검증·원자적 delete-on-consume(row-level
     lock replay 방어)으로 원 위협모델(클라이언트 값 pass-through 미검증) 완전 제거. 관련 spec: 016".
     (Security 권고 2 — 015 가 등재 권고했던 문구가 더 이상 유효하지 않음).
  2. **L247 행 조건부 RESOLVED 전환**: "네이버 redirect_uri 요구 여부 미확정 (SEC-015-03, Low)" →
     "네이버 redirect_uri — **코드레벨 RESOLVED (016)** / 잔존-권고(운영 확인 대기): `NAVER_REDIRECT_URI`
     optional 조회·조건부 포함(fail-safe) 구현. 네이버 공식 문서상 실제 요구 여부는 `[TO-VERIFY]`
     (운영 셋업 범위). 완전 해소는 운영 크레덴셜 등록·공식 문서 확인 시점".
  3. **L244 소셜 로그인 아웃바운드 rate limit 부재(SEC-004) 행**(선택, Security 권고 1): "kapi.kakao.com·
     oauth2.googleapis.com·nid.naver.com·openapi.naver.com" 에 신규 익명 엔드포인트 `POST /auth/naver/state`
     를 SEC-004 추적 범위에 포함 명시(TTL+opportunistic 정리로 바운딩되나 전역 rate limit 도입 시 포함).
- 변경 근거: GAP-016-03 (Security 재감사 확정 후 처리 조건 충족 — security-report.md `status:COMPLETE`
  `gate:PASS`, SEC-015-02 RESOLVED·SEC-015-03 RESOLVED(코드)/잔존 확정) + Security 권고 1·2 (PROC-013-03)
- 코드 검증 (PROC-002):
  - `apps/backend/src/modules/auth/social/naver.provider.ts` L58 `const redirectUri =
    this.configService.get<string>('NAVER_REDIRECT_URI')`·L59 `if (redirectUri) body.set('redirect_uri',
    redirectUri)` — optional 조회·조건부 포함 fail-safe 실재(grep 확인).
  - `apps/backend/src/modules/auth/social-auth.service.ts` L64-65 verify 이전 `oauthStateService.consume`·
    `apps/backend/src/modules/auth/auth.repository.ts` consumeOAuthState 조건부 deleteMany(security-report.md
    §3 인용 L166-171) — 원자적 소비 실재. → RESOLVED 판정 코드 사실과 **일치**.
  - **선행 조건 충족 확인**: gaps.md GAP-016-03 이 "Security 재감사 결과 확정 전 갱신 착수 금지"로
    조건화 → security-report.md 단계 완료(pipeline-log L349-354, gate:PASS) 후이므로 갱신 착수 가능.

### PATCH-CXT-016-04: context.md §7 — 갱신 이력 016 행 추가

- 대상 파일: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- 대상 섹션: §7 갱신 이력 (L256~ 표)
- 변경 내용: 015 행 위에 신규 행 prepend — "2026-07-03 | v1.1.0/016-naver-state-redirect-hardening —
  네이버 code-exchange CSRF state 서버측 하드닝. `POST /auth/naver/state`(익명 발급)·`OAuthStateService`·
  `users.oauth_states` 신규(33테이블·16차)·verify 이전 state 검증·redirect_uri 조건부(NAVER_REDIRECT_URI).
  SEC-015-02 RESOLVED·SEC-015-03 코드 RESOLVED/잔존. §2 auth·§4·§6·§7 갱신 | 016-naver-state-redirect-hardening".
- 변경 근거: context.md 갱신 관례(013/014/015 동일 패턴, §7 는 00-context-rules §6 템플릿 표준 갱신 이력
  섹션이며 "스펙 버저닝 이력" 레거시 아님 — PROC-R02 비해당). PATCH-CXT-015-01 §5 와 동일 판정.
- 코드 검증 (PROC-002): 갱신 이력은 코드 참조가 아닌 메타 이력 — 위 PATCH-CXT-016-01~03 의 코드 검증
  결과를 요약 인용. 별도 grep 불요.

> **PROC-R02 확인**: context.md §7 은 00-context-rules §6 템플릿이 매 spec 완료 시 신규 행 추가를
> 명시한 표준 changelog 섹션이며 "버저닝 이력/스펙 버저닝 이력"(PROC-R02 제거 대상 레거시)이 아니다.
> 본 프로젝트 context.md 에 별도 "스펙 버저닝 이력" 표는 존재하지 않으므로 PROC-R02 제거 패치 대상 없음.
> §1 "현재 버전"은 v1.1.0 유지(patch 단위 spec, minor 버전 불변) — 갱신 불요.

### PATCH-CXT-016-05: infra.md — NAVER_REDIRECT_URI 배포 체크리스트·마이그레이션·갱신 이력

- 대상 파일: `/Users/krystal/workspace/doa/doa-next/.claude/docs/infra.md`
- 대상 섹션: §7 배포 전 확인 체크리스트(L194 OAuth 항목) + §8 알려진 인프라 제약(L214 소셜 아웃바운드
  행) + §9 갱신 이력(존재 시)
- 변경 내용:
  1. **§7 OAuth 항목(L194)**: 기존 "OAuth 소셜 로그인 크레덴셜 Fly secret ... 네이버 개발자센터
     redirect URI 등록·실 크레덴셜 발급은 운영 셋업 deferred" 서술에 additive: "+ **`NAVER_REDIRECT_URI`
     (선택 — 미설정 시 기존 동작과 동일하게 토큰 교환에 redirect_uri 미포함이 기본값. 네이버 공식
     문서로 요구 여부 확인 후 필요 시 설정, 코드 변경 불요 — 016)".
  2. **§8 소셜 아웃바운드 의존성 행(L214)**: "마이그레이션 `20260701064209_add_social_accounts`
     재사용(015 DB 무변경)" 서술에 additive: "016 은 `20260703070000_add_oauth_states`(users.oauth_states,
     CREATE TABLE only·기존 ALTER 없음) 신규 — `prisma migrate deploy` 자동 적용. `POST /auth/naver/state`
     익명 엔드포인트는 SEC-004 아웃바운드 rate limit 부재 추적 범위에 포함(Security 권고 1)".
  3. **§9 갱신 이력**(infra.md 에 §9 존재 시): 016 신규 행 추가 — "v1.1.0/016 — NAVER_REDIRECT_URI
     선택 환경변수·oauth_states 마이그레이션(16차). §7·§8 갱신". *현 infra.md 에 §9 갱신 이력 표가
     명시 부재*(L215 에서 §8 종료) — 존재하지 않으면 신규 이력 섹션을 임의 추가하지 않는다(부재-공지성
     회피). §7·§8 additive 만 적용.
- 변경 근거: GAP-016-04 (Docs 등재, plan 배포 영향 절)
- 코드 검증 (PROC-002):
  - `grep -n "NAVER_REDIRECT_URI" .claude/docs/infra.md` → 0건(미등재 확인, gaps 재확인).
  - `apps/backend/.env.example` L34 `NAVER_REDIRECT_URI=`(빈 값, 미설정 기본) 실재(grep 확인, NFR-005·SC-013).
  - `apps/backend/prisma/migrations/20260703070000_add_oauth_states/migration.sql` 실재(DB Design 산출).
  - → 변경 후 텍스트 코드 사실과 **일치**. 신규 컨테이너·아웃바운드 없음(plan 배포 영향 — Deploy 비활성)
    이므로 §2 토폴로지·§3 배포 방식 등 그 외 섹션 갱신 불요.
