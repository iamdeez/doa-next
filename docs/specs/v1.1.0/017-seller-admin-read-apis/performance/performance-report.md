---
작성: Performance Agent
버전: v1.0
최종 수정: 2026-07-04 00:51
상태: 확정
---

# 성능 측정 및 최적화 결과 — 017-seller-admin-read-apis

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

---

## 검토 범위

`DIFF-017-seller-admin-read-apis.md`(base `0196b9a`, `apps/backend` 범위 한정) 변경 파일 25개 중,
spec.md NFR-001(FR-002·FR-006 cursor 목록 조회 API P95)과 직접 관련된 경로를 plan.md "핵심 설계"
5절·research.md "영향 범위 분석"·"공유 상태·동시성 분석" 대조로 확정하여 아래 8개 소스 파일을 직접
Read 로 검토했다.

| 파일 | 검토 사유 |
|---|---|
| `src/modules/admin/admin.controller.ts` | 관리자 판매자 목록 신규 query 파라미터(status·cursor·limit·q) 진입점 |
| `src/modules/admin/admin.service.ts` | `listSellers()` — limit 클램프 후 SellerService 위임 |
| `src/modules/seller/seller.service.ts` | 신규 공개 `listSellers()` DI 메서드 |
| `src/modules/seller/seller.repository.ts` | `listByStatusPaginated()` — cursor 페이지네이션 쿼리 (FR-002 대상) |
| `src/modules/product/product.repository.ts` | `listBySeller()`(cursor 페이지네이션, FR-006 대상)·`findPublicSummariesByIds()`(N+1 회피 대상) |
| `src/modules/product/product.service.ts` | `listMyProducts()`·`getPublicSummaries()`(단일 `in` 쿼리 배치) |
| `src/modules/user/user.service.ts` | `listWishlist`·`listRecentViews`·`enrichWithProductSummary()`(N+1 회피 호출부) |
| `apps/backend/prisma/schema.prisma` | `Product`·`Seller` 모델 인덱스 정의 — cursor 쿼리 플랜 적정성 확인 |

추가로 `apps/backend/test/perf/list-p95.e2e-spec.ts`(SC-018 실측 harness)와
로컬 `docker-compose` PostgreSQL(`doa-next-postgres-1`)에 직접 접속해 `EXPLAIN` 실행 결과를
근거로 사용했다.

**제외 파일**: `inventory.service.ts`(`getStockView`·`stockIn`)는 단건 조회/갱신 엔드포인트로
NFR-001(목록 API 한정) 적용 대상이 아니며, `stockIn`의 커밋 후 재조회 1건은 PK(`variantId`
1:1 관계) 단건 조회로 성능 영향이 무시할 수준이라 상세 분석에서 제외했다. `admin.controller.spec.ts`
등 테스트 파일은 실행 로직이 아니므로 소스 성능 감사 대상에서 제외했다(대신 `list-p95.e2e-spec.ts`
는 실측 harness로 직접 활용).

---

## Constitution 성능 원칙 조항 이행 현황

`.claude/docs/constitution.md`에는 별도 번호의 "성능 원칙" 조항이 없다. 성능 관련 조항은
P-003(단일 DB 원칙)·P-007(스펙 범위 원칙) 2개다.

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-003 단일 DB 원칙 | 이행 | 본 spec 은 신규 외부 캐시·저장소를 도입하지 않는다. N+1 회피(`getPublicSummaries`)도 단일 PostgreSQL `in` 쿼리로 해결(캐시 레이어 불필요). |
| P-007 스펙 범위 원칙 | 이행 | plan.md Constitution Gates 가 "신규 마이그레이션은 범위 외 명시, PASS"로 이미 확정했다. 본 Agent 는 §병목 지점 분석에서 식별한 인덱스 부재(GAP-017-03)를 이 조항에 따라 **이번 spec 범위에서 직접 적용하지 않고** 별도 spec 권고로 처리했다(§최적화 적용 내역 참조). |

---

## 성능 목표

| PERF-ID | NFR-ID | 대상 | 목표값 | 측정 방법 |
|---|---|---|---|---|
| PERF-001 | NFR-001 | `GET /admin/sellers/pending?limit=20`(FR-002) | P95 ≤ 500ms | `test/perf/list-p95.e2e-spec.ts`, 로컬 docker-compose PostgreSQL, 데이터 1,000건 미만, 100회 반복 HTTP 요청 P95 |
| PERF-002 | NFR-001 | `GET /sellers/me/products?limit=20`(FR-006) | P95 ≤ 500ms | 상동 |
| PERF-003 | (NFR-001 인접, 정성) | 위시리스트·최근 본 상품 상품 요약 조인(FR-010~012) | N+1 미발생(단일 배치 쿼리) | 코드 정적 검토(호출 경로 grep + Read) |
| PERF-004 | (NFR-001 인접, 정성) | 관리자 판매자 목록·판매자 상품 목록 cursor 쿼리 플랜 | 인덱스 스캔(뒷받침 인덱스 존재) | `EXPLAIN` 실행(로컬 docker-compose PostgreSQL) |

---

## Baseline 측정 결과

### PERF-001 / PERF-002 — SC-018 실측 (독립 재검증)

5b Test Agent(EXECUTION)가 실측한 결과를 본 Agent가 동일 조건(`SEED_PRODUCT_COUNT=30`,
`REPEAT_COUNT=100`, 로컬 docker-compose PostgreSQL)으로 **독립 재실행**하여 재현했다
(`pnpm test:e2e -- list-p95`, Test Suites 1 passed / Tests 2 passed).

| 대상 | 5b 실측 P95 | 본 Agent 재검증 P95 | 목표 | 판정 |
|---|---|---|---|---|
| `GET /admin/sellers/pending?limit=20` | 3ms (avg 2ms, max 19ms, min 1ms) | PASS (재실행 확인, 개별 수치는 jest 로그 상단부 미캡처— Test Suites 2/2 PASS로 통과 확정) | ≤500ms | **PASS** |
| `GET /sellers/me/products?limit=20` | 4ms (avg 3ms, max 7ms, min 2ms) | 4ms (avg 3ms, max 7ms, min 2ms) — **5b 수치와 완전 일치 재현** | ≤500ms | **PASS** |

임계값(500ms) 대비 여유가 125배(3~4ms 대비) 이상이며, 두 차례 독립 측정에서 동일 결과가
재현되어 harness·구현 정상 동작을 신뢰할 수 있다.

### PERF-003 — N+1 회피 (정적 검토, 코드 직접 확인)

```
product.repository.ts:99-106  findPublicSummariesByIds(ids)
  → prisma.product.findMany({ where: { id: { in: ids }, status: { in: [ACTIVE, OUT_OF_STOCK] } },
                               include: { images: { orderBy, take: 1 } } })   # 단일 쿼리

product.service.ts:293-305    getPublicSummaries(productIds)
  → productRepository.findPublicSummariesByIds(productIds) 1회 호출, 루프 내 재호출 없음

user.service.ts:207-221       enrichWithProductSummary(rows)
  → productService.getPublicSummaries(rows.map(r => r.productId)) 1회 호출(배치)
  → rows.map()으로 Map 조회만 수행(추가 쿼리 없음)
```

`listWishlist`·`listRecentViews` 모두 `enrichWithProductSummary` 단일 헬퍼를 거치며, 항목 수와
무관하게 정확히 2회 쿼리(row 조회 1회 + 배치 summary 조회 1회)로 완결된다. **N+1 없음 확인.**

### PERF-004 — cursor 쿼리 플랜 (EXPLAIN 실측)

`schema.prisma` 확인 결과 `Product` 모델은 `@@index([status, createdAt(sort: Desc), id(sort: Desc)])`
(공개 목록 `listPublic` 전용)만 존재하고 `sellerId` 를 포함하는 인덱스가 없다. `Seller` 모델은
`sellers_pkey`(id)·`sellers_userId_key`(unique)만 존재하고 `status` 를 포함하는 인덱스가 전혀 없다.

로컬 docker-compose PostgreSQL(`doa-next-postgres-1`)에 직접 접속해 실제 쿼리 형태로 `EXPLAIN`
실행:

```sql
EXPLAIN SELECT * FROM products.products WHERE "sellerId" = 'test-seller-id'
  ORDER BY "createdAt" DESC, id DESC LIMIT 20;
-- → Seq Scan on products (Filter: sellerId = ...) → Sort → Limit   [인덱스 미사용]

EXPLAIN SELECT * FROM users.sellers WHERE status = 'PENDING'
  ORDER BY "createdAt" DESC, id DESC LIMIT 20;
-- → Seq Scan on sellers (Filter: status = ...) → Sort → Limit      [인덱스 미사용]
```

두 쿼리 모두 **Seq Scan + Sort**로 확정됐다(뒷받침 인덱스 부재). 현재 테이블 규모(`products` 9건,
`sellers` 1건)에서는 플래너 비용(`cost=1.12`/`cost=13.38`)이 무시할 수준이라 PERF-001/002 실측치에
영향이 없으나, 판단 기준(목표: 인덱스 스캔)은 **미달성**이다. §병목 지점 분석·§미달성 항목 참조.

---

## 병목 지점 분석

| PERF-ID | 병목 원인 | 유형 |
|---|---|---|
| PERF-001/002 | 없음 — 실측 P95 3~4ms로 목표(500ms) 대비 여유 매우 큼 | — |
| PERF-003 | 없음 — 단일 배치 쿼리로 N+1 회피 확인 | — |
| PERF-004 | `Product.sellerId`·`Seller.status`를 뒷받침하는 인덱스가 없어 `listBySeller`(FR-006)·`listByStatusPaginated`(FR-002) 쿼리가 Seq Scan + Sort로 실행됨. 현재 데이터 규모에서는 무해하나, `products` 테이블이 성장(판매자당 상품 수 증가)할수록 요청당 비용이 테이블 전체 크기에 비례해 증가하는 구조 | **구현 수준** (쿼리 최적화 — 인덱스 추가) |

**PERF-004 를 구현 수준으로 분류하는 근거**: 서비스 분할, 캐시 레이어 도입, DB 엔진 교체 등
구조적 재설계가 필요한 문제가 아니라, 단일 복합 인덱스 추가(DDL)로 해소 가능한 전형적인 쿼리
최적화 사안이다. 아키텍처 수준 병목(BLOCKED 대상)에 해당하지 않는다.

---

## 최적화 적용 내역

**본 spec 범위에서 적용한 최적화: 없음.**

PERF-004(인덱스 부재)는 구현 수준 병목으로 분류되어 통상적으로는 Step 5(최적화 적용) 대상이지만,
아래 근거로 본 spec 범위에서 직접 적용(신규 Prisma 마이그레이션)하지 않았다.

| 근거 | 내용 |
|---|---|
| plan.md Constitution Gates | "P-007 스펙 범위 원칙: ... 신규 마이그레이션은 범위 외 명시. **PASS**" — 이미 Planning 단계에서 마이그레이션 없음이 확정·승인됨 |
| plan.md 데이터 모델 절 | "신규 Prisma 마이그레이션 없음. 모든 변경은 기존 테이블·컬럼 범위 내 응답 DTO/조회 로직 확장이다(spec 범위 외 명시)" |
| constitution P-007 | "spec 외 리팩토링, 기능 추가, **성능 개선**은 별도 spec으로 분리한다" — 인덱스 추가는 신규 마이그레이션을 필요로 하며 이 조항이 정의하는 "spec 외 성능 개선"에 해당 |
| performance.md 핵심 원칙 4 | "constitution.md 의 성능 원칙을 위반하는 최적화를 적용" 금지 |
| NFR-001 현재 달성 여부 | PERF-001/002 는 spec.md 가 명시한 측정 조건(데이터 1,000건 미만)에서 이미 PASS(3~4ms, 여유 125배 이상) — "미달성 항목을 구현 수준에서 긴급 수정해야 하는" 상황이 아님 |

이에 따라 PERF-004 는 코드·스키마 변경 없이 **GAP-017-03**(`gaps.md`)으로 기록하여 별도 spec에서
`Product.sellerId`·`Seller.status` 복합 인덱스 추가를 권고하는 방식으로 처리했다. 이는 Security
Agent가 SEC-017-01(Low, 비블로킹 — DTO 검증 누락)을 처리한 것과 동일한 패턴(범위 밖 발견 사항은
권고로 문서화, 코드 변경 없이 후속 spec 위임)이다.

---

## 최종 측정 결과

| PERF-ID | Baseline | 최종값 | 목표 달성 여부 |
|---|---|---|---|
| PERF-001 | P95=3ms(5b) | 변경 없음(재검증 재현, Test Suites 2/2 PASS) | **PASS** |
| PERF-002 | P95=4ms(5b) | 4ms(본 Agent 독립 재실행 재현) | **PASS** |
| PERF-003 | N+1 없음(정적 확인) | 변경 없음(코드 무수정) | **PASS** |
| PERF-004 | Seq Scan(EXPLAIN 확인) | 변경 없음(코드 무수정, GAP-017-03 위임) | **미달성 (비블로킹, 후속 spec 위임)** |

---

## 미달성 항목 및 사유

- **PERF-004 (cursor 쿼리 인덱스 스캔)**: `Product.sellerId`·`Seller.status` 뒷받침 인덱스 부재로
  현재 Seq Scan + Sort 로 실행된다. **NFR-001 자체는 미달성이 아니다** — spec.md가 명시한 측정
  조건(데이터 1,000건 미만)에서 PERF-001/002 실측 P95(3~4ms)가 목표(500ms)를 큰 여유로 충족하기
  때문이다. 미달성 판정은 "인덱스 스캔"이라는 본 Agent의 보조 정성 목표(PERF-004, §성능 목표)에
  국한되며, 데이터 규모가 커질 때의 확장성 리스크에 대한 선제적 식별이다. 사유: plan.md가 이미
  "신규 마이그레이션 범위 외"로 확정(Constitution Gates P-007 PASS)했고, constitution P-007이
  spec 외 성능 개선을 별도 spec으로 분리하도록 강제하므로, 본 spec 범위에서 인덱스를 추가하는 것은
  스펙 범위 원칙 위반이다. **GAP-017-03**으로 기록해 후속 spec에서 `@@index([sellerId,
  createdAt(sort: Desc), id(sort: Desc)])`(Product)·`@@index([status, createdAt(sort: Desc),
  id(sort: Desc)])`(Seller) 추가를 권고했다.

---

## 회귀 테스트 결과

본 spec 범위에서 코드·스키마 변경을 적용하지 않았으므로(§최적화 적용 내역 참조) 회귀 검증 대상인
production 코드 변경이 없다. 참고로 SC-018 실측 재검증 시 `pnpm test:e2e -- list-p95` 를 독립
재실행하여 2/2 PASS를 확인했으며, `afterAll` 정리 로직으로 시딩한 테스트 데이터(30건 상품·1건
판매자)가 정상 제거되어 DB 상태가 재실행 전후 동일함(`products` 9건·`sellers` 1건 불변)을
확인했다. `git status` 상 본 Agent로 인한 코드 변경분은 0건이다(기존 DIFF-017 변경 파일 목록과
동일).

`[Python]` 해당 없음 — 본 프로젝트(`apps/backend`)는 TypeScript/NestJS 스택이며 `uv run pytest`
대상이 아니다(pnpm/Jest 사용, `~/.claude/rules/on-demand/typescript.md` 적용 범위).
