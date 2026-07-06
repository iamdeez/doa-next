---
작성: Spec Agent
버전: v1.1
최종 수정: 2026-07-04 [시각 미확인, spawn 기준 03:39]
상태: 확정
---

# Spec Input: 018-auth-security-hardening

> 수집 일시: 2026-07-04 (spawn 기준 03:39) | 사용자 최종 확인: 완료 (Q-WT/Q15/Q17 전부 추천안 A 확정)

## 목차

- [수집 진행 상태](#수집-진행-상태)
- [A-0. 기존 working tree 수정 cross-reference](#a-0-기존-working-tree-수정-cross-reference)
- [질문 분석 근거](#질문-분석-근거)
- [카테고리별 수집 내용](#카테고리별-수집-내용)
- [PROC-009 배포 환경 cross-reference 결과](#proc-009-배포-환경-cross-reference-결과)
- [보완 내용](#보완-내용)

---

## 수집 진행 상태

| 카테고리 | 상태 | 마지막 질문 번호 | 답변 완료 항목 |
|---|---|---|---|
| 1. 배경 및 목적 | 완료 | Q3 | [Q1, Q2, Q3] — context.md §6·security-report 근거로 확정 |
| 2. 사용자 & 이해관계자 | 완료 | Q6 | [Q4, Q5, Q6] |
| 3. 핵심 기능 | 완료 | Q9 | [Q7, Q8, Q9] |
| 4. 데이터 & 입출력 | 완료 | Q12 | [Q10, Q11, Q12] |
| 5. 제약조건 | 완료 | Q15 | [Q13, Q14, Q15] — Q15 는 사용자 확정(계층형 임계값, 아래 참조) |
| 6. 운영 환경 | 완료 | Q17 | [Q17, Q18, Q19] — Q17 은 사용자 확정(trust proxy + Fly-Client-IP, 본 spec 범위 포함) |
| 7. 예외 & 실패 시나리오 | 완료 | Q22 | [Q20, Q21, Q22] |

> 모든 카테고리 완료. [NEEDS CLARIFICATION] 0건. spec.md 확정 작성으로 진행한다.

---

## A-0. 기존 working tree 수정 cross-reference

`git status`(제공된 세션 컨텍스트 기준, read-only) 확인 결과 다음 수정 사항이 존재한다:

- 수정(M) 21개 파일 + 신규(??) 다수 — 전부 `apps/backend/src/modules/auth/social*`, `apps/backend/src/modules/auth/social/naver*`, `apps/backend/prisma/migrations/20260703070000_add_oauth_states/`, `mobile/customer_app/lib/features/auth/*`(소셜 로그인), `docs/specs/v1.1.0/015-naver-code-exchange/`, `docs/specs/v1.1.0/016-naver-state-redirect-hardening/`, `docs/specs/v1.1.0/DIFF-015-*.md`, `DIFF-016-*.md`.
- **분석**: 파일 목록·경로가 `context.md` §7 갱신 이력에 기록된 **015-naver-code-exchange·016-naver-state-redirect-hardening 스펙의 완료 산출물**과 정확히 일치한다(네이버 code-exchange 재도입 + CSRF state 하드닝). 즉 이 변경은 **이미 완료된 선행 파이프라인 스펙의 결과물**이며, 현재 사용자가 임시로 만든 미승인 수정이 아니다. 본 018 스펙(rate limit·트랜잭션 원자성·감사 로그)의 요구사항 후보와 **내용상 무관**하다 — naver.provider.ts·oauth-state.service.ts 등은 018 이 다루는 파일 범위 밖이다(단, `social-auth.service.ts`(Track 2 대상)는 015/016 변경 이력에 포함되어 있으므로 018 작업 시 최신 코드 기준으로 diff 를 잡아야 함에 유의).
- **결정**: 통합 대상 아님(옵션 B) — 018 spec 범위 외. 단순히 아직 커밋되지 않은 선행 완료 스펙 산출물이므로 018 작업과 병행하여 존재해도 무방하다. 사용자에게 재확인만 요청(아래 "질문 분석 근거" Q-WT 참조).
- **사용자 확정 (2026-07-04)**: A(통합 불필요) 채택. 추가로 세션 시작 gitStatus 스냅샷이 stale 했음을 사용자가 정정 — 015/016 은 이미 커밋(`0196b9a`)되었고 017 도 커밋(`b3f427d`) 완료되어 **현재 working tree 는 클린**이다. **018 base commit = `b3f427d`**(pipeline-log.md "단계 시작" 이벤트의 baseCommit 과 일치 확인). working tree 통합 이슈 없음 — A-0 절차 종료.

---

## 질문 분석 근거 (Question Analysis Basis)

> PROC-015 — 옵션형 질문 제시 전 분석 근거를 기록한다. 답변 수령 후 "채택 결과" 열을 갱신한다.

| 질문 ID | 요지 | 옵션별 근거·trade-off | 추천안(이유) | 채택 결과 |
|---|---|---|---|---|
| Q-WT | working tree 의 015/016 미커밋 변경을 018 에 통합할지 | A: 통합(무의미 — 018 범위와 무관) / B: 018 범위 외로 유지(그대로 두고 진행) / C: 자유 답변 | **B** — 파일 목록이 context.md 갱신 이력상 015/016 산출물과 100% 일치, 018 요구사항 후보와 무관 | **A(=B 안, 통합 불필요) 채택**. 사용자가 gitStatus 스냅샷 stale 여부를 정정 — 015/016(`0196b9a`)·017(`b3f427d`) 모두 이미 커밋 완료, working tree 클린. 018 base commit = `b3f427d` 확정 |
| Q15 | Track 1 rate limit 구체 임계값(요청 수·윈도우) | **A(추천)**: `@nestjs/throttler` 전역 기본값(IP 당 20req/60s) + 고위험 엔드포인트 개별 override — social-login 10/60s, naver/state 20/60s, forgot-password 5/60s(기존 email 단위 60s 와 별개 축), find-email 5/60s, reset-password 10/60s. 근거: GAP-014-06(아웃바운드 증폭)·GAP-013-09(enumeration)가 지목한 5개 엔드포인트에 위험도 비례 개별 상한을 두고, 그 외 엔드포인트는 완화된 전역 기본값으로 심층방어. / **B**: 전역 균일 20req/60s 만 적용(라우트별 override 없음) — 구현 단순하나 고위험 엔드포인트(social-login 아웃바운드 증폭)에 대한 표적 완화가 약함. / **C**: 더 공격적인 하한(예: 전역 5req/60s) — 오탐(false positive) 위험 큼, 특히 소셜 로그인 재시도가 잦은 모바일 환경에서 정상 사용자 429 유발 가능 | **A** — 위험도 비례 개별 상한 + 전역 기본값 심층방어가 debt 항목(GAP-013-09/GAP-014-06)의 취지에 가장 부합 | **A 채택(계층형)**. 임계값은 spec.md 에 상수/NFR 로 명시하되, SC 는 "설정된 임계 초과 시 429" 형태로 정확한 수치와 독립적으로 검증 가능하게 작성(사용자 지시) |
| Q17 | Fly.io 프록시 뒤에서 IP 기반 rate limit 이 실제 클라이언트 IP를 식별하는 방법 | **A(추천)**: `main.ts` 에 `app.set('trust proxy', ...)` 설정 + `@nestjs/throttler` 커스텀 `getTracker()` 로 Fly.io 의 `Fly-Client-IP` 헤더(또는 표준 `X-Forwarded-For` 첫 항목)를 우선 사용 — Fly.io 는 엣지에서 두 헤더 모두 주입한다고 알려져 있으나 본 프로젝트 infra.md 에는 미기재(`[NEEDS CLARIFICATION]`). / **B**: 트러스트 프록시 설정 없이 기본 `req.ip` 사용 — Fly.io 뒤에서는 모든 요청이 동일 프록시 연결 IP로 집계되어 **rate limit 이 사실상 전역 단일 버킷으로 동작**(개별 클라이언트 격리 실패, 정상 사용자 동시 접속 시 상호 429 유발 위험). / **C**: 이번 spec 에서는 로컬/CI 환경(직접 연결) 검증만 수행하고 Fly.io 프록시 헤더 이슈는 운영 셋업 단계로 이월 | **A** — 근거 없이 B 로 진행하면 Track 1 전체(GAP-013-09/014-06 완화 목적)가 운영에서 무력화될 위험 | **A 채택**. 본 spec FR/SC 에 trust proxy 설정 + Fly-Client-IP/X-Forwarded-For 기반 실 클라이언트 IP 식별 포함. infra.md 갱신 필요사항(§2/§8)은 gaps.md 에 기록하여 Docs/Retrospective Agent 에 위임(사용자 지시) |

---

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

- **Q1 (왜 만드는가)**: `context.md §6 알려진 제약 및 기술 부채`에 013~016 스펙에서 "후속 위임(Retrospective)"으로 누적된 auth 보안 부채 4건을 해소한다. 개별 부채 항목은 각 선행 spec 의 Security Agent 감사 시점에는 Critical/High 가 아니어서 스펙을 블로킹하지 않았으나(Medium/Low), 누적되면 운영 리스크가 된다.
- **Q2 (현재 한계)**: (1) `@nestjs/throttler` 등 rate limit 모듈이 전무 — `grep -rn "Throttler\|RateLimit" apps/backend/src` 0건(security-report.md v1.3 §SEC-004 확인 사실 재확인, 본 세션에서도 `package.json` 의존성 목록에 `@nestjs/throttler` 부재 직접 확인). (2) `SocialAuthService.login()` path 3c 는 `createUser`+`createSocialAccount` 두 INSERT 가 `runInTransaction` 미사용(root fallback) — 코드 직접 확인 완료(`social-auth.service.ts:131-144`). (3) `AuthService.resetPassword()` 는 `markOtpConsumed`(비밀번호 변경, 내부 트랜잭션) 이후 `revokeAllRefreshTokensByUser` 를 트랜잭션 밖에서 별도 호출 — 코드 직접 확인 완료(`auth.service.ts:275-280`). (4) OTP 실패·429·find-email 조회에 대한 보안 감사 로그가 없음 — `AuthService`/`AuthController` 전체에 `Logger`/`@nestjs/common Logger` 사용 0건(구조적 로그는 nestjs-pino 가 HTTP 요청/응답만 자동 기록, 보안 이벤트 전용 로그는 없음) 확인.
- **Q3 (성공 기준)**: 4개 트랙 각각에 대응하는 코드 변경 + 회귀 테스트 + Security Agent 재검증(RESOLVED 판정)으로 확정. `context.md §6` 의 4개 부채 행이 "RESOLVED" 로 갱신 가능한 상태가 되는 것.

### [카테고리 2] 사용자 & 이해관계자

- **Q4 (사용자)**: 직접 사용자 대면 기능 변경 없음 — 본 스펙은 기존 auth 엔드포인트의 **비기능적 보안 강화**다. 영향받는 것은 (a) 익명 API 호출자(공격자·정상 클라이언트 모두 rate limit 대상), (b) 소셜 로그인 신규가입 사용자(Track 2, 트랜잭션 원자성 개선으로 실패 시나리오 안전성 향상), (c) 비밀번호 재설정 사용자(Track 3, 세션 폐기 원자성 향상), (d) 운영자/보안 담당자(Track 4, 감사 로그 소비자).
- **Q5 (기술 수준)**: 최종 사용자(Flutter 고객 앱) 는 API 계약 변경을 인지하지 못함(429 응답이 새로 추가되나 기존 4xx 오류 처리 로직으로 흡수 가능해야 함 — Flutter 측 429 핸들링 필요 여부는 "범위 외" 검토). 운영자는 Fly 로그 스트림(pino JSON)을 통해 WARN 레벨 감사 로그를 조회.
- **Q6 (이해관계자)**: 보안팀(감사 로그 소비), DevOps(Fly.io 배포 환경에서 rate limit 정상 동작 여부), 프론트엔드 팀(429 응답 처리 필요 여부 — 범위 외로 명시할지 확인 필요, 아래 범위 외 절 참조).

### [카테고리 3] 핵심 기능 (정상 흐름)

- **Q7 (필수 기능 우선순위)**:
  1. Track 1 — 전역 rate limit 도입 (`@nestjs/throttler`), social-login/naver-state/forgot-password/find-email/reset-password 개별 상한 적용.
  2. Track 2 — `SocialAuthService.login()` path 3c 를 `runInTransaction` 으로 원자화.
  3. Track 3 — `resetPassword()` 의 refresh token 전체 폐기를 비밀번호 변경과 원자적으로 보장.
  4. Track 4 — OTP 검증 실패·429 위반·find-email PII 접근에 대한 WARN 수준 보안 감사 로그 추가.
- **Q8 (있으면 좋으나 필수 아님)**: 감사 로그의 DB 영속화(admin_audit_logs 와 유사한 별도 테이블)는 이번 스펙 범위가 아님(task 지시가 "WARN 수준 보안 로깅"으로 명시 — 구조적 로그 스트림으로 충분). 이상 로그인 탐지(anomaly detection), IP 차단 자동화는 범위 외.
- **Q9 (명시적 제외)**: (a) Naver 소셜 로그인 재도입 관련 사항(015/016 이미 완료, 018 과 무관), (b) `POST /auth/login`·`/auth/register` 에 대한 개별(전용) rate limit 강화(전역 기본값만 적용, 이 두 엔드포인트에 특화된 debt 는 context.md §6 에 없음), (c) console/Flutter 클라이언트의 429 응답 UX 처리(범위 외 — 필요 시 별도 spec), (d) 감사 로그 DB 영속화·SIEM 연동.

### [카테고리 4] 데이터 & 입출력

- **Q10 (주요 데이터)**: 요청 IP(rate limit 트래킹 키), 감사 로그 이벤트(이메일/전화번호는 `maskEmail`류 마스킹 적용 — PII 최소 노출), 트랜잭션 대상 테이블(`users`, `social_accounts`, `refresh_tokens`, `password_reset_otps`).
- **Q11 (외부 연동)**: 없음(신규 외부 시스템 연동 없음). `@nestjs/throttler` 는 인-메모리 스토리지 기본값 사용(constitution P-003 단일 DB 원칙 — Redis 등 외부 스토리지 신규 도입 불요, 단일 인스턴스 배포이므로 분산 스토리지 불필요. 다중 인스턴스 확장 시 후속 검토 사항으로 범위 외 명시).
- **Q12 (민감도)**: 감사 로그에 기록되는 이메일/전화번호는 반드시 마스킹(기존 `maskEmail` 유틸 재사용). IP 주소는 rate limit 트래킹·감사 로그 목적상 원문 기록(개인정보이나 보안사고 대응 목적의 최소 수집으로 간주 — 별도 GDPR/개인정보 이슈는 이번 스펙 범위 밖, 기존 프로젝트에 개인정보처리방침 관련 spec 없음).
- **Q12-1 (요약 필드 표현)**: 해당 없음 — 목록형 응답 변경 없음(본 스펙은 신규 조회 API 를 추가하지 않음).

### [카테고리 5] 제약조건

- **Q13 (기술 스택 제약)**: `@nestjs/throttler` 신규 의존 추가 필요(현재 `package.json` 에 미설치, 직접 확인). constitution P-003(단일 DB 원칙)에 따라 인-메모리 스토리지 기본값 사용(Redis 등 외부 저장소 도입 안 함). Track 2/3 는 신규 의존 없이 기존 `PrismaService.runInTransaction`/`AuthRepository` 확장만으로 구현 가능(코드 직접 확인).
- **Q14 (일정 제약)**: 명시된 데드라인 없음.
- **Q15 (성능 요구사항 — rate limit 수치, 확정)**: 계층형 임계값(사용자 확정, 질문 분석 근거 Q15 참조) — 전역 기본 IP당 20req/60s + 개별 override: `POST /auth/social-login` 10req/60s, `POST /auth/naver/state` 20req/60s, `POST /auth/forgot-password` 5req/60s, `POST /auth/find-email` 5req/60s, `POST /auth/reset-password` 10req/60s. 그 외(`/auth/login`·`/auth/register`·`/auth/refresh`·`/auth/logout`·`/auth/me`)는 전역 기본값만 적용. 임계값은 `auth.constants.ts` 패턴을 따라 코드 상수로 명시(NFR)하고, SC 는 "설정된 임계 초과 시 429" 형태로 구체 수치와 독립적으로 검증 가능하게 작성한다.
- **Q16 (보안/법규 요구사항)**: 4개 트랙 모두 기존 Security Agent 가 식별한 취약점(SEC-002/SEC-003/SEC-004, context.md §6 근거)의 해소가 목적. 신규 법규 요구사항 없음(GDPR 등 미해당 — 국내 서비스, 별도 spec 대상).

### [카테고리 6] 운영 환경

- **Q17 (실행 환경 — Fly.io 프록시 IP 식별, 확정)**: 사용자 확정(질문 분석 근거 Q17 참조) — `main.ts` 에 `app.set('trust proxy', ...)` 설정 추가 + Fly.io 의 `Fly-Client-IP` 헤더(또는 표준 `X-Forwarded-For` 첫 항목) 기반 실 클라이언트 IP 식별을 본 spec FR/SC 범위에 **포함**한다. 미대응 시 rate limit 이 운영에서 프록시 단일 IP 버킷으로 무력화되므로 필수로 판단. infra.md §2(토폴로지)·§8(알려진 인프라 제약)의 관련 갱신 필요사항은 이 spec 이 직접 수정하지 않고 `gaps.md` 에 기록하여 Docs/Retrospective Agent 에 위임한다(사용자 지시, agent-rules.md §3.1 — 산출물 단일 책임 경계 준수).
- **Q18 (사용자 수·데이터 규모)**: infra.md 기준 초기 소규모(단일 Fly.io 인스턴스, scale-to-zero). rate limit 인-메모리 스토리지로 충분(다중 인스턴스 시 후속 검토 — 범위 외 명시).
- **Q19 (배포·운영 담당)**: 기존과 동일(Fly.io CI/CD, GitHub Actions). 본 스펙은 신규 Fly secret 을 요구하지 않음(rate limit 임계값은 코드 상수로 관리, env 오버라이드 불요 — 필요 시 Planning 단계에서 재검토 가능하나 기본적으로 `auth.constants.ts` 패턴을 따라 코드 상수화 제안).

### [카테고리 7] 예외 & 실패 시나리오

- **Q20 (실패 시 동작)**:
  - Track 1: rate limit 초과 시 `429 Too Many Requests`(NestJS 표준, `@nestjs/throttler` 기본 응답 형식).
  - Track 2: 트랜잭션 실패 시 `createUser`/`createSocialAccount` 양쪽 모두 롤백(orphan user 생성 자체가 발생하지 않음) — 기존 P2002 catch 폴백 로직은 트랜잭션 내부에서도 유지되어야 함(회귀 방지).
  - Track 3: 트랜잭션 원자화 시 비밀번호 변경과 세션 폐기가 함께 실패하거나 함께 성공해야 함(현재는 후자만 별도 실패 가능 — 이 비대칭을 제거하는 것이 목표).
  - Track 4: 로깅 실패(예: 로거 예외)가 원 요청 처리에 영향을 주면 안 됨(best-effort, 요청 흐름 블로킹 금지).
- **Q21 (엣지 케이스)**: rate limit 이 정상 사용자의 재시도(예: 소셜 로그인 실패 후 재시도, 비밀번호 재설정 여러 필드 오타 재입력)를 과도하게 차단하지 않아야 함 — 추천 임계값(Q15 참조)이 이 균형을 고려한 것인지 사용자 확인 필요. 다중 사용자가 동일 NAT/프록시 IP 를 공유하는 경우(예: 회사망, 모바일 통신사 CGNAT) rate limit 이 오탐될 수 있음 — 이번 스펙에서는 이 한계를 알려진 trade-off 로 문서화하고 별도 완화(예: 사용자 단위 rate limit 병행)는 범위 외로 명시.
- **Q22 (백업/복구)**: 해당 없음(rate limit 상태는 인-메모리, 재시작 시 초기화되는 것이 정상 동작 — 영속화 불요).

---

## PROC-009 배포 환경 cross-reference 결과

- **점검 대상**: Track 1(IP 기반 rate limit)이 컨테이너 NAT·L4 LB·리버스 프록시 영향을 받을 가능성 — **있음** (Fly.io 는 엣지 프록시를 경유하여 backend app 에 요청을 전달).
- **infra.md 확인**: `.claude/docs/infra.md` §2(인프라 토폴로지)·§8(알려진 인프라 제약) 전문을 확인했으나 클라이언트 IP 전달 방식(`Fly-Client-IP`/`X-Forwarded-For` 헤더, Express `trust proxy` 설정 필요 여부)에 대한 기재가 **없음**.
- **코드 확인**: `apps/backend/src/main.ts` 에 `app.set('trust proxy', ...)` 호출이 없음(직접 확인, 전문 39줄).
- **판정 (해소됨)**: infra.md 미기재 + 코드 미대응 상태를 사용자에게 질문(Q17)했고, **A(본 spec 범위 포함)** 로 확정되었다. trust proxy + Fly-Client-IP 식별 로직을 FR/SC 에 포함하고, infra.md 갱신은 gaps.md GAP-018-01 로 기록하여 Docs/Retrospective Agent 에 위임한다. Planning Agent(`02-planning.md §핵심 원칙 12`)가 plan.md "배포 환경 영향" 절에 trust proxy 설정·Fly-Client-IP 헤더 우선순위(HOW)를 반영해야 한다.

---

## 보완 내용

- **범위 외 확정 (사용자 지시)**: 트랙 B(결제·파일·소셜 로그인 실연동·배포 구성 변경) 전부, 트랙 C(cursor 목록 API Query DTO 미검증 — SEC-017-01, DB 인덱스 최적화, worker 프로세스 분리) 전부를 Out of Scope 로 명시한다. 이 항목들은 context.md §6 에 별도 잔존 제약으로 남아 있으나 본 018 스펙(auth 보안 하드닝 트랙 A 4건)과 무관하다.
- **gaps.md 위임 항목**: GAP-018-01(infra.md §2/§8 — Fly.io `Fly-Client-IP`/`X-Forwarded-For`·`trust proxy` 요구사항 미기재, additive 갱신 필요) — Docs Agent 코드 검증 후 Retrospective Agent 위임 패턴(013/014 선례와 동일)을 spec.md "범위 외" 절에서 명시하고, 파이프라인 3단계 이후 Design/Docs Agent 가 실제 `SPEC_ROOT/gaps.md` 에 정식 등재한다(Spec Agent 는 `agent-rules.md §4.2`에 따라 3단계 이후 발견 공백을 기록하는 주체이나, 본 항목은 1단계에서 이미 사용자 확정을 거쳤으므로 spec.md 본문에 선반영하고 후속 Agent 가 gaps.md 정식 등재를 이어받는다).
- Q-WT/Q15/Q17 전 항목 사용자 확정 완료, [NEEDS CLARIFICATION] 0건. spec.md 확정 작성 진행.
