---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# 013 마이그레이션 포인터

## 목차

- [실제 마이그레이션 위치](#실제-마이그레이션-위치)
- [포함 내용 요약](#포함-내용-요약)
- [적용 특이사항 (비파괴 신규 테이블)](#적용-특이사항-비파괴-신규-테이블)

---

## 실제 마이그레이션 위치

013 의 실제 적용 마이그레이션 SQL 은 Prisma 마이그레이션 디렉토리에 위치하며 git 이 형상관리 SoT 다.
본 문서는 전체 SQL 을 중복 박제하지 않고 경로·요약만 가리킨다.

```
apps/backend/prisma/migrations/20260629121613_013_admin_audit_log/migration.sql
```

전체 내용 확인:

```bash
cat apps/backend/prisma/migrations/20260629121613_013_admin_audit_log/migration.sql
```

테이블·컬럼·인덱스의 사람이 읽을 설명은 [../data-model.md](../data-model.md) 가 담당한다.

---

## 포함 내용 요약

해당 마이그레이션 파일이 생성하는 객체:

| 종류 | 객체 | 스키마 |
|---|---|---|
| Table | `admin_audit_logs`(id·adminId·action·targetType·targetId·createdAt, PK id) | admin |
| Index | `admin_audit_logs_createdAt_idx` (`createdAt` DESC) | admin |
| Index | `admin_audit_logs_adminId_createdAt_idx` (`adminId`, `createdAt` DESC) | admin |

마이그레이션 SQL 요지:

```sql
-- CreateTable
CREATE TABLE "admin"."admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin"."admin_audit_logs"("createdAt" DESC);
CREATE INDEX "admin_audit_logs_adminId_createdAt_idx" ON "admin"."admin_audit_logs"("adminId", "createdAt" DESC);
```

> 신규 테이블 1·인덱스 2. enum·UNIQUE·FK 0. 기존 테이블 변경 0(전체 테이블 29→30).

---

## 적용 특이사항 (비파괴 신규 테이블)

`CREATE TABLE` 은 기존 데이터에 영향 없이 적용되며 데이터 손실 경고가 없다. 따라서 008(기존 테이블
UNIQUE 제약 추가 — 비-TTY 프롬프트 실패로 수동 deploy 필요)과 달리 `prisma migrate dev` 로 정상
적용했다. 적용 후 `prisma migrate status` up-to-date 를 확인했다(전체 테이블 30).

> `admin_audit_logs` 는 admin 모듈 최초의 자기 소유 테이블이다(007 까지 admin 모듈은 자체 테이블 없이
> 도메인 Service 조합만 수행). append-only — 애플리케이션 경로(`AdminRepository`)는 INSERT·SELECT 만
> 제공한다(UPDATE/DELETE 미제공).
