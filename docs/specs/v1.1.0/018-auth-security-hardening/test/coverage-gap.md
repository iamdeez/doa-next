---
작성: Test Agent (EXECUTION) — [재작업] 5b 재검증
버전: v1.2
최종 수정: 2026-07-04 06:15
상태: 확정
---

# Coverage Gap: 018-auth-security-hardening

## 목차

- [4-카테고리 분류](#4-카테고리-분류)
- [GAP-018-02 와의 관계 (미커버 아님)](#gap-018-02-와의-관계-미커버-아님)

---

## 4-카테고리 분류

5a AUTHORING(`test-cases.md §미커버 항목`)의 사전 분류를 5b 가 재검증하여 그대로 확정한다. 카테고리 (1) 단위테스트 가능 항목은 0건.

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 (개발/운영/QA) | 비고 |
|---|---|---|---|---|---|---|
| (참고) Fly-Client-IP 실 헤더 운영 동작 | `resolveClientIp` 단위 테스트(SC-009)는 mock req 헤더로 우선순위·fallback 로직만 검증. 실 Fly.io 엣지 프록시가 `Fly-Client-IP` 헤더를 문서대로 주입하는지는 운영 배포 이후에만 확인 가능 | (3) 운영 환경에서 확인 권장 | 운영 배포 후 Fly 로그 스트림에서 `rate_limit_exceeded` WARN 필드(`ip`)가 클라이언트별로 정확히 분리되는지 샘플 점검 | Fly.io 운영 로그 | 운영 | spec.md PROC-014 시나리오 1 |
| (참고) 정상 사용자 429 오탐(NAT/CGNAT 공유 IP) | 다수 사용자가 동일 공인 IP 를 공유하는 실 트래픽 패턴은 mock/e2e 로 재현 불가 | (3) 운영 환경에서 확인 권장 | 운영 트래픽에서 NFR-001~006 임계값이 실사용자 경험에 미치는 영향 관찰 | Fly.io 운영 모니터링 | 운영 | spec.md PROC-014 시나리오 2 |
| (참고) 소셜 신규가입 동시성 부하(다수 동시 최초가입) | P2002 폴백 경로(SC-011)는 단일 요청 mock 으로 검증되었으나, 실제 동시 다발 요청 트래픽 패턴에서의 동작은 부하 테스트·운영 관찰 영역 | (3) 운영 환경에서 확인 권장 | 운영 배포 후 실 트래픽 관찰 | Fly.io 운영 모니터링 | 운영 | spec.md PROC-014 시나리오 3 |
| (참고) 보안 감사 로그 노이즈 수준 | WARN 로그 발생 빈도가 실제 침해 시도 신호를 가리는지는 운영 트래픽 볼륨에 의존 | (3) 운영 환경에서 확인 권장 | 운영 배포 후 최소 1주 Fly 로그 스트림 샘플 점검 | Fly.io 운영 로그 | 운영 | spec.md PROC-014 시나리오 4 |
| SC-020(전체 unit 회귀) 자체 | "전체 스위트 회귀 0건"은 개별 테스트 케이스가 아니라 스위트 실행 결과로만 확정 가능한 성격 | (2) 단위테스트 불가(개별 테스트로 환원 불가) | 5b 가 `pnpm --filter backend test` 전체 재실행(GAP-018-02 정정 후)으로 판정 완료 — 결과는 **PASS**(39 suites/397 tests 전건). 하단 §GAP-018-02 와의 관계 참조 | jest | QA(Test Agent) | 5b 재실행 결과: 39 suites/397 tests 전건 PASS (RESOLVED) |

> 카테고리 (1) 0건. 카테고리 (2)(3) 만 존재하는 "미커버(uncovered)" 항목은 위 5행이 전부이며, 5b EXECUTION 판정으로 위임 종료 가능한 성격이다(운영 사후 검증 4건 + SC-020 스위트 성격 1건).

---

## GAP-018-02 와의 관계 (미커버 아님)

SC-017(및 그 결과로서 SC-020)은 위 4-카테고리가 다루는 "단위테스트로 검증 불가능한 미커버 SC"가 **아니다** — SC-017 은 `src/shared/security/security-audit.logger.spec.ts`(3건)·`src/modules/auth/auth.service.spec.ts`(2건 wiring)로 **이미 작성되어 실행된 테스트**이며, 최초 AUTHORING 시점 wiring 2건이 **RED**로 귀결되었다(GAP-018-02). 이는 "작성된 테스트의 실패" 범주이므로 본 문서의 4-카테고리 분류 대상이 아니라 `gaps.md`(GAP-018-02) 및 `test/test-report.md` §GAP-018-02 판정에서 [A]/[B]/[D] 로 원인 분류·라우팅했다. 5b 판정 결과: **[B] 테스트 오류** — production 코드는 plan.md 설계와 일치. 5a [재작업](2026-07-04 06:11)이 `auth.service.spec.ts` SC-017 describe 블록을 plan.md Input 정합 방식(실 `SecurityAuditLogger` 인스턴스 + `PinoLogger.warn` throw mock)으로 재작성했고, 본 5b 재검증(2026-07-04 06:15)에서 39 suites/397 tests 전건 PASS 를 확인 — **RESOLVED**. 상세 근거는 `test/test-report.md` §GAP-018-02 판정 및 정정 재확인 참조.
