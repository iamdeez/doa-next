---
작성: Development Agent
버전: v1.0
최종 수정: 2026-07-05 22:12
상태: 확정
---

# 사전평가 리포트 템플릿: 020-data-migration-cutover

> Branch: 020-data-migration-cutover | Plan: [../../docs/specs/v1.1.0/020-data-migration-cutover/planning/plan.md](../../docs/specs/v1.1.0/020-data-migration-cutover/planning/plan.md) | Mapping: [MAPPING-SPEC.md](MAPPING-SPEC.md) | Runbook: [RUNBOOK.md](RUNBOOK.md)
>
> 본 문서는 **템플릿**이다. 실측값은 옵션 A(사용자 실행)로 주입한다 — 레거시 실 DDL·행 수는 파이프라인에서 접근 불가하다(spec.md "사후 검증 활동 실행 방식"). 컷오버 실행 **전** 아래 표를 실측값으로 채운 뒤, 예상 소요가 NFR-005 안전마진(50분)을 초과하면 §3 게이트에 따라 진행 전 사용자 재확인을 거친다.

## 목차

- [1. 측정 방법](#1-측정-방법)
- [2. 테이블별 행수·예상소요·여유율](#2-테이블별-행수예상소요여유율)
- [3. NFR-005 초과 시 게이트 (FR-012)](#3-nfr-005-초과-시-게이트-fr-012)
- [4. 종합 판정](#4-종합-판정)

---

## 1. 측정 방법

1. **행수 측정**: 각 레거시 테이블에 대해 `SELECT count(*) FROM <legacy_table>;` 를 레거시 DSN 으로 실행한다. `queries/extract/<stg_table>.sql`(extract.sh 가 요구하는 확정 쿼리 파일, [TO-VERIFY] 해소 후 생성됨)의 `FROM` 절을 그대로 재사용하면 실제 추출 대상과 행수 측정 대상의 정합성이 보장된다.
   ```bash
   # 예시 — config.env 로드 후
   psql "$LEGACY_DSN" -t -A -c "SELECT count(*) FROM <legacy_schema>.<legacy_table>;"
   ```
2. **처리량(행/초) 파일럿 측정**: 대표 테이블(예: `products.products`) 1개에 대해 소규모 배치(예: 10,000행)로 `extract.sh`(precopy 모드) → `load.sh` 왕복 시간을 측정하여 초당 처리 행수를 산출한다. 이 값을 아래 표의 "예상소요" 산정 기준으로 사용한다(테이블 특성별로 다를 수 있으므로 스키마 단위 파일럿 권고).
3. **예상소요 산정**: `예상소요(초) = 행수 / 파일럿 처리량(행/초)`. (C)/(C″) 부류(full re-copy)는 윈도우 **내**에 재실행되므로 이 값이 그대로 윈도우 예산을 소비한다. (A)/(A′)/(B) 부류는 사전복사가 대부분을 흡수하므로 델타분(사전복사 이후 변경분)만 계상한다 — 통상 소량.
4. **여유율 산정**: `여유율 = (NFR-005 안전마진 50분 - 누적 예상소요) / 50분 × 100%`. 음수면 안전마진 초과(§3 게이트 적용).

## 2. 테이블별 행수·예상소요·여유율

> 부류 열은 [delta-classes.conf](delta-classes.conf)·[MAPPING-SPEC.md §6](MAPPING-SPEC.md#6-델타-캡처-per-table-최종-분류) 기준. **(C)/(C″) full re-copy 대상**은 윈도우 예산의 최대 변수이므로 소계 행을 별도로 둔다(research.md 승계).

| # | 스키마.테이블 | 부류 | 행수 | 예상소요 | 여유율 |
|---|---|---|---|---|---|
| 1 | users.users | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 2 | users.social_accounts | A | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 3 | users.sellers | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 4 | users.addresses | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 5 | users.wishlists | A | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 6 | users.product_views | B | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 7 | users.notifications | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 8 | products.categories | C″ | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 9 | products.products | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 10 | products.product_images | C″ | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 11 | products.variants | C″ | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 12 | products.inventory | C″ | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 13 | products.inventory_logs | A | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 14 | commerce.carts(+cart_items) | B | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 15 | commerce.coupons | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 16 | commerce.user_coupons | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 17 | commerce.reviews | B | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 18 | orders.orders | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 19 | orders.order_items | A′ | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 20 | orders.order_events | A | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 21 | orders.shipments | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 22 | orders.shipment_tracking | A | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 23 | payments.payments | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 24 | payments.refunds | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 25 | settlements.settlements | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 26 | settlements.settlement_items | A′ | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 27 | admin.banners | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 28 | admin.admin_audit_logs | A | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| 29 | files.files | C | [TO-VERIFY] | [TO-VERIFY] | [TO-VERIFY] |
| **소계** | **(C)/(C″) full re-copy 대상 합계**(#1·3·4·7·9·10·11·12·15·16·18·21·23·24·25·27·29, 8·13·17·19·20·22·26·28·2·5·6 제외) | — | **[TO-VERIFY]** | **[TO-VERIFY]** | **[TO-VERIFY]** |

> 스킵 4종(`refresh_tokens`·`password_reset_otps`·`oauth_states`·`payment_outbox`)은 GAP-020-01 RESOLVED 로 이관 대상이 아니므로 본 표에 포함하지 않는다.

## 3. NFR-005 초과 시 게이트 (FR-012)

위 §2 "소계"(또는 전체 누적 예상소요)가 NFR-005 안전마진(50분)을 초과할 것으로 판단되면, **진행 전 사용자 재확인 필수**다(윈도우 재산정 또는 부분 사전이관 전략 협의 — plan.md PATCH-A06 안전망). 이 체크포인트는 [RUNBOOK.md §단계 4](RUNBOOK.md#단계-4--gonogo-판단)의 GO/NO-GO 판단 절과 연결되며, **컷오버 실행 당일이 아니라 본 사전평가 단계에서 선행 확인**한다.

- 초과 예상 시 완화 옵션(plan.md ASM-001 안전망):
  1. 윈도우 재산정(60분 → 연장 협의).
  2. 부분 사전이관 fallback: (C)/(C″) 대형 테이블을 사전에 스테이징까지 변환해두고, 윈도우 내에는 델타만 재변환(단, 완전한 full re-copy 정확성 보장을 위해 실 절차는 별도 운영 협의 필요).

## 4. 종합 판정

- [ ] 위 §2 표 전 항목 실측 완료.
- [ ] 누적 예상소요가 NFR-005(50분) 이내 — 초과 시 §3 게이트 완료(사용자 재확인 기록: ______________).
- [ ] 리허설(dry-run) 실측치와 본 사전평가 추정치의 편차 확인(±20% 이상 편차 시 재산정 권고).
