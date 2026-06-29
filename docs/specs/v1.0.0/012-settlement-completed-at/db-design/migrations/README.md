---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# 012 마이그레이션 포인터

## 목차

- [실제 마이그레이션 위치](#실제-마이그레이션-위치)
- [포함 내용 요약](#포함-내용-요약)
- [적용 특이사항 (비파괴 nullable 추가)](#적용-특이사항-비파괴-nullable-추가)

---

## 실제 마이그레이션 위치

012 의 실제 적용 마이그레이션 SQL 은 Prisma 마이그레이션 디렉토리에 위치하며 git 이 형상관리 SoT 다.
본 문서는 전체 SQL 을 중복 박제하지 않고 경로·요약만 가리킨다.

```
apps/backend/prisma/migrations/20260629115624_012_order_completed_at/migration.sql
```

전체 내용 확인:

```bash
cat apps/backend/prisma/migrations/20260629115624_012_order_completed_at/migration.sql
```

테이블·컬럼의 사람이 읽을 설명은 [../data-model.md](../data-model.md) 가 담당한다.

---

## 포함 내용 요약

해당 마이그레이션 파일이 생성하는 객체:

| 종류 | 객체 | 스키마 |
|---|---|---|
| Column (nullable) | `orders.completedAt` (`TIMESTAMP(3)` NULL) | orders |

마이그레이션 SQL(2줄):

```sql
-- AlterTable
ALTER TABLE "orders"."orders" ADD COLUMN     "completedAt" TIMESTAMP(3);
```

> 신규 테이블·enum·인덱스·제약 0. 기존 `orders.orders` 테이블에 nullable 컬럼 1종만 추가한다.

---

## 적용 특이사항 (비파괴 nullable 추가)

nullable 컬럼 `ADD COLUMN` 은 기존 데이터에 NULL 백필 없이 적용되며 데이터 손실 경고가 없다. 따라서
008(기존 테이블 UNIQUE 제약 추가 — 비-TTY 프롬프트 실패로 수동 deploy 필요)과 달리 `prisma migrate dev`
로 정상 적용했다. 적용 후 `prisma migrate status` up-to-date 를 확인했다.

> 기존 행은 `completedAt=NULL` 로 유지된다. 그린필드(실 운영 데이터 없음)라 잔존 completed 주문 백필이
> 불필요하다(운영 데이터 이행 시 별도 백필 — 범위 외, gaps.md GAP-012-01 주의).
