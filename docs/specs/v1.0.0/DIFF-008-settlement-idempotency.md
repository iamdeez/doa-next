---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Diff: 008-settlement-idempotency

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

## 커밋 메시지용 한 줄 요약

- **KO**: 008 정산 멱등성 보강 (SEC-FIND-005-01) — 기집계 제외 + orderItemId @unique
- **EN**: 008 settlement idempotency — exclude already-settled items & orderItemId unique constraint

## 변경 요약

- **Prisma 스키마**: `SettlementItem.orderItemId` 에 `@unique` 추가(주석: 동일 주문항목 중복 정산 DB
  수준 차단 — 008 SEC-FIND-005-01). 신규 테이블·컬럼·enum 0.
- **마이그레이션(008)**: `settlement_items_orderItemId_key` UNIQUE INDEX 생성(`migration.sql` 2줄).
  `migrate dev` 가 UNIQUE 경고로 비-TTY 실패 → 수동 폴더 생성 후 `migrate deploy` 적용(적용 전 DB 중복
  0건 확인).
- **settlement.repository**: `findSettledOrderItemIds(orderItemIds)` 신규 — 자기 소유 테이블
  (`settlement_items`)에서 `orderItemId IN (...)` 조회 후 매칭 id 반환. 빈 입력 즉시 `[]`(P-001).
- **settlement.service**: `createSettlement` 가 후보(`getCompletedItemsForSettlement`) 중 기집계
  `orderItemId` 를 `Set` 으로 제외한 뒤 `totalSales`·`commission`(ROUND_HALF_UP)·`payoutAmount` 를
  Prisma.Decimal 로 재계산. 남은 항목 0건이면 `createItems` 미호출(금액 0 정산 생성).
- **테스트**: settlement.service.spec 에 멱등성 2건 추가 — 일부 기집계→해당 항목만 집계(SC-001),
  전체 기집계→0/createItems 미호출(SC-002).
- **해결**: SEC-FIND-005-01(정산 중복집계, Medium) / GAP-005-01 완전 해결(코드+DB제약+테스트 3중).

## 변경 파일 및 라인 수

> 범위: `apps/backend`. base `cf2c3d1` → `e97a142`(008 완료).

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/prisma/migrations/20260629183631_008_settlement_item_orderitem_unique/migration.sql` | +2 | -0 |
| `apps/backend/prisma/schema.prisma` | +2 | -1 |
| `apps/backend/src/modules/settlement/settlement.repository.ts` | +13 | -0 |
| `apps/backend/src/modules/settlement/settlement.service.ts` | +10 | -1 |
| `apps/backend/src/modules/settlement/settlement.service.spec.ts` | +52 | -0 |

**합계 (apps/backend)**: 5 files changed, 79 insertions(+), 2 deletions(-).

> 본 008 SDD 문서 세트(`docs/specs/v1.0.0/008-settlement-idempotency/**`) 와 `CHANGES.md` 의 008 항목,
> 그리고 005 문서의 SEC-FIND-005-01 / GAP-005-01 상태 갱신은 `e97a142` 코드 커밋 **이후** retroactive 로
> 별도 추가되었다(코드 diff 범위 외).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·비효율이다.
> 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면 아래로 재생성한다:
>
> ```bash
> git diff cf2c3d1 e97a142 -- apps/backend   # base commit: cf2c3d1
> ```
