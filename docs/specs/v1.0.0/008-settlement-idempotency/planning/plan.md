---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Plan: 008-settlement-idempotency

> Branch: 008-settlement-idempotency | Date: 2026-06-29 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). spec.md NFR
> (NFR-001~003)은 P-001·P-005 를 하위 구체화하며 충돌(완화) 없음.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: settlement 모듈이 자기 소유 테이블 외 타 도메인 모델을 직접 참조하지 않음]
  → PASS. 기집계 판정 메서드 `SettlementRepository.findSettledOrderItemIds` 는 `this.prisma.tx.settlementItem`(자기 소유 `settlements.settlement_items`)만 조회한다. orders 스키마 후보는 005 와 동일하게 `OrderService.getCompletedItemsForSettlement` DI 경유. cross-schema 참조(orderItemId·orderId·sellerId)는 plain String.
- [x] **P-002 AWS 의존 금지 / 외부 의존 추상화 원칙**: [Pass 기준: `@aws-sdk/*` 및 신규 npm 의존 0건]
  → PASS. 신규 npm 의존 0건(`package.json` 변경 없음). 표준 Prisma + NestJS 만.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS. 기존 `settlements.settlement_items` 에 UNIQUE INDEX 1종 추가. 신규 테이블 0. 외부 저장소 0.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: 클라우드 전용 API 결합 0건]
  → PASS. 표준 Prisma + PostgreSQL UNIQUE 제약만.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 수치 Decimal + 멱등성 보장]
  → PASS. 기집계 제외 후 재계산은 전부 `Prisma.Decimal`(`totalSales` 합산·`commission` `mul(rate)` `ROUND_HALF_UP`·`payoutAmount` `minus`). **본 spec 의 핵심 목적이 정산 멱등성 보강**이며, 005 의 P-005 부분이행(멱등성 공백, SEC-FIND-005-01)을 완전이행으로 끌어올린다.
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001·002·NFR-001~003 전부 SC 매핑 존재. FR-001 은 SC-001·002(단위), FR-002 는 SC-003(정적).
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS. 변경 범위 = schema.prisma(SettlementItem.orderItemId @unique) + 008 마이그레이션 + settlement.repository(findSettledOrderItemIds) + settlement.service(createSettlement 멱등 필터) + settlement.service.spec(멱등성 2건). 전부 FR-001·002 추적 가능. 범위 외 리팩토링 0.

> **예외 사항**: 없음. P-001~P-007 전부 통과(예외 0건).

> **Gates 판정**: P-001~P-007 전부 통과(예외 0건). Design Agent(3단계) 진입 가능.

---

## 기술 컨텍스트

> 005 의 확정 스택을 재확정. 008 고유 변경만 명시.

- **언어 / 런타임**: TypeScript 5.4 / Node.js 20.x. pnpm + Turborepo.
- **백엔드 프레임워크**: NestJS 11.x. settlement 모듈 4계층(controller·service·repository·events).
- **ORM / DB**: Prisma `^6.19.0` multiSchema + PostgreSQL 16. 기존 `settlements.settlement_items` 테이블에 `orderItemId` UNIQUE INDEX 추가. 신규 테이블 0.
- **트랜잭션**: `PrismaService.runInTransaction`(ALS tx-aware) — settlement + settlement_items 단일 트랜잭션(005 패턴 승계). 기집계 조회(`findSettledOrderItemIds`)는 `this.prisma.tx.settlementItem` 경유.
- **금전 타입**: `Prisma.Decimal` — `COMMISSION_RATE='0.1'`(문자열 상수). 재계산 시 `mul`·`toDecimalPlaces(2, ROUND_HALF_UP)`·`minus`.
- **테스트 프레임워크**: Jest(`*.spec.ts`, src rootDir). 단위([env:unit] — SC-001·002). 정적([env:static] — SC-003 schema/migration 구조 검증).
- **환경변수**: 신규 0. 기존 `DATABASE_URL` 재사용.
- **신규 의존성**: 0건.

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정(DB Design 소유) | `SettlementItem.orderItemId` 에 `@unique` 추가 + 주석 | A |
| `prisma/migrations/20260629183631_008_settlement_item_orderitem_unique/migration.sql` | 신규 | `settlement_items_orderItemId_key` UNIQUE INDEX 생성 | A |
| `src/modules/settlement/settlement.repository.ts` | 수정(additive) | `findSettledOrderItemIds(orderItemIds)` — settlement_items 자기 테이블 조회 | A |
| `src/modules/settlement/settlement.service.ts` | 수정 | `createSettlement` 에 기집계 제외 필터 + 금액 재계산 | B |
| `src/modules/settlement/settlement.service.spec.ts` | 수정(확장) | 멱등성 단위 테스트 2건(SC-001·002) | D |

> `package.json` 변경 0건(신규 npm 의존 없음). `OrderService.getCompletedItemsForSettlement`(005) 시그니처 불변 — 008 은 order 모듈을 변경하지 않는다.

---

## 핵심 설계

### 1. 멱등성 흐름 (FR-001)

```
createSettlement(sellerId, periodStart, periodEnd):
  candidates = order.getCompletedItemsForSettlement(...)        # 005 — 변경 없음(후보 전체)
  settledIds = Set(settlementRepo.findSettledOrderItemIds(       # 008 신규 — P-001 자기 테이블
                     candidates.map(orderItemId)))
  items = candidates.filter(c => !settledIds.has(c.orderItemId)) # 기집계 제외
  totalSales = Σ items.saleAmount                                # Decimal
  commission = totalSales.mul(rate).toDecimalPlaces(2, HALF_UP)  # Decimal
  payoutAmount = totalSales.minus(commission)                    # Decimal
  runInTransaction:
    created = createSettlement({... totalSales, commission, payoutAmount, status: pending})
    if items.length > 0: createItems(items)                      # 0건이면 skip (SC-002)
```

- **기집계 판정(`findSettledOrderItemIds`)**: `settlement_items` 에서 `orderItemId IN (후보 전체)` 조회 후 매칭 id 반환. 빈 입력은 즉시 `[]`(불필요 쿼리 회피).
- **재계산**: 제외 후 `items` 로만 합산. 후보 전체가 기집계면 `items=[]` → `totalSales=Decimal(0)`·`payoutAmount=Decimal(0)`, `createItems` 미호출.

### 2. DB 제약 (FR-002)

- `SettlementItem.orderItemId @unique` → `settlement_items_orderItemId_key` UNIQUE INDEX. 애플리케이션 필터를 우회한 경합(동시 재정산)에서도 동일 `orderItemId` 의 두 번째 insert 는 P2002 로 실패하여 DB 수준에서 중복을 차단(방어 심층화).

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 멱등 판정 위치 | settlement 모듈이 자기 테이블(`settlement_items`) 조회 후 제외(`findSettledOrderItemIds`) | order 후보 쿼리에서 제외(cross-schema 결합·P-001 위반) | P-001, FR-001 | settlement.repository/service |
| ADR-002 | DB 중복 차단 | `SettlementItem.orderItemId @unique` | 애플리케이션 필터만(경합 시 빈틈) | FR-002 | schema.prisma, migration |
| ADR-003 | 전체 기집계 시 동작 | 금액 0 정산 생성 + `createItems` skip | 정산 생성 거부(409) | FR-001, SC-002 | settlement.service |
| ADR-004 | 금액 재계산 타입 | `Prisma.Decimal`(합산·mul·minus·ROUND_HALF_UP) | number 부동소수점(금전 오차) | P-005, NFR-002 | settlement.service |

---

## 인터페이스 계약

### 008 신규/변경 인터페이스

```ts
// SettlementRepository — 008 신규 additive (P-001 자기 테이블)
findSettledOrderItemIds(orderItemIds: string[]): Promise<string[]>;

// SettlementService.createSettlement — 시그니처 불변, 내부에 멱등 제외 필터 추가
createSettlement(sellerId: string, periodStart: Date, periodEnd: Date): Promise<SettlementWithItems>;

// OrderService.getCompletedItemsForSettlement — 005 — 008 변경 없음(재사용)
getCompletedItemsForSettlement(sellerId, periodStart, periodEnd):
  Promise<Array<{ orderId; orderItemId; saleAmount: Prisma.Decimal }>>;
```

### 하위 호환성 / 방어 코드

- `createSettlement` 입력 시그니처 불변 → 005 호출 측(컨트롤러·테스트) 회귀 0.
- `findSettledOrderItemIds([])` 즉시 `[]` 반환(빈 입력 방어, 불필요 쿼리 회피).
- `items.length > 0` 일 때만 `createItems` 호출(전체 기집계 시 빈 insert 방어).
- DB `@unique` 가 애플리케이션 필터의 최종 안전망(P2002).

---

## 데이터 모델

> 상세는 **Database Design Agent**(selection-phases.md: Y)가 [../db-design/data-model.md](../db-design/data-model.md) 로 확정.

### settlements 스키마 (기존 테이블 제약 추가)

| 테이블 | 변경 | 제약·인덱스 |
|---|---|---|
| `settlements.settlement_items` | `orderItemId` 에 `@unique` 추가 | `settlement_items_orderItemId_key` UNIQUE INDEX |

> 신규 테이블·컬럼·enum 0. 기존 컬럼(`orderItemId String`)에 UNIQUE 제약만 부여. 금전 필드(`saleAmount`·`commissionAmount` `@db.Decimal(12,2)`)는 005 에서 이미 Decimal — 변경 없음.

---

## 테스트 전략

### SC↔테스트 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 단위 | Happy/Idempotency | 일부 기집계 제외 후 나머지만 집계 | 후보 3건 중 oi1·oi2 기집계 | totalSales=5000·commission=500·payout=4500, items=[oi3] |
| SC-002 | 단위 | Edge/Idempotency | 전체 기집계 → 0·createItems skip | 후보 oi1 전부 기집계 | totalSales=0·payout=0, createItems 미호출 |
| SC-003 | 정적 | — | orderItemId @unique 제약 존재 | schema.prisma + migration.sql | `@unique` 선언 + UNIQUE INDEX |

### smoke_tests

- 필요 여부: N. 008 은 005 의 기존 정산 흐름에 멱등 필터를 추가하는 패치이며 신규 모듈·라우트·AppModule 와이어링 변경이 없다. 단위 테스트(mock)로 멱등 분기를 직접 단언하고, DB 제약은 schema/migration 구조 검증으로 갈음한다. 005 의 기존 e2e 부팅은 회귀 0 으로 유지된다.

---

## 기타 고려사항

- **동시 재정산 경합**: 애플리케이션 필터(`findSettledOrderItemIds` → filter)는 Check-Then-Act 패턴이라 두 정산이 동시에 동일 후보를 통과시킬 이론적 경합이 있다. 그러나 `orderItemId @unique` 가 두 번째 insert 를 P2002 로 차단하므로 DB 수준 중복은 발생하지 않는다(방어 심층화 — research.md 동시성 분석 참조).
- **DB UNIQUE 자동 단언 부재**: 동일 항목 중복 insert → P2002 의 자동화 테스트는 없다(방어 심층화 구조 검증으로 갈음). coverage-gap.md 에 기록.
- **마이그레이션 적용 특이사항**: `migrate dev` 가 UNIQUE 경고로 비-TTY 환경에서 실패하여, 수동으로 마이그레이션 폴더를 생성한 뒤 `migrate deploy` 로 적용했다(적용 전 DB 중복 0건 확인). db-design/migrations/README.md 참조.
