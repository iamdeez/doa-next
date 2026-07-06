---
작성: Database Design Agent
버전: v1.0
최종 수정: [시각 미확인, spawn 기준 21:40]
상태: 확정
---

# Data Model: 020-data-migration-cutover

> Branch: 020-data-migration-cutover | Plan: [../planning/plan.md](../planning/plan.md) | Research: [../design/research.md](../design/research.md)
>
> **본 파일은 인덱스다** — 실제 산출물(매핑 명세·DDL·변환/검증 SQL)의 canonical 경로는 tasks.md T001 이 지정한
> repo-root `scripts/migration/`이며, 본 파일은 각 산출물의 위치·핵심 결정만 요약한다(중복 생성 금지, 019 A-layer 패턴 승계).

## 목차

- [DB 선택 및 근거](#db-선택-및-근거)
- [산출물 위치](#산출물-위치)
- [엔티티 관계도 요약](#엔티티-관계도-요약)
- [핵심 결정 요약](#핵심-결정-요약)
- [완료 기준 대조](#완료-기준-대조)

---

## DB 선택 및 근거

신규 타깃 DB 는 이미 확정되어 있다(Fly Postgres 단일 인스턴스, 8스키마 33테이블 — `apps/backend/prisma/schema.prisma`, 무변경). 본 spec 은 스키마 신설이 아니라 **레거시→신규 데이터 이관**이므로, DB 선택 대상은 스테이징 저장소뿐이다.

- **스테이징 저장소 = 타깃과 동일 Fly Postgres 인스턴스 내 임시 스키마(`migration_staging`)**. 별도 스토리지 신규 도입 없음(P-003 단일 DB 원칙 준수, plan.md ADR-001).

## 산출물 위치

| 산출물 | canonical 경로 |
|---|---|
| 필드 단위 매핑 명세 + ephemeral 정책 + 델타 분류 확정 | [`scripts/migration/MAPPING-SPEC.md`](../../../../../scripts/migration/MAPPING-SPEC.md) |
| 스테이징/감사 DDL | [`scripts/migration/sql/00_staging_ddl.sql`](../../../../../scripts/migration/sql/00_staging_ddl.sql) |
| 변환 UPSERT SQL(위상 순서) | [`scripts/migration/sql/10_transform.sql`](../../../../../scripts/migration/sql/10_transform.sql) |
| 검증 SQL(count·sum·checksum·anti-join) | [`scripts/migration/sql/20_verify.sql`](../../../../../scripts/migration/sql/20_verify.sql) |

## 엔티티 관계도 요약

타깃 33테이블·8스키마 구조는 `context.md §4`·`apps/backend/prisma/schema.prisma`에 이미 실체화되어 있으며 본 spec 으로 변경되지 않는다. 이관 관점의 추가 정보(레거시 대응·PK 보존·델타 분류)는 `MAPPING-SPEC.md`가 SoT다.

```
migration_staging (임시, 컷오버 후 DROP)
  stg_<schema>_<table>  (29개 — ephemeral 4종 제외)
  verification_runs     (감사 — 단계별 시작/종료/검증결과, ADR-010)
       │ 10_transform.sql (위상순서 UPSERT)
       ▼
users → products → commerce → orders → payments → settlements → admin → files
(기존 33테이블, DDL 무변경)
```

## 핵심 결정 요약

| 결정 | 내용 | 상세 |
|---|---|---|
| PK 보존 전략 | 레거시 원본 식별자를 그대로 String `id`에 이관(cuid 재발급 금지) | MAPPING-SPEC §4 |
| Ephemeral 4종 정책 | `refresh_tokens`·`password_reset_otps`·`oauth_states`·`payment_outbox` 전체 스킵 | MAPPING-SPEC §2, GAP-020-01 RESOLVED |
| 비-1:1 변환 3건 | `commerce.carts`(JSON 집계)·`orders.orders.shippingAddressSnapshot`(JSON 조립)·`products.variants`(옵션 인라인, 가정) | MAPPING-SPEC §8 |
| Enum casing 정규화 | enum 타입별 대/소문자 혼재(예: `OrderStatus` 소문자 vs `SellerStatus` 대문자) — 변환 SQL 필수 정규화 | MAPPING-SPEC §5 |
| 발견 사항 | `FileAsset` 물리 테이블명은 `files.files`(`file_assets` 아님) — 코드-문서 불일치 | MAPPING-SPEC §1, GAP-020-02(OPEN) |

## 완료 기준 대조

- [x] 매핑표 신규 33테이블 전수 등장(SC-011) — MAPPING-SPEC §11 자가검증
- [x] "1:1 아님" 항목 전건 변환 규칙 기재(SC-012) — MAPPING-SPEC §8 (3건: carts·shippingAddressSnapshot·variants)
- [x] ephemeral 테이블 이관 정책 명시(GAP-020-01 RESOLVED)
- [x] `migration_staging` + `verification_runs` DDL 존재
- [x] 변환 SQL 위상 순서(스키마 내부 FK 부모-우선) 준수
- [x] 검증 SQL 4종(count·Decimal sum·sample checksum·anti-join) 존재
