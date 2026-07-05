---
작성: Test Agent (EXECUTION)
버전: v2.0
최종 수정: 2026-07-05 18:05
상태: 확정
---

# Coverage Gap: 019-security-quality-followups

> **재검증 라운드(v2.0)**: PPG-1 fix 후 재실행. v1.0(17:30) 대비 SC-006·SC-010 항목은 unblock 확정되어 본 표에서 제외한다(coverage.md 참조). SC-017 관련 잔존 1건(GAP-019-05, 신규 재분류)만 유지.

## 목차

- [4-카테고리 매트릭스](#4-카테고리-매트릭스)

---

## 4-카테고리 매트릭스

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 (개발/운영/QA) | 비고 |
|---|---|---|---|---|---|---|
| SC-009 | `EXPLAIN` 결과가 현재 데이터 규모(products 9건·sellers 1건)에서 Seq Scan 으로 나타남(planner 비용 기반 선택) — 인덱스 자체는 `SET enable_seqscan=off` 강제 시 정상 Index Scan 확인됨(v1.0 과 동일, 변화 없음) | (3) 운영 환경에서 확인 권장 | 운영 데이터 규모 증가 후(수천~수만 행) 동일 `EXPLAIN` 재실행하여 자연 상태에서 Index Scan 전환 확인 | 운영/스테이징 PostgreSQL, `EXPLAIN ANALYZE` | 운영 | spec.md 배경(GAP-017-03)에 이미 예견된 특성. 인덱스 미작동이 아니라 데이터 볼륨 제약 |
| SC-017 | `test/auth.e2e-spec.ts::SC-027`(로그인 50회 순차 P95) + `test/auth-recovery.e2e-spec.ts::SC-017`(forgot-password quota 소진)이 018 rate-limit(NFR-001·003)과 구조적으로 충돌 — production 정상, 019 비원인, T016/T017 무관(GAP-019-05) | (4) 차후 점검 | 별도 후속 spec 에서 테스트 하네스 재설계: (a) 테스트별 `ThrottlerStorage` mock/override 또는 리셋 훅 도입, (b) SC-027 요청 수를 quota(20) 이하로 재설계하거나 시간 창 확장, (c) auth-recovery 파일의 forgot-password 호출을 quota(5) 이내로 재구성(SC-020 429 유발 테스트와 SC-017 검증을 별도 파일/블록으로 분리) | 로컬 e2e(Jest), `@nestjs/throttler` ThrottlerStorage | 개발(테스트 하네스, 후속 spec) | GAP-019-05(신규) — gaps.md 참조. `@SkipThrottle()` 부여는 로그인/비밀번호 재설정 rate limit 제거를 의미하므로 production 수정 대상 아님(보안 원칙 위반) |

> **SC-006·SC-010 는 본 라운드로 unblock 확정**(coverage.md 참조) — 4-카테고리 표에서 제외. **카테고리 (1) 단위테스트 가능 항목은 0건**(Development Agent 복귀 불요). 카테고리 (3)(SC-009)·(4)(SC-017 잔존분) 만 존재하며 둘 다 본 spec 완료를 단독으로 차단하지 않는 것으로 권고하되, spec.md SC-017 의 "전체 스위트 100% PASS" 문면 자체는 미충족 상태임을 main session/사용자에게 명시한다.
