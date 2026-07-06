---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-04 [시각 미확인, spawn 기준 06:36]
상태: 작성중
---

# Agent Patches: 018-auth-security-hardening

## 목차

- [전역 Agent 정의 패치](#전역-agent-정의-패치)
  - [PATCH-018-01](#patch-018-01)
- [context.md / infra.md 갱신 패치 (PATCH-CXT)](#contextmd--inframd-갱신-패치-patch-cxt)
  - [PATCH-CXT-001](#patch-cxt-001)
  - [PATCH-CXT-002](#patch-cxt-002)
  - [PATCH-CXT-003](#patch-cxt-003)
  - [PATCH-CXT-004](#patch-cxt-004)
  - [PATCH-CXT-005](#patch-cxt-005)
- [context.md §7 갱신 이력 처리 결정](#contextmd-7-갱신-이력-처리-결정)

> 본 파일의 모든 패치는 **후보**다. 적용 여부·시점은 main session 이 사용자 승인 후 결정한다(agent-rules.md §12).
> Retrospective Agent 는 context.md/infra.md 를 직접 수정하지 않는다.

---

## 전역 Agent 정의 패치

### PATCH-018-01

**05-test.md (AUTHORING) — best-effort 내부 try/catch 서비스를 전체 mock 하여 throw 시키는 wiring 테스트 안티패턴 명시**

- **대상 파일**: `~/.claude/agents/05-test.md` (Mode: AUTHORING 절 — 테스트 작성 절차, 기존 PATCH-03 "mock 이 production 실제 분기 경로를 재현" 하위)
- **대상 섹션**: AUTHORING 모드 테스트 파일 작성 절차 (mock 대상 선정 지침)
- **현재 내용**: PATCH-03 이 "mock 이 production 실제 분기 경로를 재현해야 한다"는 원칙을 명시하나, **내부적으로 예외를 삼키는(best-effort, 각 public 메서드 try/catch) 서비스**를 wiring 테스트에서 다룰 때의 구체적 anti-pattern 예시가 없다. 그 결과 "서비스 전체를 mock 하여 강제 throw" 하는 방식이 채택되어, production 계약상 도달 불가능한 분기를 전제한 RED 테스트가 작성될 수 있다.
- **변경 내용**: AUTHORING 절차에 다음 [SHOULD] anti-pattern 지침 추가 —

  > **[SHOULD] [agent:test] best-effort(내부 try/catch 로 예외를 삼키는) 서비스의 호출부(wiring) 테스트를 작성할 때, 그 서비스 전체를 mock 으로 대체하여 강제로 throw 시키지 않는다.** 서비스가 계약상 모든 메서드에서 예외를 삼키도록 구현되어 있으면, 전체 mock throw 는 production 에서 도달 불가능한 분기를 전제하는 **테스트 전제 조건 오류**가 된다. 대신 **실 서비스 인스턴스를 생성하고 그 내부 의존(예: `PinoLogger.warn`)만 throw mock** 하여 plan.md 테스트 전략표의 Input(도달 가능한 실제 예외 경로)을 재현한다. plan.md Input 이 "logger.warn throw mock" 처럼 내부 의존 레벨을 지정하면 그 지정을 우회하지 않는다.

- **변경 근거**: GAP-018-02 — 5a AUTHORING 이 `auth.service.spec.ts` SC-017 wiring 2건에서 `SecurityAuditLogger` 전체를 throw mock 하여 production 도달불가 분기(`SecurityAuditLogger` 3개 메서드 전부 내부 try/catch)를 전제 → 5b [B] 판정 → 5a 재작업(실 인스턴스 + `PinoLogger.warn` throw mock 으로 정정, production 무변경). 재작업 1회 유발.
- **적합성**: 범용 O(모든 프로젝트의 best-effort 서비스 wiring 테스트에 적용 — 언어 불문 테스트 seam 설계 원칙) / 역할정합 O(05-test.md AUTHORING 의 mock 대상 선정 절차 범위 내, PATCH-03 하위 구체화)
- **관찰 횟수 / 강제도**: 018 1회 관찰(신규). 3회 반복 임계 미달이나 명확한 설계 원칙·한 줄 규칙으로 재발 차단 가능하며 기존 PATCH-03 을 구체화하는 additive 성격 → **채택 권고, 강제도 SHOULD**. 다음 차수 재관찰 시 MUST 상향 검토.
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: docs-change-logs/2026-07-04-002.md)

---

## context.md / infra.md 갱신 패치 (PATCH-CXT)

> PROC-002 준수 — 각 PATCH-CXT 는 Retrospective Agent 가 대상 코드 위치를 grep/Read 로 직접 재검증한 결과를 "코드 검증" 항목에 명시한다.

### PATCH-CXT-001

**context.md §6 — auth 도메인 선행 보안 부채 5개 행 RESOLVED 전이 (018)**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채
- **변경 내용**: 아래 5개 행을 기존 RESOLVED 표기 컨벤션(`~~항목~~ **RESOLVED (spec)** — 근거`)에 맞춰 전이한다. 행 삭제가 아닌 취소선 전이(§6 의 기존 RESOLVED 항목들과 동일 서식 유지):
  1. `소셜 신규가입 경로 orphan user 위험 (SEC-002/GAP-014-01, Medium)` → `~~...~~ **RESOLVED (018-auth-security-hardening)** — path 3c 를 runInTransaction 으로 원자화(createUser+createSocialAccount 양쪽 롤백), P2002 폴백은 트랜잭션 외부 유지(SC-011 회귀 방지)`
  2. `소셜 로그인 아웃바운드 rate limit 부재 (SEC-004/GAP-014-06, Low)` → `~~...~~ **RESOLVED (018)** — social-login(10/60s)·naver/state(20/60s) @Throttle 적용 + 전역 20/60s 기본값`
  3. `auth reset-password IP rate limit 부재 (SEC-002/GAP-013-09, Medium)` → `~~...~~ **RESOLVED (018)** — forgot-password(5)·find-email(5)·reset-password(10) 개별 @Throttle IP rate limit`
  4. `resetPassword refresh token revoke 비원자 (SEC-003/GAP-013-10, Medium)` → `~~...~~ **RESOLVED (018)** — revokeAllRefreshTokensByUser tx-aware 전환 + resetPassword 가 markOtpConsumed+revoke 를 단일 runInTransaction 통합`
  5. `auth 보안 감사 로그 부재 (SEC-004/GAP-013-11, Medium)` → `~~...~~ **RESOLVED (018)** — SecurityAuditLogger 3종(otpVerificationFailed·rateLimitExceeded·findEmailAccessed) 실 호출 + maskEmail/maskPhone 마스킹, best-effort 내부 try/catch`
- **변경 근거**: GAP-018-03 (Docs Agent 등록) + Security Agent 독립 재검증(security-report.md "선행 보안 부채 RESOLVED 판정" 4절 전건 동의).
- **코드 검증** (PROC-002 — 본 Agent 직접 Read):
  - (1) `social-auth.service.ts:133-149` — `this.prisma.runInTransaction(async () => { const u = await this.repo.createUser(...); await this.repo.createSocialAccount(...); return u; })`, P2002 catch 는 L150-174(tx 외부). 확인.
  - (2)(3) `auth.controller.ts:67`(social-login SOCIAL_LOGIN_LIMIT)·`:76`(naver/state NAVER_STATE_LIMIT)·`:106`(forgot-password FORGOT_PASSWORD_LIMIT)·`:114`(reset-password RESET_PASSWORD_LIMIT)·`:123`(find-email FIND_EMAIL_LIMIT) `@Throttle` 5종 확인.
  - (4) `auth.service.ts:282-288` — `await this.prisma.runInTransaction(async () => { await this.authRepository.markOtpConsumed(...); await this.authRepository.revokeAllRefreshTokensByUser(user.id); })` 확인. `auth.repository.ts:55` tx-aware 전환은 Docs/Security/5b 3중 확인 인용.
  - (5) `auth.service.ts:262` `this.securityAuditLogger.otpVerificationFailed(email)`, `:300` `this.securityAuditLogger.findEmailAccessed(phone, user.email)` 확인. `fly-throttler.guard.ts:42` rateLimitExceeded 는 Security report 인용.
  - **일치 여부**: 전건 코드 사실과 일치 — 갱신 후 RESOLVED 서술 검증 통과.
- **적합성**: 범용 N/A(프로젝트 문서) / 역할정합 O(§6 현재 제약 표 — 이력 아님, RESOLVED 전이)
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: docs-change-logs/2026-07-04-002.md)

### PATCH-CXT-002

**context.md §1 — 개요 스냅샷 갱신 (완료 spec 범위·unit 카운트)**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §1 프로젝트 개요 (스냅샷 blockquote)
- **변경 내용**:
  - "014~017 완료" → "014~018 완료"
  - "단위/통합 테스트: unit 366 PASS(36 suites) + static/e2e 대상 스위트 PASS(017 5b 실행 기준)." → "단위/통합 테스트: unit 397 PASS(39 suites) + static 4 + e2e(rate-limit 6·atomicity 1) PASS(018 5b 실행 기준)."
  - "잔여 알려진 제약" 문장에 auth 보안 부채 5건 해소 반영 + 신규 SEC-018-01(Medium, 미확증 헤더 신뢰) 잔존 추가 (§6 참조로 간결 유지).
  - (§1 "현재 버전"은 v1.1.0 유지 — 018 은 동일 minor 사이클 내 spec 이므로 버전 필드 변경 없음. §1 스냅샷은 이력 테이블이 아닌 현재 상태 스냅샷이므로 갱신 허용 — PROC-R02 금지 대상 아님)
- **변경 근거**: GAP-018-03 부수 — 스냅샷 카운트·완료 범위가 018 실측과 어긋남.
- **코드 검증** (PROC-002): coverage.md L43 "39 suites/397 tests 전건 PASS", test-report.md 실행 요약 표(static 4/4·e2e rate-limit 6/6·atomicity 1/1). **일치 여부**: 397/39 가 5b 실측과 일치 — 검증 통과.
- **적합성**: 범용 N/A(프로젝트 문서) / 역할정합 O(§1 현재 상태 스냅샷 — 이력 추가 아님)
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: docs-change-logs/2026-07-04-002.md)

### PATCH-CXT-003

**context.md §6 — SEC-018-01 (rate limit 트래킹의 클라이언트 헤더 신뢰 미검증) additive 등재 (PROC-013-03)**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 (신규 행 additive)
- **변경 내용**: §6 표에 신규 행 추가 —
  - 항목: "rate limit IP 트래킹의 클라이언트 헤더 신뢰 미검증 (SEC-018-01, Medium)"
  - 내용: "`resolveClientIp` 가 `Fly-Client-IP`→`X-Forwarded-For`→`req.ip` 순으로 `req.headers` 를 원시 신뢰하며, 이 값이 Fly 엣지 프록시에 의해 항상 재기입됨을 코드/공식문서로 확증하지 않았다. `main.ts` `trust proxy:1` 은 `req.ip` 계산에만 영향(원시 헤더 접근 로직과 무관). 미확증 시 (a) 임의 XFF 회전으로 rate limit 우회, (b) 피해자 IP 위조로 poisoning(가용성) 가능. 완화 견고성 한정 이슈로 rate limit 인프라 자체는 정상 동작. 검증: PROC-014 사후 운영 검증 #1(헤더 스푸핑 시도 테스트) + infra.md §8 Fly-Client-IP 재기입 공식문서 근거 확보"
  - 영향 범위: "`shared/security/client-ip.util.ts`·`main.ts`·운영(rate limit 신뢰 전제)"
  - 관련 spec: "018-auth-security-hardening (SEC-018-01)"
- **변경 근거**: SEC-018-01 (Security Agent 신규 Medium) + PROC-013-03(위임된 Medium 이상 보안 부채의 §6 additive 등재 — 다음 spec 설계자 워크플로우 ③ 인지, 무추적 소실 방지).
- **코드 검증** (PROC-002): `client-ip.util.ts` 가 `Fly-Client-IP`→XFF→req.ip 폴백(run-004 T003, SC-009 PASS), `main.ts:12` `app.set('trust proxy', 1)` 는 `req.ip` 계산 전용(본 Agent 직접 Read 확인 — 원시 `req.headers` 접근과 독립). **일치 여부**: Security Agent 소스 근거와 일치.
- **적합성**: 범용 N/A(프로젝트 특정 보안 부채) / 역할정합 O(§6 알려진 제약 — 프로젝트 문서, 전역 규칙 아님)
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: docs-change-logs/2026-07-04-002.md)

### PATCH-CXT-004

**context.md §6 — SEC-018-02 (find-email 실패 감사 사각) · SEC-018-03 (pino redact 미설정) additive 등재**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 (신규 2행 additive)
- **변경 내용**: §6 표에 신규 2행 추가 —
  - **행 A** — 항목: "find-email 감사 로그 실패 케이스 미커버 (SEC-018-02, Low)". 내용: "`findEmailAccessed` 감사 로그는 성공(등록된 전화번호) 경로에서만 기록(`auth.service.ts:300`, NotFoundException 분기 이전 반환). 미등록 전화번호 대량 조회(user enumeration 시도)는 미기록 → 탐지 사각. FR-009/SC-016 은 성공 케이스만 명시하므로 spec 충족(비블로킹). IP rate limit(5/60s)이 1차 방어. 해소: 실패 케이스 `findEmailNotFound(phone, ip)` 이벤트 추가(후속 spec)". 영향: "`auth` 모듈·운영". 관련 spec: "018 (SEC-018-02)".
  - **행 B** — 항목: "pino 요청 로그 redact 미설정 (SEC-018-03, Informational)". 내용: "`app.module.ts` `LoggerModule.forRoot({ pinoHttp })` 에 `redact`/`serializers` 미설정 → `Authorization`/`cookie` 헤더(JWT access/refresh 토큰) 평문 로그 노출 가능성. 011 스펙 기존 코드(018 diff 범위 밖, 게이트 미반영). 해소: 별도 patch spec 에서 `pinoHttp.redact: ['req.headers.authorization','req.headers.cookie']` 검토". 영향: "`app.module.ts` 로깅·운영". 관련 spec: "011 (기원) / 018 (Security 관찰)".
- **변경 근거**: SEC-018-02(Low)·SEC-018-03(Informational) — Security Agent 가 Retrospective 재량 위임. §6 가 이미 Low(SEC-017-01)를 추적하는 선례가 있어, 무추적 소실 방지를 위해 등재. SEC-018-03 은 실 보안 공백(토큰 평문 로깅)이며 011 기원 미추적 항목이므로 patch spec 후보로 §6 에 박제.
- **코드 검증** (PROC-002): SEC-018-02 는 `auth.service.ts:295-302` findEmail(NotFoundException 분기 L297-299 → L300 로그, 성공 경로만) 본 Agent 직접 Read 확인. SEC-018-03 은 `app.module.ts` LoggerModule.forRoot 설정을 Security Agent 가 Read(018 diff 밖, 미변경) — 본 Agent 는 Security report 근거 채택(diff 밖 파일 재열람 생략, 근거 출처 명시).
- **적합성**: 범용 N/A(프로젝트 특정 보안 부채) / 역할정합 O(§6 알려진 제약)
- **상태**: 후보 (사용자 승인 대기 — SEC-018-02/03 은 Low/Info 이므로 등재 여부 자체를 사용자가 재량 판단 가능. 본 Agent 권고는 등재)

### PATCH-CXT-005

**infra.md §2/§8 — Fly.io 클라이언트 IP 전달 방식·trust proxy 문서화 (GAP-018-01)**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/infra.md`
- **대상 섹션**: §2 인프라 토폴로지 (토폴로지 개요 하단 note) + §8 알려진 인프라 제약 (신규 행)
- **변경 내용**:
  - **§2 (additive note, 토폴로지 다이어그램 하단)**: "**클라이언트 IP 전달**: Fly.io 엣지 프록시가 `Fly-Client-IP`(및 표준 `X-Forwarded-For`) 헤더로 실 클라이언트 IP 를 전달한다. backend 는 `main.ts` `app.set('trust proxy', 1)`(첫 홉만 신뢰) + `shared/security/client-ip.util.ts` `resolveClientIp`(Fly-Client-IP→XFF→req.ip 폴백)로 rate limit 트래킹 IP 를 식별한다. `trust proxy` 미설정 시 `req.ip` 가 프록시 연결 IP 단일 버킷으로 집계되어 rate limit 이 무력화된다(018)."
  - **§8 (신규 행)**: 항목 "rate limit IP 식별의 프록시 헤더 신뢰 전제" / 내용 "rate limit(018) IP 트래킹은 `Fly-Client-IP`/`X-Forwarded-For` 헤더를 신뢰한다. trust proxy 미설정 시 전역 단일 버킷화로 무력화. 또한 이 헤더가 Fly 엣지에 의해 항상 재기입됨을 공식문서/테스트로 확증하지 않은 상태(SEC-018-01, Medium) — 미확증 시 우회·poisoning 가능. 운영 배포 후 헤더 스푸핑 도달 여부 1회 검증(PROC-014 #1) 및 Fly-Client-IP 재기입 공식문서 근거 확보 필요." / 영향 범위 "`main.ts`·`shared/security/`·운영" / 관련 spec "018-auth-security-hardening"
- **변경 근거**: GAP-018-01 (Spec 발견·사용자 확정, Design/Docs 코드 검증 후 Retrospective 위임) + SEC-018-01 보안 함의 병합.
- **코드 검증** (PROC-002): `main.ts:10-12` trust proxy 주석+`app.set('trust proxy', 1)` 본 Agent 직접 Read 확인. `client-ip.util.ts` resolveClientIp 폴백은 run-004 T003 + Docs/5b 확인 인용. `grep "trust proxy\|Fly-Client-IP\|X-Forwarded-For" infra.md` = 0건(Docs Agent 확인) → 미기재 사실 재확인, additive 갱신 판정. **일치 여부**: 코드 사실과 일치.
- **적합성**: 범용 N/A(프로젝트 인프라 문서) / 역할정합 O(infra.md §2 토폴로지·§8 제약 — 운영 수준 현재 상태, 민감정보·환경변수 미포함)
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: docs-change-logs/2026-07-04-002.md)

---

## context.md §7 갱신 이력 처리 결정

- GAP-018-03 은 "`context.md §7` 갱신 이력에 018 항목 추가"도 요청했으나, **본 Agent 는 §7 에 018 행 추가 패치를 도출하지 않는다.**
- **근거 (PROC-R02)**: §7 갱신 이력은 "변경 이력/changelog" 성격의 섹션으로, 변경 추적 SoT 는 git history + `docs-change-logs/` + `docs/specs/` 폴더 구조다. changelog 성 섹션에 신규 spec 행을 추가하는 것은 매 차수 영속화되는 레거시 패턴이다.
- **선례**: 017 retrospective 도 §7 에 017 행을 추가하지 않았다(§7 마지막 항목은 016). 018 도 동일 원칙 적용 시 §7 은 016 에서 멈춘 **반쪽 유지 상태**가 된다.
- **처리**: 이 반쪽 유지 상태의 근본 해소(§7 섹션 제거 vs 일관 유지 결정)는 단일 문서 구조 변경이므로 process-patches.md **PROC-018-02** 로 별도 도출한다(사용자 결정 위임). 본 agent-patches 에서는 §7 018 행 추가를 **하지 않는 것**으로 확정.
