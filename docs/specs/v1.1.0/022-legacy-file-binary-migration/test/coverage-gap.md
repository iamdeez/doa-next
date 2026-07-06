---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-06 14:55
상태: 확정
---

# Coverage Gap: 022-legacy-file-binary-migration

## 목차

- [4-카테고리 분류](#4-카테고리-분류)
- [카테고리 (1) 없음 확인](#카테고리-1-없음-확인)

---

## 4-카테고리 분류

> 5a AUTHORING(test-cases.md "미커버 항목" 절)의 사전 분류를 재검증하여 그대로 확정한다. 실 레거시 AWS S3 접속이 필요한 전 SC 는 (2) 단위테스트 불가에 해당하나, 실제 이관 실행 주체가 사용자(운영자)이므로 (3) 운영 환경에서 확인 권장으로 최종 분류한다(test-cases.md §옵션 A 실행 계약이 검증 방법·환경·담당을 대체 기술).

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 (개발/운영/QA) | 비고 |
|---|---|---|---|---|---|---|
| SC-001 | `status=UPLOADED` 전건 R2 존재·`status=PENDING` 제외 실측 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 1 | 레거시 S3 + R2 + Fly Postgres | 운영 | precopy→verify→개수/PENDING 표본 대조 |
| SC-002 | 사전복사 100% 이관 대조 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 2 | 상동 | 운영 | 잔존 실패는 SC-007(정적, PASS)로 별도 게이트 |
| SC-003 | 윈도우 내 델타만 추가 전송 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 3 | 상동 | 운영 | rclone 멱등 skip 특성 실측 필요 |
| SC-004 | key/url 일치 실측 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 4 | 상동 | 운영 | 정적 갈음(SQL 결정적 함수 형태) 확인 완료 — 코드 리뷰로 부분 커버 |
| SC-005 | 개수·샘플 체크섬 일치 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 5 | 상동 | 운영 | 멀티파트 ETag fallback 포함 |
| SC-006 | 개별 실패 주입·재시도 실측 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 6 | 상동 | 운영 | 정적 갈음(`--retries`·실패목록 캡처 경로) 확인 완료 — 코드 리뷰로 부분 커버 |
| SC-011 | 델타 소요 ≤60분 실측 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 7 | 리허설/실행 로그 | 운영 | 020 컷오버 윈도우와 공유 |
| SC-013 | 컷오버 개시 개수 대조 불일치 0 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 8 | 레거시 S3 + R2 + Fly Postgres | 운영 | GO/NO-GO 게이트 |
| SC-015 | 이관 로그 감사 저장 확인 | (3) 운영 환경 권장 | test-cases.md §옵션 A 실행 계약 9 | 상동 | 운영 | 정적 갈음(`verification_runs` 경로) 확인 완료 — 코드 리뷰로 부분 커버 |
| — | GAP-022-01 — `postgres:16-alpine` 러너 이미지 alpine community 레포 rclone 가용성 | (4) 차후 점검(RESOLVED) | `docker build` 1회 실행 + `rclone version` 확인 | Docker | Development | Development Agent 가 실증 완료(gaps.md RESOLVED, `rclone v1.74.1-DEV`). 재확인 불요 |
| — | GAP-022-02 — 020 감사 부채(SEC-020-01/02) 파일 이관 맥락 재평가 | (4) 차후 점검 | Security Agent 재평가(selection-phases.md) | — | Security | 5b 범위 밖(비블로킹) — Security Agent 진행 대기 |

> 카테고리 (1) 단위테스트 가능 항목: **0건**. 정적 검증 6건 SC(SC-007·008·009·010·012·014)는 이미 jest 테스트로 작성 완료되었고 본 5b 실행에서 전건 PASS 확인됨(test-report.md 참조). 따라서 Development Agent 복귀 요청 없이 위 (3)(4) 항목만으로 본 문서를 작성했다.

---

## 카테고리 (1) 없음 확인

5b 자체 재검증 결과 (1) 단위테스트 가능 미작성 SC 는 0건이다 — 정적 SC 6건은 test-cases.md AUTHORING 시점에 이미 전건 테스트 함수로 작성되었고(TDD Red), 4단계 Development 완료 후 본 5b 재실행에서 18/18 PASS(Green 전환)를 확인했다(test-report.md §실행 요약). 따라서 본 문서는 Development Agent 복귀 요청 없이 (3)·(4) 항목만으로 확정하며, 5b 는 gate: PASS 로 보고한다.
