---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# Coverage: 012-settlement-completed-at

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 012 완료 커밋 `35791d6`(base `3735377`) 기준으로 main session 이 게이트를 직접
> 재실행·코드리뷰하여 확인한 수치다. 신규 단위 테스트는 0건(기존 단언 갱신만)이며, unit 합계는 011 과
> 동일한 253 으로 유지된다.

| 항목 | 본 retroactive 검증 (HEAD `35791d6`) |
|---|---|
| tsc `--noEmit` | **EXIT 0** |
| Unit 테스트 (src/) | **25 suites / 253 PASS** (011 대비 변화 없음 — 신규 단위 추가 없음, 단언만 갱신) |
| e2e + Static 테스트 (test/) | **16 suites / 84 PASS** (재실행 84 PASS 확인) |
| 012 신규 단위 테스트 | **0** (`order.service.spec` 의 complete·autoConfirm 단언만 completedAt 포함하도록 갱신) |
| 012 회귀 | **0** (005~011 전체 PASS — 갱신된 단언도 PASS) |
| 마이그레이션 | **012** (`ADD COLUMN "completedAt" TIMESTAMP(3)` — 비파괴 nullable, migrate dev 적용) |

> **신규 단위 0 산정 근거(사실 기준)**:
> - `order.service.spec.ts` 의 011→012 diff(`git diff 3735377 35791d6 -- ...order.service.spec.ts`)는
>   `it()` 추가가 아니라 기존 `complete` 테스트의 `updateStatus` 단언 1건 갱신(+`{ completedAt:
>   expect.any(Date) }`) + 기존 `autoConfirmDelivered` 테스트에 `updateStatus(..., { completedAt: now })`
>   단언 1건 추가다(+12 -1). 새 `describe`/`it` 블록 없음 → suite·테스트 개수 불변.
> - 011 baseline 253 = 012 253(변화 없음). e2e+static 16/84 동일.

### P95 e2e 콜드스타트 플레이키 관측

- 게이트 재실행 중 e2e 1회에서 P95 관련 콜드스타트 플레이키(첫 실행 지연)가 관측되었으나, **재실행 시
  84 PASS** 로 정상 통과를 확인했다. 012 변경(`completedAt` 컬럼·필터 기준 전환)과 인과 관계 없는
  환경적 콜드스타트이며, 회귀가 아니다.

### 실행 커맨드

```bash
cd apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 25 suites / 253 PASS
npx jest --config ./test/jest-e2e.json                                         # 16 suites / 84 PASS (재실행)
```

---

## SC × 시나리오 커버리지 매트릭스

| SC-ID | 수용 기준 | 케이스 | 상태 |
|---|---|---|---|
| SC-001 | complete 시 completedAt 기록 | order.service.spec.ts::complete (갱신) | PASS |
| SC-002 | autoConfirm 시 completedAt=now 기록 | order.service.spec.ts::autoConfirmDelivered (갱신) | PASS |
| SC-003 | 정산 필터 completedAt 기준 | (정적) findCompletedItemsBySellerInPeriod where | VERIFIED(static) |
| SC-004 | completedAt 컬럼·extra 타입 | (정적) schema·migration·updateStatus extra | VERIFIED(static) |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 4 (complete 1 + autoConfirm 1 + 필터 전환 1 + 스키마 1) |
| PASS (단위 직접 커버) | 2 (SC-001·002) |
| VERIFIED (정적 검증) | 2 (SC-003·004 — 코드/스키마 리뷰) |
| GAP | 0 (단, 정산 필터 전환 직접 통합 테스트 부재는 coverage-gap.md·GAP-012-01 참조) |

> SC-001·002 는 단위 테스트(갱신된 단언)로 직접 PASS, SC-003·004 는 정적 코드/스키마 검증으로 확인.
> 정산 집계 필터 전환의 직접 자동 단언은 부재하며(settlement.service.spec 이 OrderService mock),
> order.service.spec 의 completedAt 기록 단언으로 간접 커버한다(GAP-012-01, Low — 실 DB 통합 테스트
> 후속 권고). 012 는 005 의 GAP-005-02 를 RESOLVED 처리한다.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 012 git diff(`git diff 3735377 35791d6 -- apps/backend`) 변경 파일 내 테스트 SC 번호.
`order.service.spec.ts` 의 갱신된 단언은 주석 `// 012 GAP-005-02: ...` 라벨과 기존 행위 기반 테스트
명을 유지한다(spec.md SC 와의 매핑은 본 coverage.md·test-cases.md 가 담당). semantic mismatch 없음.
