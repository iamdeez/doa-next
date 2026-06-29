---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Research: 008-settlement-idempotency

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [영향 범위 분석 (호출 측 전수 목록)](#영향-범위-분석-호출-측-전수-목록)
  - [공유 상태·동시성 분석](#공유-상태동시성-분석)
- [영향 파일 목록](#영향-파일-목록)
- [외부 라이브러리 API 실제 동작 확인](#외부-라이브러리-api-실제-동작-확인)
- [기술 선택 조사](#기술-선택-조사)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상 모듈(plan §핵심 설계)**: `settlement`(repository `findSettledOrderItemIds` 신규, service `createSettlement` 멱등 필터), `schema.prisma`(SettlementItem.orderItemId @unique — Database Design Agent 소유).
- §A·B·C 분석은 위 모듈로 한정. order 모듈은 **변경 없음**(005 `getCompletedItemsForSettlement` 재사용).
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): 미해당(인가 변경 없음 — 005 의 정산 라우트 가드 그대로).
- 외부 라이브러리 검증(§4): **신규 라이브러리 0건**. 기존 `Prisma.Decimal`·Prisma `findMany`·UNIQUE 제약만.
- §F(production 시그니처 변경): **해당 없음** — `findSettledOrderItemIds` 는 신규 additive, `createSettlement` 입력 시그니처 불변(내부 로직만 변경). 기존 호출 측 영향 0.

---

## 기존 코드베이스 분석

> context.md §2 핵심 모듈 목록을 기준선. 본 절은 변경 대상 한정 정밀 분석.

### 클래스·모듈 계층 구조

- **OOP 상속/추상 클래스 없음**: 변경 대상은 NestJS `@Injectable()` concrete 클래스(`SettlementService`·`SettlementRepository`).
- **모듈 DI 토폴로지(실측)**: `SettlementService` 생성자 — `SettlementRepository`, `PrismaService`, `OrderService`, `SellerService`, `EventEmitter2`(EventEmitter2 는 009 에서 추가, 008 시점에는 미주입). `SettlementRepository` 생성자 — `PrismaService`. 008 은 새 DI 의존을 추가하지 않는다.
- **순환 DI 점검**: 008 은 모듈 import 그래프를 변경하지 않는다. settlement → order/seller(단방향, 005 기존). 순환 없음.

### 영향 범위 분석 (호출 측 전수 목록)

- **`SettlementRepository.findSettledOrderItemIds`(신규 공개)**: 신규 추가이므로 기존 호출 측 0. `SettlementService.createSettlement` 만 호출(신규).
- **`SettlementService.createSettlement`(내부 변경)**: 입력 시그니처 불변. 기존 호출 측(`SettlementController` 의 정산 생성 라우트, 005 단위 테스트)은 시그니처 변경 없이 그대로 동작. 멱등 필터로 인해 동일 입력에 대한 출력(items·금액)이 기집계 상태에 따라 달라질 수 있으나, 005 기존 테스트는 `findSettledOrderItemIds.mockResolvedValue([])`(기집계 없음) 기본값으로 전부 통과(회귀 0).
- **`OrderService.getCompletedItemsForSettlement`(재사용)**: 005 시점부터 존재. 008 변경 없음.

### 공유 상태·동시성 분석

- **공유 자원**: `settlements.settlement_items`(정산 항목 — settlement 모듈 소유).
- **Check-Then-Act 분석**:
  | 자원 | 위험 | 현재 안전망 | 근거 |
  |---|---|---|---|
  | settlement_items (멱등 필터) | `findSettledOrderItemIds`(조회) → `createItems`(쓰기) 사이 다른 정산이 동일 orderItemId insert | 애플리케이션 필터는 비원자적이나, `orderItemId @unique` 가 두 번째 insert 를 P2002 로 차단(DB 수준 최종 안전망) | FR-001·002 |
- **Lock 범위**: 별도 비관 락 미사용. 멱등 판정 조회는 read, insert 는 단일 트랜잭션. DB UNIQUE 가 경합 안전망.
- **안전성 근거**: 애플리케이션 필터(Check-Then-Act)만으로는 동시 재정산 경합에서 빈틈이 있으나, `SettlementItem.orderItemId @unique` 제약이 동일 항목의 두 번째 insert 를 구조적으로 차단한다. 따라서 DB 수준에서 동일 `orderItemId` 의 중복 집계는 발생하지 않는다(방어 심층화).

---

## 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정(DB Design 소유) | `SettlementItem.orderItemId @unique` + 주석 | A |
| `prisma/migrations/20260629183631_008_settlement_item_orderitem_unique/migration.sql` | 신규 | `settlement_items_orderItemId_key` UNIQUE INDEX | A |
| `src/modules/settlement/settlement.repository.ts` | 수정(additive) | `findSettledOrderItemIds(orderItemIds)` | A |
| `src/modules/settlement/settlement.service.ts` | 수정 | `createSettlement` 기집계 제외 필터 + 재계산 | B |
| `src/modules/settlement/settlement.service.spec.ts` | 수정(확장) | 멱등성 단위 테스트 2건(SC-001·002) | D |

> `package.json` 변경 0건. order 모듈 변경 0건.

---

## 외부 라이브러리 API 실제 동작 확인

- **신규 외부 라이브러리: 없음 — 해당 없음**.
- **`prisma.settlementItem.findMany`(IN 절)**: `findSettledOrderItemIds` 가 `where: { orderItemId: { in: orderItemIds } }, select: { orderItemId: true }` 로 조회. 빈 배열 입력은 메서드 진입부에서 `if (orderItemIds.length === 0) return []` 로 단락(불필요 쿼리 회피).
- **`Prisma.Decimal` 재계산**: `items.reduce((acc, item) => acc.add(item.saleAmount), new Prisma.Decimal(0))` → `totalSales`. `totalSales.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)` → `commission`. `totalSales.minus(commission)` → `payoutAmount`. 항목 수수료 `saleAmount.mul(rate).toDecimalPlaces(2, ROUND_HALF_UP)`. 전부 005 의 Decimal 산술 패턴 승계.
- **`@unique` → P2002**: 동일 `orderItemId` 의 두 번째 `createMany` insert 는 Prisma 가 `P2002`(Unique constraint failed) 로 거부.

가정-실제 불일치 현재 미발견.

---

## 기술 선택 조사

| 결정 | 채택 | 근거 |
|---|---|---|
| 멱등 판정 위치 | settlement 자기 테이블(`settlement_items`) 조회 후 제외 | P-001 경계 유지(ADR-001). order 후보 쿼리 변경 회피(cross-schema 결합 방지) |
| DB 중복 차단 | `SettlementItem.orderItemId @unique` | 애플리케이션 필터 경합 빈틈 보완(ADR-002). 방어 심층화 |
| 전체 기집계 시 동작 | 금액 0 정산 생성 + createItems skip | 재정산 호출의 무해 처리(ADR-003). 거부(409)보다 운영 친화 |
| 금액 재계산 타입 | `Prisma.Decimal` | P-005 금전 정확성(ADR-004) |

---

## 엣지 케이스 및 한계

- **일부 기집계**: 후보 3건 중 oi1·oi2 기집계 → oi3 만 집계(`totalSales=5000`·`commission=500`·`payout=4500`). `findSettledOrderItemIds` 는 후보 전체(oi1·oi2·oi3)로 조회된다(테스트 `when_some_items_already_settled_then_excluded_from_aggregation`).
- **전체 기집계(재정산)**: 후보 전부 기집계 → `items=[]` → `totalSales=Decimal(0)`·`payout=Decimal(0)`, `createItems` 미호출(테스트 `when_all_items_already_settled_then_zero_and_no_items_created`).
- **빈 후보**: `getCompletedItemsForSettlement` 가 빈 배열 → `findSettledOrderItemIds([])` 즉시 `[]` → 금액 0(005 기존 `when_no_completed_items_then_zero_amounts_and_no_items_created` 테스트가 멱등 기본값으로 회귀 0 유지).
- **동시 재정산 경합(한계)**: 애플리케이션 필터의 Check-Then-Act 빈틈은 `orderItemId @unique`(P2002)로 DB 수준 차단. 단, P2002 발생 시 정산 트랜잭션 롤백 동작에 대한 자동 단언 테스트는 없다(방어 심층화 구조 검증으로 갈음 — coverage-gap).
- **마이그레이션 적용(한계)**: `migrate dev` 가 UNIQUE 추가 시 데이터 손실 경고로 비-TTY 환경에서 실패 → 수동 폴더 생성 후 `migrate deploy` 적용(적용 전 DB 중복 0건 확인). 자세한 사항은 db-design/migrations/README.md.
