---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 미제공으로 date 명령 실행 불가]
상태: 확정
---

# Data Model: 016-naver-state-redirect-hardening

> Branch: 016-naver-state-redirect-hardening | Plan: [../planning/plan.md](../planning/plan.md) | Tasks: [../design/tasks.md](../design/tasks.md)

## 목차

- [DB 선택 및 근거](#db-선택-및-근거)
- [엔티티 관계도 (ERD)](#엔티티-관계도-erd)
- [테이블 정의](#테이블-정의)
- [인덱스 전략](#인덱스-전략)
- [데이터 무결성 규칙](#데이터-무결성-규칙)
- [마이그레이션 계획](#마이그레이션-계획)
- [롤백 전략](#롤백-전략)

---

## DB 선택 및 근거

**신규 외부 저장소 도입 없음.** 기존 단일 PostgreSQL 16 인스턴스(`apps/backend` Prisma multiSchema, `users` 스키마)에 신규 테이블 1개(`oauth_states`)만 추가한다.

- **근거 (plan.md ADR-001)**: state 저장 대안으로 애플리케이션 in-memory TTL Map을 검토했으나, Fly.io scale-to-zero 콜드 스타트·rolling deploy(다중 인스턴스 일시 공존) 환경에서 (1) 재시작 시 유실, (2) 발급 인스턴스와 콜백 인스턴스 불일치로 인한 false rejection 위험이 있어 미채택. Redis 등 신규 외부 캐시는 constitution **P-003(단일 DB 원칙)**·spec **NFR-004**를 직접 위반하므로 배제.
- **정합성 확인**: 본 설계는 P-003(외부 데이터 저장소 신규 도입 0건) 게이트를 그대로 승계·충족한다 — 기존 인스턴스의 신규 테이블 1개만 추가.

---

## 엔티티 관계도 (ERD)

`oauth_states`는 다른 엔티티와 **FK 관계를 갖지 않는 독립 엔티티**다.

- `POST /auth/naver/state`는 **익명(무인증) 엔드포인트**로, 인증 이전에 CSRF nonce를 발급한다. 발급 시점에 `User` 엔티티가 아직 결정되지 않았으므로(로그인 이전) `userId` 참조 자체가 존재하지 않는다.
- `provider` 컬럼은 값(`'naver'`)만 가지며 별도 `Provider` 엔티티나 enum 테이블을 참조하지 않는다(plan.md ADR-007 인접 설계 — 향후 provider 확장 여지를 위해 plain string 유지, 아래 [데이터 무결성 규칙](#데이터-무결성-규칙) 참조).

```
[OAuthState]   (독립 엔티티 — 타 엔티티와 관계 없음)
  id        (PK)
  state     (UNIQUE, CSRF nonce)
  provider  ('naver')
  expiresAt (TTL)
  createdAt
```

`User`·`SocialAccount` 등 기존 `users` 스키마 엔티티는 본 spec에서 무변경이며 `oauth_states`와 어떤 관계도 맺지 않는다(도메인 용어 사전 — context.md §4/§5에 `OAuthState`/`state`/`provider` 신규 용어 없음. 6단계 Docs 반영 대상, research.md "context.md 부정합 사전 점검" 참조).

---

## 테이블 정의

### `users.oauth_states`

| 컬럼 | 타입 | 제약조건 | 설명 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY`, `DEFAULT` cuid (애플리케이션 생성) | 대리키. 프로젝트 전역 cuid PK 컨벤션(social_accounts 등과 동일) |
| `state` | `TEXT` | `NOT NULL`, `UNIQUE` | CSRF nonce. `node:crypto randomBytes(32).toString('base64url')`(256bit CSPRNG, ADR-002) — NFR-002(예측불가) |
| `provider` | `TEXT` | `NOT NULL` | 현재 `'naver'` 고정값이나 향후 provider 확장 대비 plain string(FK/CHECK 미적용, ADR-007 인접 설계 의도) |
| `expiresAt` | `TIMESTAMP(3)` | `NOT NULL` | 발급 시각 + `NAVER_STATE_TTL_MIN`(10분, `auth.constants.ts`) — FR-002 TTL |
| `createdAt` | `TIMESTAMP(3)` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 발급 시각. 감사 목적 아님(CSRF nonce, PII 아님 — plan.md "데이터 모델" 절) |

- Prisma 모델: `apps/backend/prisma/schema.prisma`의 `model OAuthState`(`@@map("oauth_states")`, `@@schema("users")`).
- FK 없음 — `User`(`users.users`)와 관계 미선언(위 ERD 절 근거). `social_accounts`류의 cross-entity 참조 패턴과 달리 완전 독립.

---

## 인덱스 전략

| 인덱스 | 대상 | 목적 | 근거 쿼리(`AuthRepository`, T003) |
|---|---|---|---|
| `oauth_states_state_key` (UNIQUE) | `state` | (1) nonce 중복 방지(방어적 — 256bit CSPRNG로 충돌 확률 무시 가능하나 DB 수준 defense-in-depth), (2) 소비(`consume`) 조회를 O(1) 인덱스 탐색으로 처리 | `consumeOAuthState`: `deleteMany({ where: { state, provider, expiresAt: { gt: now } } })` — `state` UNIQUE 인덱스로 대상 행 즉시 탐색, `provider`·`expiresAt`은 해당 단일 행에서 조건 평가(추가 인덱스 불요) |
| `oauth_states_expiresAt_idx` | `expiresAt` | 만료 행 정리(opportunistic cleanup) 쿼리의 순차 스캔 방지 — 테이블 무한 증식 방지(익명 발급 flood 완화, 위험 완화 설계 표) | `deleteExpiredOAuthStates`: `deleteMany({ where: { expiresAt: { lte: now } } })` |

### 슬로우 쿼리 위험 검토

- **발급(`createOAuthState`)**: 단순 INSERT, 인덱스 삽입 비용만 발생(무시 가능).
- **소비(`consumeOAuthState`)**: UNIQUE 인덱스 탐색 1건 + 조건부 DELETE — O(1). 동시 요청 시 PostgreSQL row-level lock으로 원자성 보장(plan.md §6 공유 상태·동시성 설계, 앱 레이어 lock 불요).
- **만료 정리(`deleteExpiredOAuthStates`)**: `expiresAt` 인덱스로 만료 대상만 스캔. 발급마다(`OAuthStateService.issue`) opportunistic 호출되므로 테이블 행 수는 대체로 "TTL(10분) 동안의 발급량" 규모로 자연 바운딩되어 스캔 대상이 누적되지 않는다. `provider` 컬럼은 현재 인덱스 대상이 아니다 — 위 두 쿼리 어디에도 `provider` 단독 필터가 없으므로(T003 메서드 시그니처 확인) 별도 인덱스는 과설계.
- **테이블 규모 상한**: 익명 발급 DoS 시나리오도 opportunistic 정리로 자연 바운딩되나, 지속적 고부하 상황에서는 인덱스 기반 정리 쿼리도 스캔 비용이 커질 수 있다 — 운영 단계에서 스케줄 기반 정리(cron)를 보강 검토할 수 있음(본 spec 범위 외, IP rate limit은 SEC-004 후속 위임과 동일 축).

---

## 데이터 무결성 규칙

| 규칙 | 컬럼/제약 | 근거 |
|---|---|---|
| PK | `id` | 대리키, 프로젝트 전역 cuid 컨벤션 |
| NOT NULL | `state`, `provider`, `expiresAt`, `createdAt` | 4개 컬럼 모두 비즈니스 로직(발급·소비·정리) 필수값 — `expiresAt` 부재 시 `consumeOAuthState`/`deleteExpiredOAuthStates`의 `gt`/`lte` 조건 평가 불가 |
| UNIQUE | `state` | 1회성 소비(FR-005)를 단일 조건부 `DELETE`로 원자화하는 전제 조건 — `state`가 유일하지 않으면 동일 값의 복수 행 존재 가능성으로 `deleteMany` count 판정이 무의미해짐(ADR-003) |
| FK | 없음 | `oauth_states`는 익명 발급 엔티티로 `User`를 포함한 어떤 엔티티도 참조하지 않는다(위 ERD 절). `ON DELETE`/`ON UPDATE` 정책 해당 없음 |
| CHECK | 미적용(`provider`) | `provider`를 enum/CHECK로 제한하지 않는다 — plan.md가 "향후 provider 확장 여지"를 명시적으로 의도했으므로(ADR-007 인접), 현재 `'naver'` 단일 값이라는 이유로 제약을 추가하면 이 설계 의도와 상충한다. 애플리케이션 레이어(`OAuthStateService.issue(provider)` 시그니처)에서 유효 provider 목록을 통제 |
| 감사(consumedAt 등) 미보유 | — | ADR-003(delete-on-consume) 채택 — 소비된 행은 삭제되므로 별도 소비 플래그·소비 이력 컬럼이 불필요(CSRF nonce는 감사 요구사항 없음, plan.md "데이터 모델" 절 명시) |
| 개인정보 아님 | — | `state` 값은 CSRF nonce(난수)이며 사용자 식별 정보를 포함하지 않는다 — 백업·PII 처리 대상 아님(spec-input Q12/Q22, plan.md 데이터 모델 절) |

**constitution P-001(모듈 경계) 정합**: `oauth_states`는 `users` 스키마에 위치하며 `AuthRepository`(auth 모듈)만 접근한다. 타 모듈 스키마·Prisma delegate 직접 참조 0건.

---

## 마이그레이션 계획

| 항목 | 내용 |
|---|---|
| 마이그레이션 ID | `20260703070000_add_oauth_states` |
| 순번 | 16차 (기존 15차 `20260701064209_add_social_accounts` 이후 — context.md §4 "32테이블·15차" → 본 spec 반영 후 "33테이블·16차") |
| 변경 유형 | 순수 `CREATE TABLE` + `CREATE INDEX` 2건 — **기존 테이블 `ALTER` 없음** (015 `add_social_accounts`가 `users.users.password` NOT NULL을 해제했던 것과 달리, 본 마이그레이션은 기존 스키마에 부작용이 없는 순수 추가) |
| 적용 방식 | `prisma migrate deploy`(infra.md §7 배포 흐름) 자동 적용. 로컬 개발은 `pnpm --filter backend exec prisma migrate dev`(이미 파일이 존재하면 생성된 마이그레이션을 그대로 인식) |
| 후속 필요 작업 (4단계 Development 책임) | `prisma generate`로 `oAuthState` delegate를 Prisma Client에 노출 — pnpm hoist 구조상 `node_modules/.pnpm` 경유 생성(docker.md pnpm+Prisma 주의 참조). 본 Database Design Agent 산출물은 SQL·스키마 선언까지이며 client 생성은 4단계 빌드 시점 수행 |
| 산출 파일 | `apps/backend/prisma/schema.prisma`(`model OAuthState` 추가), `apps/backend/prisma/migrations/20260703070000_add_oauth_states/migration.sql`(Up), `apps/backend/prisma/migrations/20260703070000_add_oauth_states/rollback.sql`(Down, 수동 참조) |
| 드리프트 정합 | context.md §6 "마이그레이션 드리프트(GAP-005-03, accepted)"와 무관한 신규 폴더 1건 append — 기존 이력 재정렬(squash) 불필요(plan.md "기타 고려사항" 절) |

---

## 롤백 전략

Prisma Migrate는 자동 down-migration 실행기를 제공하지 않으므로, `rollback.sql`은 **수동 참조 문서**로 마이그레이션 폴더에 동봉하며 `prisma migrate` 파이프라인이 자동 실행하지 않는다(Prisma는 `migration.sql`만 인식).

```sql
-- rollback.sql (apps/backend/prisma/migrations/20260703070000_add_oauth_states/rollback.sql)
DROP INDEX IF EXISTS "users"."oauth_states_expiresAt_idx";
DROP INDEX IF EXISTS "users"."oauth_states_state_key";
DROP TABLE IF EXISTS "users"."oauth_states";
```

- **안전성 근거**: `oauth_states`는 (1) 타 테이블로부터 FK 참조를 받지 않고(위 ERD/무결성 절), (2) 타 테이블을 참조하지도 않으며(FK 없음), (3) CSRF nonce는 10분 TTL의 휘발성 데이터로 영속 가치가 없다(plan.md "개인정보 아님" 명시). 따라서 `DROP TABLE`은 다른 스키마·모듈에 연쇄 영향(cascade) 없이 독립적으로 안전하게 수행 가능하다.
- **롤백 절차**:
  1. `apps/backend/prisma/schema.prisma`에서 `model OAuthState` 블록 제거(코드 되돌리기 — `git` 명령은 사용자가 직접 실행, `~/.claude/rules/on-demand/git.md` 참조).
  2. `rollback.sql` 내용을 대상 PostgreSQL 인스턴스에 수동 적용(`psql` 등).
  3. `prisma generate` 재실행으로 `oAuthState` delegate를 Prisma Client에서 제거.
  4. 롤백 시점에 진행 중이던 네이버 로그인 요청은 state 검증 실패(만료와 동일한 401 UX)로 처리되며, 이는 정상 TTL 만료 시나리오(FR-002/SC-002)와 동일한 안전한 실패 모드다 — 별도 예외 처리 불요.
- **영향 범위**: 롤백 시 `OAuthStateService`·`AuthRepository`의 신규 메서드(`createOAuthState`/`consumeOAuthState`/`deleteExpiredOAuthStates`)·`SocialAuthService`의 naver state 검증 분기·`POST /auth/naver/state` 엔드포인트도 함께 되돌려야 한다(4단계 Development 산출물 롤백은 본 문서 범위 외 — `docs-change-logs`/`DIFF-016-*.md` 참조).
