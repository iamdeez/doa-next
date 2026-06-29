---
작성: Security Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# 보안 감사 결과 — 008-settlement-idempotency

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [SEC-FIND-005-01 해결 검증](#sec-find-005-01-해결-검증)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [NFR 보안 요구사항 이행 현황](#nfr-보안-요구사항-이행-현황)
- [OWASP Top 10 점검 결과](#owasp-top-10-점검-결과)
- [긍정 확인 사항](#긍정-확인-사항)
- [권고사항](#권고사항)

---

## 검토 범위

### 검토 대상 파일 (DIFF-008-settlement-idempotency.md 기반)

| 파일 | 검토 이유 |
|---|---|
| `settlement/settlement.service.ts` | 정산 멱등성(기집계 제외 필터)·금전 재계산(Decimal)·중복 지급액 차단 |
| `settlement/settlement.repository.ts` | `findSettledOrderItemIds` — settlement_items 자기 테이블 조회(P-001) |
| `prisma/schema.prisma` | `SettlementItem.orderItemId @unique` 무결성 제약 |
| `prisma/migrations/20260629183631_008.../migration.sql` | UNIQUE INDEX 생성 |
| `settlement/settlement.service.spec.ts` | 멱등성 단위 테스트(SC-001·002) |

### 제외 파일 및 사유

- order 모듈 — 008 변경 없음(005 `getCompletedItemsForSettlement` 재사용, 검토 대상 외)

---

## 요약

| 항목 | 내용 |
|---|---|
| 검토 대상 파일 수 | 5개 |
| Critical 건수 | 0 |
| High 건수 | 0 |
| Medium 건수 | 0 |
| Low 건수 | 0 |
| 전체 취약점 건수 | 0 |
| 판정 | **COMPLETE** — Critical/High/Medium/Low 0건. 본 spec 의 목적인 SEC-FIND-005-01(005, Medium) 을 RESOLVED 로 검증 확정 |

---

## SEC-FIND-005-01 해결 검증

> 005-shipping-settlement 의 Medium 발견 — 정산 멱등성 미보장(중복 지급액 산정 가능). 008 이 해결 대상.

| 검증 항목 | 005 상태 (취약) | 008 해결 (코드 근거) | 판정 |
|---|---|---|---|
| (1) 기집계 항목 제외 | `getCompletedItemsForSettlement` 가 기간 내 전체 completed 항목 반환(제외 없음) | `createSettlement` 가 `findSettledOrderItemIds(후보 orderItemId)` 로 기집계 id 를 조회해 `Set` 으로 제외(`candidates.filter(c => !settledIds.has(c.orderItemId))`) 후 금액 재계산 | RESOLVED |
| (2) DB 무결성 제약 | `SettlementItem.orderItemId` UNIQUE 제약 없음 | `orderItemId @unique` → `settlement_items_orderItemId_key` UNIQUE INDEX. 동일 항목 두 번째 insert P2002 차단 | RESOLVED |
| (3) 중복정산 거부 테스트 | production 로직·테스트 모두 부재 | 멱등성 단위 테스트 2건 — 일부 기집계 제외(SC-001), 전체 기집계 시 금액 0·createItems skip(SC-002) | RESOLVED |
| 금전 정합성(P-005) | 부분 이행(멱등성 공백) | 기집계 제외 후 `Prisma.Decimal` 재계산(`totalSales`·`commission` ROUND_HALF_UP·`payoutAmount`). 중복 지급액 0 보장 | 완전 이행 |

**판정**: SEC-FIND-005-01 → **RESOLVED (008, 커밋 e97a142)**. 애플리케이션 멱등 필터(1차) +
DB UNIQUE 제약(2차) + 단위 테스트(검증)의 3중 방어로 완전 해결. 005 security-report.md / gaps.md
GAP-005-01 의 상태가 RESOLVED 로 갱신된다.

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-001 (모듈 경계 원칙) | 이행 | `findSettledOrderItemIds` 가 settlement_items 자기 소유 테이블만 조회. orders 후보는 OrderService DI. cross-schema plain String |
| P-002 (외부 의존 추상화) | 이행 | 신규 npm 의존 0. AWS SDK 0 |
| P-005 (결제·정산 정합성) | 이행 (완전) | 멱등성 보장(기집계 제외 + `@unique`). 금전 재계산 Prisma.Decimal. 005 의 부분이행을 완전이행으로 승격 |

---

## NFR 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-001 | 기집계 판정 자기 테이블 조회(P-001) | 이행 | `findSettledOrderItemIds` settlement_items 만. order 후보 DI |
| NFR-002 | 금액 재계산 Decimal(P-005) | 이행 | totalSales·commission·payoutAmount 전부 Prisma.Decimal |
| NFR-003 | additive 호환성(005 회귀 0) | 이행 | createSettlement 시그니처 불변, 005 정산 테스트 전체 PASS |

---

## OWASP Top 10 점검 결과

| OWASP | 항목 | 점검 결과 | 근거 |
|---|---|---|---|
| A01 | 접근 제어 취약점 | 양호 | 정산 라우트 인가는 005 그대로(변경 없음). 008 은 인가 표면 무변 |
| A03 | 인젝션 | 양호 | Prisma 파라미터화(`findMany IN`). raw SQL 미사용 |
| A04 | 안전하지 않은 설계 | **해결** | 005 의 멱등성/무결성 공백(SEC-FIND-005-01)을 기집계 제외 + `@unique` + 테스트로 해소 |
| A05 | 보안 설정 오류 | 양호 | DB UNIQUE 제약(`settlement_items_orderItemId_key`)으로 무결성 강화 |
| A08 | 소프트웨어 무결성 | 양호 | 금전 재계산 Decimal·중복 지급액 차단. 외부 코드 주입 없음 |

---

## 긍정 확인 사항

| 항목 | 확인 내용 |
|---|---|
| **멱등성 3중 방어** | 애플리케이션 필터(`findSettledOrderItemIds` → filter, 1차) + DB UNIQUE(`orderItemId @unique`, 2차) + 단위 테스트(검증). 동일 주문항목의 중복 정산 집계가 정상 경로·경합 양쪽에서 차단됨 |
| **P-001 경계 유지** | 기집계 판정이 settlement 자기 테이블(`settlement_items`)만 조회. order 후보는 DI read-only — cross-schema 직접 결합 회피 |
| **금전 정합성(P-005)** | 기집계 제외 후 totalSales·commission(ROUND_HALF_UP)·payoutAmount 전부 Prisma.Decimal. 중복 지급액 0 |
| **비파괴 마이그레이션** | 기존 테이블에 UNIQUE 제약만 추가. 적용 전 중복 0건 확인 후 `migrate deploy`. 행 데이터 영향 없음 |

---

## 권고사항

### 일반 권고 (Informational)

- **DB UNIQUE P2002 통합 테스트 보강(방어 심층화)**: 동시 재정산 경합 시 두 번째 insert 가 P2002 로
  거부되고 정산 트랜잭션이 롤백됨을 검증하는 통합 테스트(실 PostgreSQL + 동시 호출) 후속 보강 권장.
  현재 1차 방어(애플리케이션 필터)는 단위 테스트로, 2차 방어(`@unique`)는 구조 검증으로 커버되어
  실질 위험은 낮다(coverage-gap.md).
- **실 이체 멱등성**: 산정된 `payoutAmount` 의 실제 이체 연동 시 결제·환불과 동일한 멱등성 키·outbox
  패턴(P-005) 적용 권고(005 범위 외 항목 승계 — 본 spec 범위 외).
