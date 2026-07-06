---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-07-01
상태: 확정
---

# Data Model: 014-social-login

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

기존 단일 PostgreSQL 인스턴스(Fly Postgres) + Prisma multiSchema 구조를 계승한다 (constitution P-003 단일 DB 원칙). `social_accounts` 테이블은 `users` 스키마에 추가한다.

ADR-004: `social_accounts` 를 `users` 스키마에 신규 테이블로 배치하는 이유 — User 와 1:N 관계이며 `auth` 모듈 Repository 만 접근하므로 모듈 경계(P-001) 준수. 단일 row 에 provider 컬럼 인라인 대안은 복수 제공자 연동 불가로 탈락.

---

## 엔티티 관계도 (ERD)

```
users.users (User)
    ──── 1:N ────> users.social_accounts (SocialAccount)
         FK: social_accounts.userId → users.id, onDelete CASCADE
         UniqueConstraint: (provider, providerId)
         Index: (userId)

users.users (User)
    ──── 1:N ────> users.refresh_tokens (RefreshToken)
         (기존 — 변경 없음)
```

**변경 요약:**
- `users.users.password`: NOT NULL → NULL 허용 (ADR-005, FR-007)
- `users.social_accounts`: 신규 테이블 (ADR-004, FR-009)

---

## 테이블 정의

### 신규: users.social_accounts

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | TEXT | PK, NOT NULL | cuid() — 기존 프로젝트 PK 관례 일관 적용 |
| `userId` | TEXT | NOT NULL, FK | users.users.id 참조. 동일 스키마이므로 FK 선언 (P-001 위배 아님) |
| `provider` | TEXT | NOT NULL | 'kakao'\|'google'\|'naver'. String 타입: 제공자 추가 시 enum 마이그레이션 불요 |
| `providerId` | TEXT | NOT NULL | 제공자 내부 사용자 ID (예: kakao 숫자 id를 문자열화) |
| `email` | TEXT | NOT NULL | 연동 시점 제공자 이메일. FR-003(이메일 없으면 거부) 이후에만 insert됨 |
| `name` | TEXT | NULL 허용 | 연동 시점 제공자 표시 이름 (선택 동의 항목으로 없을 수 있음) |
| `createdAt` | TIMESTAMP(3) | NOT NULL, DEFAULT NOW() | 연동 생성 시각 |

**테이블 수준 제약:**
- `social_accounts_pkey`: PK(id)
- `social_accounts_provider_providerId_key`: UNIQUE(provider, providerId)
- `social_accounts_userId_fkey`: FK(userId) → users.users(id) ON DELETE CASCADE ON UPDATE CASCADE

**Prisma 모델:**

```prisma
/// 소셜 로그인 연동 계정. 사용자당 N건(복수 제공자 연동 가능, ADR-004).
/// provider+providerId 복합 유니크: 동일 소셜 계정 중복 연동 차단·동시성 P2002 방어 (FR-004).
model SocialAccount {
  id         String   @id @default(cuid())
  userId     String
  provider   String
  providerId String
  /// 연동 시점 제공자 이메일. FR-003(email null 거부) 이후에만 insert — DB NOT NULL 유지.
  email      String
  name       String?
  createdAt  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerId])
  @@index([userId])
  @@map("social_accounts")
  @@schema("users")
}
```

### 변경: users.users (User)

| 변경 컬럼 | 기존 | 변경 후 | 사유 |
|---|---|---|---|
| `password` | TEXT NOT NULL | TEXT NULL 허용 | ADR-005: 소셜 전용 사용자는 password 없음. 기존 사용자 행 영향 없는 additive 변경 |

**신규 relation 추가 (Prisma 레벨):**

```prisma
socialAccounts SocialAccount[]
```

**변경 후 User 모델 (관련 행 발췌):**

```prisma
/// 사용자 기본 정보. password: bcrypt 해시값만 저장, 소셜 전용 사용자는 null (ADR-005).
model User {
  ...
  password      String?        // String → String? (ADR-005, FR-007)
  ...
  socialAccounts SocialAccount[]
  ...
}
```

---

## 인덱스 전략

| 테이블 | 인덱스 | 유형 | 커버하는 쿼리 패턴 |
|---|---|---|---|
| `social_accounts` | `(provider, providerId)` | UNIQUE (PRIMARY 역할 보조) | `findByProviderAndProviderId(provider, providerId)` — FR-004 재로그인 판정·동시성 방어 |
| `social_accounts` | `(userId)` | NON-UNIQUE | `user.socialAccounts` relation 조회, 사용자별 연동 목록 (FR-009) |
| `users` | `(email)` | UNIQUE (기존) | `findUserByEmail(email)` — FR-005 자동연동 이메일 매핑 |

**슬로우 쿼리 위험 항목:**
- `social_accounts.email` 컬럼에 대한 인덱스 없음 — `social_accounts` 를 email 로 직접 조회하는 패턴은 설계상 없음. 이메일 기반 조회는 `users.email @unique` 를 통해 User 에서 수행한다.
- `social_accounts.provider` 단독 인덱스 없음 — provider 단독 조회 패턴 없음. `@@unique([provider, providerId])` 가 복합 조회를 커버한다.

---

## 데이터 무결성 규칙

### NOT NULL 규칙

| 컬럼 | 규칙 | 근거 |
|---|---|---|
| `social_accounts.userId` | NOT NULL | 연동 대상 사용자 필수 |
| `social_accounts.provider` | NOT NULL | 제공자 식별 필수 |
| `social_accounts.providerId` | NOT NULL | 제공자 내 고유 ID 필수 |
| `social_accounts.email` | NOT NULL | FR-003: 이메일 없으면 소셜 로그인 거부 — insert 이전 서비스 레이어 거부 보장 |
| `users.password` | NULL 허용 | ADR-005: 소셜 전용 사용자 null 허용. 기존 사용자는 기존 bcrypt 해시 유지 |

### UNIQUE 규칙

| 제약 | 컬럼 | 위반 시 동작 |
|---|---|---|
| `social_accounts_provider_providerId_key` | `(provider, providerId)` | P2002 — 동시성 충돌 시 서비스 레이어 폴백(재해석 a→b) 처리. FR-004 재로그인 판정 기준 |
| `users.email` (기존) | `email` | P2002 — 이미 가입된 이메일. 서비스 레이어 FR-005 자동연동으로 처리 |

### 참조 무결성 (FK)

| FK | 테이블·컬럼 | 참조 | ON DELETE | ON UPDATE |
|---|---|---|---|---|
| `social_accounts_userId_fkey` | `social_accounts.userId` | `users.id` | CASCADE | CASCADE |

사용자 삭제(탈퇴) 시 연동된 소셜 계정 레코드가 자동 삭제된다. 이는 기존 `refresh_tokens`, `addresses`, `wishlists`, `product_views` FK 의 CASCADE 패턴과 동일하다.

### CHECK 제약

Prisma·PostgreSQL 의 `provider` 컬럼에 CHECK('kakao','google','naver') 를 선언하지 않는다 — 제공자 추가 시 마이그레이션 없이 응용 레이어(DTO + SocialProviderResolver)에서 제어한다. 기존 프로젝트의 동일 패턴(OrderStatus enum 이 DB enum 이 아닌 Prisma enum 으로 관리 등)을 따른다.

---

## 마이그레이션 계획

### 마이그레이션 파일

| 파일 | 내용 |
|---|---|
| `db-design/migrations/20260701153200_add_social_accounts.up.sql` | (1) `users.social_accounts` 테이블 생성·제약·인덱스·FK (2) `users.users.password` NOT NULL 해제 |
| `db-design/migrations/20260701153200_add_social_accounts.down.sql` | (1) `users.social_accounts` DROP (2) `users.users.password` NOT NULL 복원 (조건부 경고 포함) |

### Development T-A1 실행 지침

Database Design Agent 산출물 적용 시:

```bash
# schema.prisma 에 SocialAccount 모델·User 변경이 반영된 상태에서
cd apps/backend
pnpm exec prisma migrate dev --name add_social_accounts
pnpm exec prisma generate
```

`prisma migrate dev` 는 `db-design/migrations/` 의 SQL 과 동등한 마이그레이션을 자동 생성한다. 수동 SQL 실행 불요 — `prisma migrate` 가 schema.prisma diff 로 정확한 DDL 을 생성·적용한다.

---

## 롤백 전략

### 롤백 실행 전 확인 (필수)

```sql
-- 소셜 전용 사용자(password=NULL) 존재 여부 확인
-- 0건이어야 Down 마이그레이션 안전
SELECT COUNT(*) FROM "users"."users" WHERE password IS NULL;
```

### 롤백 시나리오별 방법

| 시나리오 | 방법 | 안전 여부 |
|---|---|---|
| 마이그레이션 직후·소셜 전용 사용자 0건 | Down SQL 실행 | 안전 |
| 소셜 전용 사용자 1건 이상 존재 | 소셜 전용 사용자 삭제 후 Down 실행, 또는 새 마이그레이션으로 password=null 을 랜덤값으로 채운 후 NOT NULL 복원 | 주의 필요 |
| 운영 중 긴급 롤백 | (1) social_accounts DROP → (2) password null 사용자 처리 계획 수립 → (3) NOT NULL 복원 | 사전 계획 필수 |

### Prisma 롤백

Prisma 는 `migrate reset` 으로 전체 DB 리셋하거나, 이전 상태로 되돌리는 새 마이그레이션을 생성하는 방식을 사용한다. `db-design/migrations/` 의 Down SQL 은 수동 실행 또는 스크립트 활용을 위한 참조 문서다.

```bash
# Prisma 방식 롤백 (개발 환경)
pnpm exec prisma migrate reset  # 전체 초기화 후 재적용
# 또는
pnpm exec prisma migrate dev --name revert_social_accounts  # 역방향 마이그레이션 생성
```
