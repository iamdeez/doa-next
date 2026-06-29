---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Coverage: 008-settlement-idempotency

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 008 완료 커밋 `e97a142`(base `cf2c3d1`) 기준으로 main session 이 게이트를 직접
> 재실행·코드리뷰하여 확인한 수치다. 신규 단위 테스트 개수는 실제 spec 파일의 `it()` 를 직접 카운트했다.

| 항목 | 본 retroactive 검증 (HEAD `e97a142`) |
|---|---|
| tsc `--noEmit` | **EXIT 0** |
| Unit 테스트 (src/) | **24 suites / 231 PASS** (007 대비 +2) |
| e2e + Static 테스트 (test/) | **16 suites / 84 PASS** (변화 없음 — 신규 e2e/static 없음) |
| 008 신규 단위 테스트 | **2** (settlement.service.spec 멱등성 — `it()` 직접 카운트) |
| 008 회귀 | **0** (005~007 전체 PASS) |
| 마이그레이션 | `settlement_items_orderItemId_key` UNIQUE INDEX 적용(`migrate status` up-to-date, 적용 전 중복 0건) |

> **신규 단위 2 산정 근거(사실 기준)**:
> - `settlement.service.spec.ts` 가 008 에서 멱등성 2 케이스 추가
>   (`when_some_items_already_settled_then_excluded_from_aggregation`,
>   `when_all_items_already_settled_then_zero_and_no_items_created`).
> - 007 baseline 229 + 2 = 231 로 정합. suites 수 무변(기존 settlement.service.spec 확장 — 신규 suite 아님).
> - e2e+static 16/84 는 007 과 동일(008 은 신규 e2e/static 미추가 — DB UNIQUE 는 구조 검증으로 갈음).

### 실행 커맨드

```bash
cd apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 24 suites / 231 PASS
npx jest --config ./test/jest-e2e.json                                         # 16 suites / 84 PASS (변화 없음)
```

---

## SC × 시나리오 커버리지 매트릭스

| SC-ID | 수용 기준 | Happy Path | Edge Case | 상태 |
|---|---|---|---|---|
| SC-001 | 일부 기집계 제외 후 나머지만 집계 | when_some_items_already_settled_then_excluded_from_aggregation | — | PASS |
| SC-002 | 전체 기집계 → 0·createItems skip | — | when_all_items_already_settled_then_zero_and_no_items_created | PASS |
| SC-003 | orderItemId @unique 제약 | schema.prisma `@unique` + migration `settlement_items_orderItemId_key` UNIQUE INDEX | PASS (정적 구조 검증) |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 3 (멱등 단위 2 + 정적 제약 1) |
| PASS (직접 커버) | 3 |
| INDIRECT (간접 커버) | 0 |
| GAP | 0 (단, DB UNIQUE P2002 자동 단언은 방어 심층화 — coverage-gap.md 참조) |

> 모든 SC(SC-001~003)가 직접 커버되었다. SC-003 의 DB UNIQUE 제약은 schema/migration 구조 검증으로
> 판정되며, 동일 항목 중복 insert → P2002 의 자동화 단언 테스트는 없다(방어 심층화 — coverage-gap.md
> 기록). 008 은 신규 GAP 을 남기지 않으며, 005 의 SEC-FIND-005-01 / GAP-005-01 을 RESOLVED 처리한다.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 008 git diff(`git diff cf2c3d1 e97a142 -- apps/backend`) 변경 파일 내 테스트 SC 번호.
`settlement.service.spec.ts` 의 멱등성 테스트는 docstring 시나리오 주석에 `008 SEC-FIND-005-01` 라벨과
행위 기반 `it('when_..._then_...')` 명명을 사용한다(spec.md SC 와의 매핑은 본 coverage.md·test-cases.md
가 담당). semantic mismatch 없음.
