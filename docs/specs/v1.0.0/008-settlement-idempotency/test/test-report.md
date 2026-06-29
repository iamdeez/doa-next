---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# 테스트 실행 결과 — 008-settlement-idempotency

## 목차

- [실행 요약](#실행-요약)
- [실패 목록](#실패-목록)
- [SC 매핑표 검증](#sc-매핑표-검증)
- [설계 문서 정합성](#설계-문서-정합성)
- [회귀 탐지](#회귀-탐지)

---

## 실행 요약

> 본 retroactive 검증은 008 완료 커밋 `e97a142`(base `cf2c3d1`)에서 main session 이 게이트를 직접
> 재실행·코드리뷰하여 확인했다. 신규 단위 테스트 개수는 실제 spec 파일의 `it()` 를 직접 카운트했다(추측 금지).

| 항목 | 결과 (HEAD `e97a142`) |
|---|---|
| 실행 일시 | 2026-06-29 19:01 |
| tsc `--noEmit` | **EXIT 0** |
| Unit 테스트 (apps/backend, rootDir: src) | **231 PASS** / 0 FAIL / 24 suites |
| e2e + Static 테스트 (apps/backend, test/) | **84 PASS** / 0 FAIL / 16 suites |
| 전체 통과 여부 | **PASS** |
| 005~007 회귀 여부 | **없음** |
| 008 신규 단위 테스트 | **2** (settlement.service.spec 멱등성) |
| 마이그레이션 | `settlement_items_orderItemId_key` UNIQUE INDEX 적용(적용 전 중복 0건, `migrate status` up-to-date) |

### 007 → 008 델타

| 항목 | 007 완료(`7a9ed2c`) | 008 완료(`e97a142`) | 델타 |
|---|---|---|---|
| Unit suites / PASS | 24 / 229 | 24 / 231 | **+2 PASS** (멱등성 2) / suites 무변 |
| e2e + static suites / PASS | 16 / 84 | 16 / 84 | 변화 없음 |

> **신규 단위 2 산정(직접 카운트)**: `settlement.service.spec.ts` 의 008 추가분
> `when_some_items_already_settled...`·`when_all_items_already_settled...` = 2. 229 + 2 = 231 정합.

### 실행 커맨드

```bash
cd /Users/krystal/workspace/doa/doa-next/apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 24 suites / 231 PASS
npx jest --config ./test/jest-e2e.json                                         # 16 suites / 84 PASS
```

---

## 실패 목록

**실패 없음.** tsc EXIT 0, unit 231 + e2e/static 84 = 전체 PASS.

---

## SC 매핑표 검증

| SC-ID | 관련 테스트 | 통과 여부 |
|---|---|---|
| SC-001 | settlement.service.spec.ts: when_some_items_already_settled_then_excluded_from_aggregation | PASS |
| SC-002 | settlement.service.spec.ts: when_all_items_already_settled_then_zero_and_no_items_created | PASS |
| SC-003 | schema.prisma `SettlementItem.orderItemId @unique` + migration `settlement_items_orderItemId_key` UNIQUE INDEX (정적 구조 검증) | PASS |

---

## 설계 문서 정합성

### plan.md 현행화 점검

- 멱등 판정 위치 — `SettlementRepository.findSettledOrderItemIds` 가 `this.prisma.tx.settlementItem`
  (자기 소유 테이블)만 조회 — plan.md ADR-001·P-001 과 일치 ✓
- DB 중복 차단 — `SettlementItem.orderItemId @unique` → `settlement_items_orderItemId_key` —
  plan.md ADR-002 와 일치 ✓
- 전체 기집계 시 금액 0 + createItems skip — `items.length > 0` 분기 — plan.md ADR-003·SC-002 와 일치 ✓
- 금액 재계산 Prisma.Decimal(`add`·`mul(rate).toDecimalPlaces(2, ROUND_HALF_UP)`·`minus`) —
  plan.md ADR-004·P-005 와 일치 ✓

### 발견된 한계·관찰

- **DB UNIQUE P2002 자동 단언 부재**: 동시 재정산 경합 시 P2002 거부의 통합 테스트 없음(방어 심층화
  구조 검증으로 갈음). coverage-gap.md 기록. 신규 GAP 아님(SC-003 정적 커버).

### 005~007 회귀 확인

- settlement.service.spec.ts: 008 의 멱등 필터는 `findSettledOrderItemIds` 기본 mock `[]`(기집계 없음)
  에서 005 기존 테스트(Decimal 계산·반올림·빈 항목·조회)가 전부 PASS → 회귀 0.
- 기타 모듈(order/banner/stats/admin/coupon/review/shipping/notification/file 등): 008 미변경, 전체 PASS.

---

## 회귀 탐지

008 이 추가/변경한 파일 (`git diff cf2c3d1 e97a142` 기준):
- `prisma/schema.prisma`: SettlementItem.orderItemId @unique (+2 -1)
- `prisma/migrations/20260629183631_008_settlement_item_orderitem_unique/migration.sql`: 신규 (+2)
- `src/modules/settlement/settlement.repository.ts`: findSettledOrderItemIds (+13)
- `src/modules/settlement/settlement.service.ts`: createSettlement 멱등 필터 (+10 -1)
- `src/modules/settlement/settlement.service.spec.ts`: 멱등성 2 케이스 (+52)

007 baseline(229 unit) 대비 008 신규 2 → 231 unit (회귀 0). e2e+static 16 suites/84 PASS, 전체
PASS·회귀 0 을 확인했다.
