---
작성: Design Agent (Docs Agent 추가 항목 포함)
버전: v1.2
최종 수정: 2026-07-03 22:21
상태: 확정 (GAP-016-01~04 전건 RESOLVED — 사후 정합화)
---

# Gaps: 016-naver-state-redirect-hardening

> `pipeline-conventions.md §6` 형식. 3단계 이후 모든 Agent 가 누적 기록한다.
> 상태 표기: OPEN | RESOLVED by [Agent] | 위임

## 목차

- [3단계 Design Agent 사전 분석 결과](#3단계-design-agent-사전-분석-결과)
- [GAP 목록](#gap-목록)

---

## 3단계 Design Agent 사전 분석 결과

Design Agent 3단계 코드 사전 분석 결과, plan.md ADR-001~007 은 실제 코드베이스와 정합하며
기획/설계 공백은 발견되지 않았다. 단, §F(호출 측 테스트 마이그레이션) 관련 회귀 위험 2건은
공백(GAP)이 아니라 **본 spec 범위 내 구현 태스크(D 레이어)** 로 tasks.md 에 명시했다
(research.md §F 참조).

## GAP 목록

| GAP-ID | 유형 | 내용 | 발견 단계 | 처리 방향 | 상태 |
|---|---|---|---|---|---|
| GAP-016-01 | 문서-갱신-필요 | context.md §2 핵심 모듈 목록 `auth` 행(현재 라인 75) — "소셜 로그인(POST /auth/social-login — 카카오·구글·네이버 3종...)" 서술에 신규 `POST /auth/naver/state`(익명 CSRF state 발급 엔드포인트)·`OAuthStateService`(`social/oauth-state.service.ts`)가 반영되어 있지 않다. **코드 검증**: `apps/backend/src/modules/auth/auth.controller.ts` L16(import)·L39(생성자 DI 주입)·L63(`@Post('naver/state')`)·L66(`naverState()` 핸들러) 확인 — 신규 엔드포인트 실재. `apps/backend/src/modules/auth/auth.module.ts` L9(import)·L27(`providers` 배열 등록) 확인 — `OAuthStateService` DI 등록 실재. | 6단계 Docs (research.md "context.md 부정합 사전 점검(PATCH-A11)" 절 근거로 확인, PATCH-A10 §2 기준 해당) | context.md §2 `auth` 행에 "`POST /auth/naver/state`(익명, CSRF state 발급) + `OAuthStateService`(state 발급·TTL·1회성 소비)" additive 추가 권고 — Retrospective Agent 위임(Docs Agent 직접 갱신 금지, agent-rules.md §3.1). | **RESOLVED by Retrospective Agent** (PATCH-CXT-016-01 적용 완료 — context.md §2 `auth` 행에 `POST /auth/naver/state`·`OAuthStateService` 반영 확인) |
| GAP-016-02 | 문서-갱신-필요 | context.md §4 데이터 모델(현재 라인 193) — "**실재 상태**: 32개 테이블 실체화(Prisma migrate 적용, 마이그레이션 15차)" 서술이 본 spec 신규 테이블 반영 전 상태다. **코드 검증**: `apps/backend/prisma/schema.prisma` L163(`model OAuthState`)·L171(`@@map("oauth_states")`)·L172(`@@schema("users")`) 확인 — `users` 스키마 신규 테이블 실재. `apps/backend/prisma/migrations/20260703070000_add_oauth_states/migration.sql` 실재(Database Design Agent 산출, CREATE TABLE + `state` UNIQUE + `@@index([expiresAt])`). | 6단계 Docs (research.md PATCH-A11 절 근거, PATCH-A10 §2 기준 해당) | context.md §4 "32개 테이블·15차" → "**33개 테이블·16차**"로 갱신 + `users.oauth_states`(016) 서술 행 추가(테이블 목적·컬럼·FK 없음(익명 발급) 근거 명시, `users.social_accounts`(014) 서술 행과 동일 패턴) 권고 — Retrospective Agent 위임. | **RESOLVED by Retrospective Agent** (PATCH-CXT-016-02 적용 완료 — context.md §4 "33개 테이블·16차" + `users.oauth_states`(016) 행 반영 확인) |
| GAP-016-03 | 문서-갱신-필요 (조건부 — Security 재감사 확정 후 처리) | context.md §6 알려진 제약(현재 라인 246~247) — "네이버 state(CSRF) 서버측 미검증(SEC-015-02, Medium)"·"네이버 redirect_uri 요구 여부 미확정(SEC-015-03, Low)" 두 행이 본 spec 의 하드닝 구현(state 서버 발급·원자적 1회성 검증, redirect_uri fail-safe 조건부 지원)을 반영하지 못한 상태다. **코드 검증**: `apps/backend/src/modules/auth/social/oauth-state.service.ts`(발급·소비)·`apps/backend/src/modules/auth/auth.repository.ts`(`createOAuthState`·`consumeOAuthState`·`deleteExpiredOAuthStates`)·`apps/backend/src/modules/auth/social-auth.service.ts`(naver 조건부 state 검증 분기, `providerImpl.verify` 이전 배치)·`apps/backend/src/modules/auth/social/naver.provider.ts`(`configService.get('NAVER_REDIRECT_URI')` optional 조회) 전부 실재 확인(coverage.md v1.1 SC-001~008/010 PASS). 단 spec.md NFR-006/007(SC-014/015)이 요구하는 **6단계 Security Agent 재감사에 의한 최종 RESOLVED/잔존-권고 판정은 아직 없다**(coverage.md "SC-014/015 PENDING(Security Agent 위임)"). | 6단계 Docs (research.md PATCH-A11 절 근거, PATCH-A10 §2 기준 해당) | Security Agent 재감사(본 Docs 단계 다음 순서) 완료 후, 그 판정 결과(RESOLVED 또는 잔존-권고)에 맞춰 context.md §6 두 행을 갱신 또는 제거 — Retrospective Agent 위임. **Security 재감사 결과 확정 전에는 갱신 착수하지 말 것**(판정 미확정 상태에서 문서를 먼저 RESOLVED 로 갱신하면 실제와 불일치 위험). | **RESOLVED by Retrospective Agent** (Security 재감사 완료 — security-report.md v1.1 SEC-015-02 RESOLVED / SEC-015-03 RESOLVED(코드)·잔존-권고. PATCH-CXT-016-03 적용 완료 — context.md §6 두 행 RESOLVED 전환 확인) |
| GAP-016-04 | 문서-갱신-필요 | infra.md — `NAVER_REDIRECT_URI` 신규 환경변수(선택, 미설정=미포함이 기본값, FR-007/008)와 `20260703070000_add_oauth_states` 마이그레이션이 §7 배포 전 체크리스트에 반영되어 있지 않다. **코드 검증**: `grep -n "NAVER_REDIRECT_URI" /Users/krystal/workspace/doa/doa-next/.claude/docs/infra.md` 결과 0건(미등재 확인). `apps/backend/.env.example` L34 `NAVER_REDIRECT_URI=` 항목 실재(NFR-005, SC-013). | 6단계 Docs (plan.md "배포 환경 영향" 절 — "infra.md §7 배포 전 체크리스트에 `NAVER_REDIRECT_URI`(선택, 미설정=미포함 기본) 항목 추가는 6단계 Docs/Retrospective 위임" 명시 근거) | infra.md §7 배포 전 체크리스트에 "`NAVER_REDIRECT_URI`(선택 — 미설정 시 기존 동작과 동일, 네이버 공식 문서 확인 후 필요 시 설정)" 항목 additive 추가 + §9 갱신 이력에 016 신규 행 추가 권고. 신규 컨테이너·아웃바운드 없음(plan.md "배포 환경 영향" — Deploy Agent 비활성 근거)이므로 그 외 섹션 갱신 불요 — Retrospective Agent 위임. | **RESOLVED by Retrospective Agent** (PATCH-CXT-016-05 적용 완료 — infra.md §7 `NAVER_REDIRECT_URI` 체크리스트·`20260703070000_add_oauth_states` 마이그레이션 반영 확인) |
