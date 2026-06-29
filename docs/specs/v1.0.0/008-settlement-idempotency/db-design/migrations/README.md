---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# 008 마이그레이션 포인터

## 목차

- [실제 마이그레이션 위치](#실제-마이그레이션-위치)
- [포함 내용 요약](#포함-내용-요약)
- [적용 특이사항 (비-TTY 실패 → 수동 deploy)](#적용-특이사항-비-tty-실패--수동-deploy)

---

## 실제 마이그레이션 위치

008 의 실제 적용 마이그레이션 SQL 은 Prisma 마이그레이션 디렉토리에 위치하며 git 이 형상관리 SoT 다.
본 문서는 전체 SQL 을 중복 박제하지 않고 경로·요약만 가리킨다.

```
apps/backend/prisma/migrations/20260629183631_008_settlement_item_orderitem_unique/migration.sql
```

전체 내용 확인:

```bash
cat apps/backend/prisma/migrations/20260629183631_008_settlement_item_orderitem_unique/migration.sql
```

테이블·제약의 사람이 읽을 설명은 [../data-model.md](../data-model.md) 가 담당한다.

---

## 포함 내용 요약

해당 마이그레이션 파일이 생성하는 객체:

| 종류 | 객체 | 스키마 |
|---|---|---|
| Unique Index | `settlement_items_orderItemId_key` (`orderItemId`) | settlements |

마이그레이션 SQL(2줄):

```sql
-- CreateIndex
CREATE UNIQUE INDEX "settlement_items_orderItemId_key" ON "settlements"."settlement_items"("orderItemId");
```

> 신규 테이블·컬럼·enum 0. 기존 `settlement_items` 테이블에 UNIQUE INDEX 1종만 추가한다.

---

## 적용 특이사항 (비-TTY 실패 → 수동 deploy)

`prisma migrate dev` 는 기존 테이블 컬럼에 UNIQUE 제약을 추가할 때 데이터 손실 가능성에 대한 경고와
확인 프롬프트를 출력한다. 비-TTY(자동 실행) 환경에서는 프롬프트에 응답할 수 없어 `migrate dev` 가
실패했다. 따라서:

1. `settlement_items` 의 `orderItemId` **중복 0건을 직접 확인**(UNIQUE 위반 가능성 사전 제거).
2. 마이그레이션 폴더(`20260629183631_008_settlement_item_orderitem_unique/`)를 **수동 생성**하고
   `migration.sql` 작성.
3. `prisma migrate deploy` 로 적용. `prisma migrate status` up-to-date 확인.

> 005 의 마이그레이션 드리프트(004 테이블 동반 캡처)와 달리, 008 은 단일 객체(UNIQUE INDEX)만 포함하는
> 깨끗한 산출물이다.
