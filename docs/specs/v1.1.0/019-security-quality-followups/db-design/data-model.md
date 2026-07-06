---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-07-05 [시각 미확인, spawn 기준 16:24]
상태: 확정
---

# Data Model: 019-security-quality-followups

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

기존 단일 PostgreSQL 인스턴스(constitution P-003 단일 DB 원칙)를 그대로 사용한다. 본 spec은 신규 테이블·컬럼·관계를 추가하지 않으며, 기존 `Product`(`products` 스키마)·`Seller`(`users` 스키마) 모델에 **복합 인덱스 2건만** 추가하는 순수 스키마 확장이다(spec.md FR-006/FR-007, NFR-002 — 응답 구조·상태 코드 불변).

## 엔티티 관계도 (ERD)

엔티티·관계 변경 없음. 대상 엔티티 2건의 기존 관계만 참조로 명시한다(도메인 용어는 context.md §4/§5 기준).

```
User ──(1:1)── Seller ──(1:N, cross-schema plain String — P-001)── Product
```

- `Seller.userId` → `User.id` (동일 `users` 스키마 FK, 기존).
- `Product.sellerId` → `Seller.id` (cross-schema plain String, FK 미선언 — P-001/ADR-001, 기존 설계 유지. 본 spec은 이 경계를 변경하지 않는다).

## 테이블 정의

컬럼·제약 변경 없음(인덱스 전용 변경). 대상 테이블의 현재 정의를 참조로 기록한다.

| 테이블 (스키마) | 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|---|
| `products` (`products`) | `sellerId` | `TEXT` | NOT NULL, cross-schema plain String (FK 미선언, P-001) | 상품 소유 판매자 참조 |
| `products` (`products`) | `createdAt` | `TIMESTAMP(3)` | NOT NULL, `DEFAULT CURRENT_TIMESTAMP` | 생성 시각 — cursor 정렬 1차키 |
| `products` (`products`) | `id` | `TEXT` | PK | cursor 정렬 2차키(동일 `createdAt` tie-break) |
| `sellers` (`users`) | `status` | `SellerStatus` (enum) | NOT NULL, `DEFAULT 'PENDING'` | 판매자 승인 상태 |
| `sellers` (`users`) | `createdAt` | `TIMESTAMP(3)` | NOT NULL, `DEFAULT CURRENT_TIMESTAMP` | 생성 시각 — cursor 정렬 1차키 |
| `sellers` (`users`) | `id` | `TEXT` | PK | cursor 정렬 2차키 |

## 인덱스 전략

두 인덱스 모두 **WHERE + ORDER BY 완전 커버** 원칙(ADR-003)을 따른다 — 선두 컬럼이 등가 조건(WHERE)을, 후속 2개 컬럼이 실 repository의 정렬(`ORDER BY createdAt DESC, id DESC`)을 그대로 반영하여 PostgreSQL이 별도 sort 노드 없이 인덱스 스캔만으로 결과를 반환할 수 있게 한다.

| 인덱스 | 대상 | 근거 쿼리 (실 repository 코드 대조) | 커버 범위 |
|---|---|---|---|
| `products_sellerId_createdAt_id_idx` | `Product` | `ProductRepository.listBySeller` — `where:{sellerId}, orderBy:[{createdAt:'desc'},{id:'desc'}]` (`apps/backend/src/modules/product/product.repository.ts`) | WHERE(`sellerId`) + ORDER BY(`createdAt DESC, id DESC`) 완전 커버 |
| `sellers_status_createdAt_id_idx` | `Seller` | `SellerRepository.listByStatusPaginated` — `where:{status, businessName contains?}, orderBy:[{createdAt:'desc'},{id:'desc'}]` (`apps/backend/src/modules/seller/seller.repository.ts`) | WHERE(`status`) 등가 + ORDER BY 완전 커버. `businessName contains`(선택 파라미터)는 인덱스 미활용이나 `status` 선두 컬럼이 스캔 후보 집합을 먼저 축소 |

**단일 컬럼 인덱스를 채택하지 않은 이유(ADR-003 cross-reference)**: `[sellerId]`·`[status]` 단일 컬럼은 WHERE만 커버하고 `ORDER BY createdAt DESC, id DESC` 정렬은 미커버 — 결과 집합에 대한 별도 sort 노드가 남아 데이터 증가 시 정렬 비용이 스캔 비용과 별개로 확대된다. 복합 인덱스가 정렬까지 흡수해 sort 노드를 제거한다.

**중복 인덱스 확인**: `Product`에는 기존 `@@index([status, createdAt(sort: Desc), id(sort: Desc)])`(공개 목록용, `status` 선두)만 존재했고 `sellerId` 선두 인덱스는 없었다. `Seller`에는 PK(`id`)·unique(`userId`) 외 인덱스가 전혀 없었다. 두 신규 인덱스 모두 기존 인덱스와 선두 컬럼이 달라 중복이 아니다.

## 데이터 무결성 규칙

컬럼·제약·참조 무결성 변경 없음(순수 인덱스 추가). 기존 규칙을 참조로 명시한다:

- `Product.sellerId`, `Seller.status`는 기존 `NOT NULL` 제약을 유지한다(schema.prisma 기존 정의, 본 spec 무변경).
- `sellerId`(cross-schema plain String)의 참조 무결성은 기존과 동일하게 DB 레벨 FK 없이 애플리케이션 레벨에서만 관리된다(P-001/ADR-001 — 본 spec은 이 결정을 변경하지 않는다. FK 도입은 범위 외).
- `SellerStatus` enum(`PENDING`/`APPROVED`/`REJECTED`) 값 집합 무변경.

## 마이그레이션 계획

- **파일**: `apps/backend/prisma/migrations/20260705162400_add_product_seller_list_indexes/migration.sql`
- **적용 범위**: ASM-002(spec.md 범위 외 항목 참조) — 본 spec은 로컬 PostgreSQL(Docker Compose) 적용까지만 다룬다. 운영(prod) `migrate deploy` 실적용은 표준 배포 절차(기존 17차 마이그레이션과 동일 경로)를 따르며 본 spec 작업 대상이 아니다.
- **적용 방법(Development/Test 단계 수행)**: `pnpm --filter backend exec prisma migrate dev` — 로컬 DB에 본 마이그레이션이 순차 적용되고 Prisma Client가 재생성된다(schema.prisma와 마이그레이션 SQL이 이미 정합하므로 drift 없음).
- **GAP-005-03(마이그레이션 드리프트, accepted) 영향**: 본 마이그레이션은 순수 `CREATE INDEX` 2건만 포함하며 기존 accepted 결정(004/005 마이그레이션 캡처 불일치)과 무관하게 기존 마이그레이션 이력 위에 순차 누적된다.
- **검증(NFR-003/SC-009, Performance Agent 또는 Test EXECUTION 실행)**: 로컬 PostgreSQL에 마이그레이션 적용 후 아래 2개 쿼리의 `EXPLAIN`이 Seq Scan이 아닌 Index Scan/Bitmap Index Scan으로 나타나야 한다.
  ```sql
  EXPLAIN SELECT * FROM "products"."products" WHERE "sellerId" = 'x' ORDER BY "createdAt" DESC, "id" DESC LIMIT 20;
  EXPLAIN SELECT * FROM "users"."sellers" WHERE "status" = 'PENDING' ORDER BY "createdAt" DESC, "id" DESC LIMIT 20;
  ```

## 롤백 전략

- **파일**: `apps/backend/prisma/migrations/20260705162400_add_product_seller_list_indexes/rollback.sql` (참조용 수동 스크립트 — 016 선례와 동일 컨벤션, Prisma는 down 마이그레이션을 자동 생성하지 않는다)
- **원복 방법**: `DROP INDEX` 2건만으로 완전 원복 가능 — 데이터·컬럼·제약 변경이 전혀 없는 순수 인덱스 추가이므로 롤백 시 데이터 손실 위험이 없다.
- **적용 시점**: 문제 발생 시 사용자가 직접 `psql` 또는 `prisma db execute --file rollback.sql`로 실행한다(agent-rules.md §3.1 — git/DB 변경 명령 자동 실행 금지, 실행 주체는 사용자).
