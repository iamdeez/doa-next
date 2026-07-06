---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-06 02:51
상태: 확정
---

# Coverage Gap: 021-payment-file-integration

## 목차

- [4-카테고리 매트릭스](#4-카테고리-매트릭스)

---

## 4-카테고리 매트릭스

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 (개발/운영/QA) | 비고 |
|---|---|---|---|---|---|---|
| SC-001 | sandbox 신용카드 동기 승인 | (3) 운영 환경(sandbox) 확인 권장 | test-cases.md §SC-001~003 방식A(HTTP API, `POST /payments`+authToken) 또는 방식B(게이트웨이 직접호출) | 이니시스 sandbox 크레덴셜 | 사용자/QA | GAP-021-02 완전해소로 방식A(실 API 경로) 신규 가능 |
| SC-002 | sandbox 실시간 계좌이체 승인 | (3) 운영 환경(sandbox) 확인 권장 | 상동 | 상동 | 사용자/QA | 상동 |
| SC-003 | sandbox 간편결제 승인 | (3) 운영 환경(sandbox) 확인 권장 | 상동 | 상동 | 사용자/QA | 상동 |
| SC-004 | sandbox 전액 환불 | (3) 운영 환경(sandbox) 확인 권장 | test-cases.md §SC-004(DB 경유 또는 게이트웨이 직접호출) | 이니시스 sandbox 크레덴셜 | 사용자/QA | - |
| SC-010 | R2 실 버킷 PUT 업로드 | (3) 운영 환경(R2 실 버킷) 확인 권장 | test-cases.md §SC-010/011 | Cloudflare R2 계정·버킷 | 사용자/QA | - |
| SC-011 | R2 public URL(r2.dev) GET 접근 | (3) 운영 환경(R2 실 버킷) 확인 권장 | test-cases.md §SC-010/011 | 상동 | 사용자/QA | - |
| SC-013 | 실 이니시스 외부 지연 포함 P95 ≤2000ms | (3) 운영 환경(sandbox) 확인 권장 | test-cases.md §SC-013 | 이니시스 sandbox 크레덴셜 | 사용자/QA | stub 기준 자동 회귀는 `payments.e2e-spec.ts`(SC-046)로 이미 커버(PASS). Should 등급 — 초과 시 ASM-004(외부 지연, 통제 불가)로 기록, 즉시 FAIL 처리 안 함 |
| GAP-021-02 잔존(경미) | `authUrl`(결제창 동적 승인 URL)이 `POST /payments` DTO 에 여전히 미노출 | (4) 차후 점검 | 결제창이 동적 URL 흐름을 요구하는 것으로 확정되면 DTO 확장 검토 | — | 사용자 확정 후 Development | authToken 배선은 완전 해소(RESOLVED). authUrl 은 [TO-VERIFY](research.md §4-1), 비차단 |
| (참고) pino-redact 병렬 실행 이슈 | 4개 e2e 스위트 동시 실행 시 `pino-redact.e2e-spec.ts` SC-014/015 간헐 FAIL(단독 실행 시 PASS) | (4) 차후 점검 | e2e jest 워커 병렬도·로그 캡처 타이밍 재설계 검토 | jest-e2e 설정 | QA/Retrospective | 021 무관(git diff 0, 021 SC 아님) — 021 책임 범위 밖이나 향후 e2e 인프라 안정성 관점에서 기록 |

> 카테고리 (1)(단위테스트 가능 미작성) 0건. 카테고리 (3)(4) 만 존재하므로 6단계(Docs) 진행 가능.
> 실 이니시스 sandbox·R2 크레덴셜 준비 절차는 test-cases.md "사전 준비(공통)" 표 참조 — main
> session 이 사용자에게 안내한다.
