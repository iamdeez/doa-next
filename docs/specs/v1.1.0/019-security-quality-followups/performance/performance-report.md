---
작성: Performance Agent
버전: v1.0
최종 수정: 2026-07-05 18:40
상태: 확정
---

# 성능 측정 및 최적화 결과

## 목차

- [검토 범위](#검토-범위)
- [Constitution 성능 원칙 조항 이행 현황](#constitution-성능-원칙-조항-이행-현황)
- [성능 목표](#성능-목표)
- [Baseline 측정 결과](#baseline-측정-결과)
- [병목 지점 분석](#병목-지점-분석)
- [최적화 적용 내역](#최적화-적용-내역)
- [최종 측정 결과](#최종-측정-결과)
- [미달성 항목 및 사유](#미달성-항목-및-사유)
- [회귀 테스트 결과](#회귀-테스트-결과)

## 검토 범위

`docs/specs/v1.1.0/DIFF-019-security-quality-followups.md` 기준 변경 파일 중 성능(NFR-003)과
직결된 대상만 선정했다.

| 파일 | 포함 여부 | 사유 |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | 포함 | `Product.sellerId`·`Seller.status` 선두 복합 인덱스 2건 추가 — NFR-003 직접 대상 |
| `apps/backend/prisma/migrations/20260705162400_add_product_seller_list_indexes/*.sql` | 포함 | 실제 DDL 확인 대상 |
| `apps/backend/src/modules/product/product.repository.ts` (`listBySeller`) | 포함 | 인덱스 대상 cursor 쿼리 |
| `apps/backend/src/modules/seller/seller.repository.ts` (`listByStatusPaginated`) | 포함 | 인덱스 대상 cursor 쿼리 |
| `apps/backend/test/static/list-index.spec.ts` | 포함 | SC-007/008 정적 검증 대상 |
| `apps/backend/src/modules/admin/admin.controller.ts`, `product.controller.ts` (`@SkipThrottle()`) | 포함(부수 확인) | GET 목록 rate-limit 제거로 인덱스 경로 노출 빈도 증가 — mutating 엔드포인트 회귀 여부만 확인 |
| DTO 검증 전환(`ListQueryDto`/`AdminSellerListQueryDto`), find-email 감사로그, pino redact, `PrismaService.tx` fix | 제외 | 순수 로직/검증/로깅 변경으로 쿼리 실행 계획·처리 속도에 영향 없음(NFR-001·002·004 대상, Security Agent 영역과 중복) |

## Constitution 성능 원칙 조항 이행 현황

`{project}/.claude/docs/constitution.md`에 별도 성능(P-XXX) 조항은 없다(P-001~P-007: 모듈 경계·
AWS 의존 금지·단일 DB·클라우드 중립·결제 정합성·테스트·스펙 범위). 본 spec의 성능 요구는
`spec.md` NFR-003(인덱스 기반 스캔 요구)이 유일한 기준이다.

- **P-003(단일 DB 원칙)**: 인덱스 추가는 PostgreSQL 단일 인스턴스 내 스키마 변경이며 원칙 위반 없음.
- **P-007(스펙 범위 원칙)**: 인덱스 설계는 `plan.md` ADR-003·트랙 2 범위 내에서만 적용되었고, 범위 외
  임의 인덱스 추가는 없음(§검토 범위 표 참조).

## 성능 목표

| PERF-ID | NFR-ID | 목표값 | 측정 방법 |
|---|---|---|---|
| PERF-001 | NFR-003 | `WHERE "sellerId" = $1 ORDER BY "createdAt" DESC, id DESC` 쿼리가 Seq Scan이 아닌 인덱스 기반 스캔 | 로컬 PostgreSQL `EXPLAIN` |
| PERF-002 | NFR-003 | `WHERE status = $1 ORDER BY "createdAt" DESC, id DESC` 쿼리가 Seq Scan이 아닌 인덱스 기반 스캔 | 로컬 PostgreSQL `EXPLAIN` |

## Baseline 측정 결과

로컬 Docker PostgreSQL(`doa-next-postgres-1`, `doa_next` DB)에 `20260705162400_add_product_seller_list_indexes`
마이그레이션이 이미 적용된 상태(`public._prisma_migrations` 확인, `finished_at 2026-07-05 07:52:03`)에서
측정했다. 신규 인덱스 2건(`products_sellerId_createdAt_id_idx`, `sellers_status_createdAt_id_idx`)이
`\di products.*` / `\di users.*` 로 실제 생성 확인됨.

시드 데이터 규모: `products` 9건, `sellers` 1건(coverage-gap.md 기록과 일치).

| PERF-ID | 자연 상태(`EXPLAIN`) | 목표 달성 여부 |
|---|---|---|
| PERF-001 | `Seq Scan on products (cost=0.00..1.11 rows=1 width=155) Filter: ("sellerId" = ...)` | **미달성(데이터 볼륨 원인)** |
| PERF-002 | `Seq Scan on sellers (cost=0.00..1.01 rows=1 width=268) Filter: (status = ...)` | **미달성(데이터 볼륨 원인)** |

## 병목 지점 분석

| PERF-ID | 병목 원인 | 유형 |
|---|---|---|
| PERF-001/002 | PostgreSQL 플래너가 `products`(9행)·`sellers`(1행) 규모에서 Index Scan(`cost 0.14..7.59`/`0.12..8.14`)보다 Seq Scan(`cost 0.00..1.11`/`0.00..1.01`)의 총비용을 낮게 산정하여 Seq Scan을 채택 | **구현 수준 아님 — 플래너 비용 기반 선택(데이터 볼륨 제약)** |

인덱스 컬럼 구성 자체는 두 쿼리의 WHERE·ORDER BY와 완전히 정합한다(`product.repository.ts:87-88`
`where {sellerId}, orderBy [{createdAt desc},{id desc}]` ↔ 인덱스 `[sellerId, createdAt Desc, id Desc]`;
`seller.repository.ts:53-58` `where {status, ...}, orderBy [{createdAt desc},{id desc}]` ↔ 인덱스
`[status, createdAt Desc, id Desc]`). `SET enable_seqscan = off` 강제 시 두 쿼리 모두 신규 인덱스를
정확히 채택함을 아래에서 직접 확인했다 — 인덱스 자체가 정상 작동 가능한 구조임을 구조적으로 증명한다.

```
-- PERF-001 (enable_seqscan=off)
Limit (cost=0.14..7.59 rows=1 width=155)
  -> Index Scan using "products_sellerId_createdAt_id_idx" on products
       Index Cond: ("sellerId" = 'seed-seller-id-placeholder'::text)

-- PERF-002 (enable_seqscan=off)
Limit (cost=0.12..8.14 rows=1 width=268)
  -> Index Scan using "sellers_status_createdAt_id_idx" on sellers
       Index Cond: (status = 'PENDING'::users."SellerStatus")
```

두 플랜 모두 `Index Scan` 노드 위에 별도 `Sort` 노드가 없다 — 인덱스 컬럼 순서(`createdAt DESC, id DESC`)가
`ORDER BY`를 그대로 충족하여 정렬 비용 자체가 제거된 구조임을 의미한다(자연 상태 Seq Scan 플랜에는
`Sort` 노드가 별도 존재 — baseline 플랜 참조).

**아키텍처 수준 병목 없음**: 원인이 인덱스 설계 결함(컬럼 순서 불일치, 커버되지 않는 WHERE 등)이 아니라
시드 데이터 볼륨(9건/1건)에서 발생하는 플래너의 정상적 비용 판단이므로, 코드·스키마 구조 변경이
필요한 사안이 아니다. `list-index.spec.ts`(SC-007/008)의 정적 검증도 이미 통과 상태.

## 최적화 적용 내역

없음. 인덱스 컬럼 순서·구조가 이미 두 쿼리의 WHERE+ORDER BY를 완전히 커버하도록 설계되어(ADR-003)
추가 최적화 대상이 없다(Constitution P-007 스펙 범위 원칙상 임의 추가 최적화도 미적용).

## 최종 측정 결과

| PERF-ID | Baseline(자연 상태) | `enable_seqscan=off` 강제 시 | 목표 달성 여부 |
|---|---|---|---|
| PERF-001 | Seq Scan | Index Scan(`products_sellerId_createdAt_id_idx`) | 구조적 달성(데이터 볼륨 제약 하 자연 상태 미달성) |
| PERF-002 | Seq Scan | Index Scan(`sellers_status_createdAt_id_idx`) | 구조적 달성(데이터 볼륨 제약 하 자연 상태 미달성) |

## 미달성 항목 및 사유

- **NFR-003 / SC-009**: spec.md 문면("EXPLAIN 실행 계획이 Seq Scan이 아닌 인덱스 기반 스캔")은
  로컬 시드 데이터(products 9건·sellers 1건) 규모에서 자연 상태로는 미충족이다. 근본 원인은
  PostgreSQL 플래너의 비용 기반 선택(데이터 볼륨 부족)이며, 인덱스 부재나 컬럼 설계 결함이
  아니다 — `enable_seqscan=off` 강제 시 두 쿼리 모두 신규 인덱스를 정확히 채택함을 실측으로 확인.
  Test Agent EXECUTION(5b, `test/coverage-gap.md` SC-009 행)이 이미 동일 결론(카테고리 (3) 운영
  환경에서 확인 권장)으로 분류했으며, 본 Performance Agent가 독립적으로 재실측하여 동일 결과를
  확인했다.
- **처리 방향**: 코드/스키마 수정 불필요. 운영 데이터가 수백~수만 행 규모로 누적된 이후 동일
  `EXPLAIN`을 재실행하여 자연 상태 Index Scan 전환을 확인하는 것을 권고(coverage-gap.md와 동일
  권고, 중복 GAP 미등록 — gaps.md GAP-019 계열에 이미 등재된 사안 없음).
- 본 항목은 **아키텍처 수준 성능 문제가 아니므로 status: BLOCKED 사유에 해당하지 않는다**.

## 회귀 테스트 결과

`uv run pytest` 대상 아님(`[Python]` 전용 규칙 — 본 프로젝트는 TypeScript/NestJS). 코드 변경을
적용하지 않았으므로(§최적화 적용 내역 참조) 별도 회귀 테스트 스위트 재실행은 수행하지 않았다.
기존 5b 재검증 결과(`test/test-report.md`)의 unit 404/404·static 60/60·e2e 125/127(GAP-019-05
known-limitation 2건 제외 100%) 상태가 본 검토로 인해 변경되지 않는다.
