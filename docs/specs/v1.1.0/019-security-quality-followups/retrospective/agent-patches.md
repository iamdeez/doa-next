---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-05 19:46
상태: 적용 완료 (2026-07-05, main session — PATCH-019-01~04 + PATCH-CXT-019-01~05 전건 적용, docs-change-logs 2026-07-05-001 기록)
---

# Agent Patches: 019-security-quality-followups

> 본 Agent 는 패치 후보만 제안한다. 적용 주체 = main session(사용자 승인 후, agent-rules.md §12 절차).
> "현재 내용"은 agent-observations.md(OBS-1~4) 관련 섹션 발췌 기반이다 — Agent 정의 파일 직접 읽기 금지(§금지사항) 준수.
> 각 전역 패치에 적합성 2단계 검토(범용성·역할정합) 결과를 명시한다(오염 방지 게이트).

## 목차

- [Agent 정의·전역 규칙 패치](#agent-정의전역-규칙-패치)
  - [PATCH-019-01](#patch-019-01-planning--design--fixunblock-태스크-완료기준-인과-정합성-대조)
  - [PATCH-019-02](#patch-019-02-spec--포괄-수용기준-vs-rate-limitthrottle-상충-사전-점검)
  - [PATCH-019-03](#patch-019-03-development--test--공유-인프라전역-가드-변경-spec-의-회귀-커버리지)
  - [PATCH-019-04](#patch-019-04-retrospective--해소된-gap-상태-최종-재점검-항목화)
- [context.md 갱신 패치 (PATCH-CXT)](#contextmd-갱신-패치-patch-cxt)

---

## Agent 정의·전역 규칙 패치

### PATCH-019-01: Planning / Design — fix/unblock 태스크 완료기준 인과 정합성 대조

- **대상 파일**: `~/.claude/agents/02-planning.md` (ADR/설계 결정 시), `~/.claude/agents/03-design.md` (tasks.md 완료기준 작성 시)
- **대상 섹션**: fix/unblock 태스크의 완료기준·근거 테스트 매핑 작성 절차
- **현재 내용(OBS-1 발췌 기반)**: fix 태스크 완료기준에 "해소 대상 SC ↔ 근거 테스트 파일"을 명시하나, 그 fix 의 적용 표면(예: GET-only `@SkipThrottle`)이 그 테스트의 실패 경로(예: POST `forgot-password` rate-limit)를 실제로 커버하는지 인과 대조하는 절차가 없다. → tasks.md T017 완료기준(b)이 GET-only 데코레이터로 POST 엔드포인트 테스트(`auth-recovery.e2e-spec.ts` SC-017)를 해소한다고 오귀속.
- **변경 내용**: fix/unblock 태스크의 완료기준에 근거 테스트를 명시할 때, 다음을 **[MUST]** 로 대조한다 — "이 fix 의 적용 표면(변경되는 코드 경로·데코레이터·엔드포인트 집합)이 근거 테스트의 실패 원인 경로를 실제로 포함하는가?" 포함하지 않으면 (i) 근거 테스트를 완료기준에서 제거하거나 (ii) 실패 경로를 커버하는 별도 fix 를 태스크에 추가한다. 인과 대조 결과를 tasks.md 해당 태스크 완료기준에 1줄로 명시한다.
- **강제도**: **[MUST]**
- **변경 근거**: OBS-1 (§12 트리거 e). GAP-019-04 5b 재검증 — T017 GET-only 설계가 auth POST 실패 경로를 원천 커버 불가함이 5b 3모드 재현으로 확인됨. 오귀속을 걷어내는 재현 비용 발생.
- **적합성**: 범용 O(모든 언어·프로젝트의 fix 태스크) / 역할정합 O(Planning·Design 의 태스크 완료기준 작성 책임)

### PATCH-019-02: Spec — 포괄 수용기준 vs rate-limit/throttle 상충 사전 점검

- **대상 파일**: `~/.claude/agents/01-spec.md`
- **대상 섹션**: 수용 기준(SC) 작성 시 달성 가능성 점검(agent-rules §9 모호함 판정에 준하는 항목)
- **현재 내용(OBS-2 발췌 기반)**: "전체 e2e 스위트 100% PASS" 류 포괄 수용기준을 세울 때, 기존 rate-limit/throttle 테스트와의 요청 수 상충 가능성을 사전 점검하는 절차가 없다. → SC-017 이 NFR-001(login 20/60s)·NFR-003(forgot-password 5/60s, 의도된 보안 동작)과 산술 상충하여 원천 달성 불가한 채로 확정.
- **변경 내용**: "전체 스위트 green / 100% PASS" 류 **포괄(전량) 수용기준**을 세울 때, 프로젝트에 rate-limit/throttle 등 요청 수 제한 동작이 존재하면 다음을 **[SHOULD]** 점검한다 — 기존 순차-다회 요청 테스트(perf·부하·복구)의 요청 수가 rate-limit quota 를 초과하여 포괄 수용기준과 산술 상충하는지. 상충 시 (i) 테스트 격리(quota 리셋/IP 분산) 전제를 SC 에 명시하거나 (ii) 포괄 수용기준의 예외 범위(예: "rate-limit 테스트 제외")를 SC 에 명시한다.
- **강제도**: **[SHOULD]** (달성 가능성 점검은 데이터 무결성 직결이 아니라 판정 정확도 향상 — MUST 아님)
- **변경 근거**: OBS-2 (§12 트리거 e, 5b 2회 BLOCKED). SC-017 이 production 결함 0·회귀 0 임에도 문면 미충족(gate FAIL)을 유발, 사용자 개입(옵션 A known-limitation 유예)으로만 종결.
- **적합성**: 범용 O(rate-limit 은 언어 불문 웹 백엔드 공통) / 역할정합 O(Spec 의 수용기준 정의 책임)

### PATCH-019-03: Development / Test — 공유 인프라·전역 가드 변경 spec 의 회귀 커버리지

- **대상 파일**: `~/.claude/agents/04-development.md` (구현 완료기준), `~/.claude/agents/05-test.md` (AUTHORING 산출물 필수 항목)
- **대상 섹션**: 공유 인프라·전역 미들웨어/가드 변경 시 회귀 커버리지 완료기준
- **현재 내용(OBS-3 발췌 기반)**: 공유 인프라(PrismaService 등)·전역 가드(rate-limit)를 변경·도입하는 spec 에서, (a) 공유 인프라의 비-트랜잭션/트랜잭션 양 경로 unit, (b) 전역 가드 도입 시 기존 e2e 전수 회귀 — 를 필수 산출물/완료기준으로 요구하는 절차가 없다. → GAP-019-03(003 tx delegate, `prisma.service.spec.ts` 부재로 미검출)·GAP-019-04(018 전역 rate-limit, 기존 GET 목록 e2e 전수 회귀 부재로 미검출)가 019 5b 에서야 표면화.
- **변경 내용**:
  - **(a) [MUST]** 공유 인프라(모든 도메인이 참조하는 base client·service — 예: ORM client wrapper, 트랜잭션 매니저)를 변경하는 spec 은 **비-트랜잭션 경로와 트랜잭션 경로 양쪽을 커버하는 targeted unit** 을 필수 산출물로 포함한다(Test AUTHORING). 변경이 회귀 방지 insurance 없이 완료되지 않는다.
  - **(b) [SHOULD]** 전역 미들웨어/가드(예: 전역 `APP_GUARD` rate-limit)를 **신규 도입**하는 spec 은, 그 가드가 적용되는 기존 라우트 유형(GET 목록·순차-다회 요청 e2e 포함)에 대한 **전수 회귀 실행**을 Development 완료기준·5b 검증 범위에 포함한다.
- **강제도**: (a) **[MUST]** / (b) **[SHOULD]**
- **변경 근거**: OBS-3 (§12 트리거 b, 5b BLOCKED 사전 결함 원인). GAP-019-03(P0)·GAP-019-04(Medium) 2건이 base commit diff 0 인 선행 spec 잠재 결함으로 파이프라인 중간 계획 외 재작업 유발.
- **적합성**: 범용 O(공유 인프라·전역 미들웨어는 언어 불문 아키텍처 개념) / 역할정합 O(Development 구현·Test 커버리지 책임). **재배치 판단**: constitution P-006(테스트 원칙) 승격을 검토했으나, "회귀 전수 실행"은 불변 원칙이 아닌 **작업 절차**이므로 프로젝트 constitution 오염을 피해 Agent 정의(전역·범용)에 배치.

### PATCH-019-04: Retrospective — 해소된 GAP 상태 최종 재점검 항목화

- **대상 파일**: `~/.claude/agents/07-retrospective.md`
- **대상 섹션**: 완료 체크리스트 또는 R1 산출물 분석 절차(gaps.md 상태 최종 점검)
- **현재 내용(OBS-4 발췌 기반)**: 자기 단계에서 해소된 GAP 의 상태 전이(OPEN→RESOLVED)를 각 Agent 가 gaps.md 에 즉시 반영하는 강제가 약하며, Retrospective 단계에서 gap 상태와 실제 구현·검증 상태의 정합성을 최종 재점검하는 항목이 없다. → GAP-019-01 이 gaps.md 에 OPEN 으로 잔존하나 실제 `test/pino-redact.e2e-spec.ts` 는 작성·PASS 확인됨.
- **변경 내용**: Retrospective Agent 의 R1(산출물 분석) 또는 완료 체크리스트에 **[SHOULD]** "gaps.md 의 각 GAP 상태(OPEN/RESOLVED/PARTIALLY)를 실제 구현·테스트 결과(test-report.md·coverage.md)와 대조하여 불일치 시 상태 정정 패치를 도출한다" 항목을 추가한다. (본 차수 적용: GAP-019-01 상태 정정을 아래 PATCH-CXT 와 별개로 gaps.md 정정 후보로 등록 — 실제 정정은 main 이 수행.)
- **강제도**: **[SHOULD]**
- **변경 근거**: OBS-4 (§12 트리거 e, Docs Agent 위임 보고로 표면화). gaps.md 상태 불일치는 회고·후속 spec 오판 위험.
- **적합성**: 범용 O(gap 상태 lifecycle 재점검은 모든 spec) / 역할정합 O(Retrospective 최종 점검 책임)

**GAP-019-01 상태 정정 후보(본 차수 적용 대상 — main 수행)**: `gaps.md` GAP-019-01 상태 `OPEN (Test Agent AUTHORING/EXECUTION 위임)` → `RESOLVED by Test Agent (AUTHORING/EXECUTION)` — 근거: `test/pino-redact.e2e-spec.ts` 작성·SC-014/015 PASS(pipeline-log L236·L479, test-report v2.0). 본 Agent 는 gaps.md 직접 수정 금지 — 후보만 제시.

---

## context.md 갱신 패치 (PATCH-CXT)

> GAP-019-02(Docs Agent 갱신 권고, 코드 검증 완료)를 PATCH-CXT 로 전환. 모든 항목 PROC-002 코드 검증 포함.
> [MUST NOT] context.md 직접 수정 — main session 이 사용자 승인 후 적용.

### PATCH-CXT-019-01: context.md §6 — SEC-017-01 RESOLVED 전이

- **대상 파일**: `{project}/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 (L240, SEC-017-01 행)
- **변경 내용**: L240 행을 취소선 처리 후 "**RESOLVED (019-security-quality-followups)** — 신규 공유 `ListQueryDto`/`AdminSellerListQueryDto`(class-validator)로 4개 엔드포인트(`admin/sellers/pending`·`admin/users`·`admin/audit-logs`·`sellers/me/products`) 전환, 수동 `parseInt` 전건 제거. `limit=abc` 등 비정수 입력 400 반환(SC-001~006 검증)" 로 갱신
- **변경 근거**: GAP-019-02 / FR-001~005
- **코드 검증(PROC-002)**: `admin.controller.ts` L41/65/73(`@Query() query: AdminSellerListQueryDto`/`ListQueryDto`, `parseInt` grep 0건)·`product.controller.ts` L59(`@Query() query: ListQueryDto`) — Docs Agent 직접 확인(gaps.md GAP-019-02 표). DTO 전환·수동 parseInt 제거 완료 일치.

### PATCH-CXT-019-02: context.md §6 — SEC-018-02 RESOLVED 전이

- **대상 파일**: `{project}/.claude/docs/context.md`
- **대상 섹션**: §6 (L255, SEC-018-02 행)
- **변경 내용**: L255 행을 취소선 처리 후 "**RESOLVED (019)** — `SecurityAuditLogger.findEmailNotFound` 신규(기존 3종과 동일 best-effort try/catch, `maskPhone` 마스킹) — `findEmail` 404 분기(NotFoundException 이전)에서 호출, enumeration 시도 탐지 사각 해소" 로 갱신
- **변경 근거**: GAP-019-02 / FR-008~010
- **코드 검증(PROC-002)**: `security-audit.logger.ts` L49(`findEmailNotFound`)·`auth.service.ts` L298(404 분기 호출) — Docs Agent 직접 확인.

### PATCH-CXT-019-03: context.md §6 — SEC-018-03 RESOLVED 전이

- **대상 파일**: `{project}/.claude/docs/context.md`
- **대상 섹션**: §6 (L256, SEC-018-03 행)
- **변경 내용**: L256 행을 취소선 처리 후 "**RESOLVED (019)** — `LoggerModule.forRoot({ pinoHttp })` 에 `redact: ['req.headers.authorization', 'req.headers.cookie']` 추가, HTTP 로그 JWT/쿠키 평문 노출 차단" 로 갱신
- **변경 근거**: GAP-019-02 / FR-011~012
- **코드 검증(PROC-002)**: `app.module.ts` L34(`redact: ['req.headers.authorization', 'req.headers.cookie']`) — Docs Agent 직접 확인.

### PATCH-CXT-019-04: context.md §1 — 테스트 카운트 갱신

- **대상 파일**: `{project}/.claude/docs/context.md`
- **대상 섹션**: §1 프로젝트 개요 (L22, 테스트 카운트 필드)
- **변경 내용**: "단위/통합 테스트: unit 397 PASS(39 suites) + static 4 + e2e(rate-limit 6·atomicity 1) PASS(018 5b 실행 기준)." → "단위/통합 테스트: unit 404 PASS(40 suites) + static 60(13 suites) + e2e 125/127 PASS(24/26 suites, 019 5b 재검증 기준 — 잔존 2건은 GAP-019-05 known-limitation, §6 참조)." 로 갱신
- **변경 근거**: GAP-019-02 / 신규 테스트 추가(prisma.service.spec.ts 3·list-query-dto·static·pino-redact 등)
- **코드 검증(PROC-002)**: `test/test-report.md`(v2.0, 5b 재검증) — unit 404/404(40 suites)·static 60(13 suites)·e2e 125/127(24/26 suites) — Test EXECUTION 직접 확인(pipeline-log L479).
- **주의(PROC-R02)**: 본 패치는 §1 "현재 상태 스냅샷"(단일 현재값) 갱신이지 이력/changelog 행 추가가 아니다 — 허용 범위.

### PATCH-CXT-019-05: context.md §6 — GAP-019-05 known-limitation 신규 행 추가

- **대상 파일**: `{project}/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 (신규 행)
- **변경 내용**: 신규 행 추가 — "`/auth/login`·`/auth/forgot-password` rate-limit 과 순차-다회 요청 e2e 의 구조적 충돌 (GAP-019-05, Low) | `test/auth.e2e-spec.ts::SC-027`(50회 로그인 P95)·`test/auth-recovery.e2e-spec.ts::SC-017`(forgot-password)가 `THROTTLE_DEFAULT_LIMIT=20/60s`·`THROTTLE_FORGOT_PASSWORD_LIMIT=5/60s`(NFR-001/003 의도 동작)와 산술 충돌해 전체 `--runInBand` 스위트에서 상시 FAIL. production 정상(회귀 아님) — `@SkipThrottle()` 부여는 보안 원칙 위반이라 해소 불가, 해소 경로는 테스트 하네스 재설계(quota 격리/리셋). | `test/auth.e2e-spec.ts`·`test/auth-recovery.e2e-spec.ts` | 019 발견"
- **변경 근거**: GAP-019-05(신규, Low) / 사용자 옵션 A known-limitation 유예
- **코드 검증(PROC-002)**: `git diff 62d14f9` 결과 0(auth.controller.ts·throttle.constants.ts·두 테스트 파일 전부 019 미변경) — Test EXECUTION 직접 확인(gaps.md GAP-019-05). production 정상·019 비원인 확정.

> **§6 SEC-018-01(L254) 미갱신** — 본 spec §범위 외로 잔존(운영 배포·infra.md 검증 필요, PROC-014). **GAP-005-03(L236, accepted) 미갱신** — 019 마이그레이션은 순차 누적으로 무관.
>
> **PROC-R02 점검**: §7 갱신 이력 표는 "changelog 성 섹션"이나, 00-context-rules.md §3-2 템플릿이 §7 갱신 이력을 정식 섹션으로 정의하므로 신규 spec 행 추가가 허용된다(00-constitution-rules 와 달리 context 템플릿은 §7 보유). 따라서 §7 에 "2026-07-05 | 019-security-quality-followups — SEC-017-01·018-02·018-03 RESOLVED, GAP-019-05 known-limitation 등재, 테스트 카운트 갱신 | 019" 1행 추가를 권고한다. (레거시 "스펙 버저닝 이력" 표는 본 프로젝트 context.md 에 부재 — PROC-R02 섹션 제거 대상 없음.)

## infra.md 갱신 패치

**갱신 불요.** 근거: 본 spec 은 코드·설정·로컬 마이그레이션만 변경하며(spec.md §범위 외 "코드-only, 외부 크레덴셜·의존 0"), 인덱스 마이그레이션은 기존 15차와 동일한 표준 배포 경로(로컬 적용, prod 는 별개)이다. 배포 방식·컨테이너 구성·CI/CD·인프라 토폴로지 변경 0. Deploy Agent 비활성(selection-phases.md: N). `[infra.md 갱신 필요]` gaps 항목 0건. → infra.md 패치 미작성(00-infra-rules.md §5 "코드만 변경된 spec 에서는 갱신하지 않는다").
</content>
