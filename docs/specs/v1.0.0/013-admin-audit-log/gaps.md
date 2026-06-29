---
작성: Design Agent → Security Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Gaps — 013-admin-audit-log

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [신규 GAP](#신규-gap)
  - [GAP-013-01](#gap-013-01)
  - [GAP-013-02](#gap-013-02)
  - [GAP-013-03](#gap-013-03)
- [해결한 선행 설계 공백](#해결한-선행-설계-공백)

---

## 신규 GAP

### GAP-013-01

- **출처**: Design Agent / Security Agent (OBS-013-02) / Test Agent (coverage-gap)
- **유형**: 감사 범위 부분 적용 (Low — 권고) — 감사 대상 판매자 승인 1종 한정
- **컨텍스트**: `admin.service.ts` `approveSeller`(감사 기록 경로), `admin.constants.ts` `AUDIT_ACTION`
  (`SELLER_APPROVE` 1종)·`AUDIT_TARGET`(`SELLER` 1종)
- **내용**: 013 의 감사 기록은 관리자 판매자 승인(`SELLER_APPROVE`) 1경로뿐이다. banner CRUD(생성·수정·
  삭제)·기타 관리자 mutation 은 아직 감사되지 않아 audit trail 이 부분 적용이다. `action`·`targetType` 을
  String 으로 둔 것은 향후 확장을 마이그레이션 없이 수용하기 위함이나, 현재 기록 경로는 1종이다.
- **수정 방향**: 후속 spec 에서 (a) 각 도메인 mutation 에서 `AdminService.recordAudit(...)` 직접 호출,
  또는 (b) 도메인 이벤트(`banner.deleted` 등) 구독 핸들러(009 NotificationEventsHandler 동형)에서 감사
  기록 + 기록 테스트 추가. 상수(`AUDIT_ACTION`·`AUDIT_TARGET`)에 새 값 추가로 확장(DB 마이그레이션 불필요).
- **영향**: 낮음 — 007 GAP-007-01 의 대표 조치(판매자 승인)는 감사되어 부분 해결. 미감사 조치도 각자
  JwtAuthGuard+AdminGuard 로 보호되어 인가 표면은 동일(거버넌스 추적 공백만 잔존).
- **상태**: OPEN — 감사 대상 확장은 후속 spec 위임(Low 권고). security-report.md OBS-013-02 와 동일 사안.

### GAP-013-02

- **출처**: Design Agent / Security Agent (OBS-013-01) / Test Agent (coverage-gap)
- **유형**: 기록 격리/원자성 부재 (Low — 권고) — 감사 기록 실패 시 예외 전파
- **컨텍스트**: `admin.service.ts` `approveSeller`(`sellerService.approve` → `createAuditLog` 순차 await,
  try/catch·`$transaction` 미적용)
- **내용**: `approveSeller` 는 승인 성공 후 감사를 append 하므로 기록 실패가 이미 커밋된 승인을 롤백하지
  않는다(기록 순서). 그러나 try/catch 가 없어 `createAuditLog` 가 throw 하면 그 예외가 호출 측(controller
  →500)으로 전파된다. 승인은 성공했으나 요청은 오류로 표면화되는 경계가 존재한다(트랜잭션 원자성 아님 —
  의도적 단순화).
- **수정 방향**: 후속에 (a) try/catch 로 감사 실패를 흡수(로깅 후 승인 성공 반환 — 009 safeNotify 동형),
  또는 (b) 단일 `$transaction` 으로 승인+감사 원자화(감사 실패 시 승인도 롤백). "감사 실패 시 승인 유지
  vs 요청 실패" 정책 결정 후 실패 시나리오 단위 테스트 추가.
- **영향**: 낮음 — 정상 경로(감사 INSERT 성공)에서는 무영향. 감사 INSERT 실패는 드물다(append-only 단일
  테이블 INSERT). 보안 노출은 없다.
- **상태**: OPEN — 격리/트랜잭션 정책은 후속 spec 위임(Low 권고). security-report.md OBS-013-01 과 동일 사안.

### GAP-013-03

- **출처**: Test Agent (coverage-gap) / Security Agent (일반 권고)
- **유형**: 테스트 토폴로지 한계 (Low — 권고) — 감사 조회 HTTP e2e 부재
- **컨텍스트**: `admin.controller.ts` `GET /admin/audit-logs`(컨트롤러 레벨 JwtAuthGuard+AdminGuard),
  `test/` e2e 스위트
- **내용**: `GET /admin/audit-logs` 의 관리자 200·비인증 401·비관리자 403 을 HTTP end-to-end 로 검증하는
  통합 테스트가 없다. 가드는 정적 코드 검증(SC-003)으로, 기록·클램프는 단위(SC-001·002)로 확인하나 HTTP
  응답 직접 단언이 부재하다. 007 의 `banner-admin.e2e-spec.ts` 가 관리자 가드(401/403)를 e2e 로 검증했으나
  `audit-logs` 라우트는 013 추가분이라 포함되지 않았다.
- **수정 방향**: `audit-logs` 라우트를 관리자(200)·비인증(401)·비관리자(403) 시나리오로 검증하는 e2e 추가.
- **영향**: 낮음 — 가드가 컨트롤러 레벨(007 검증된 `AdminController`)에 적용되어 새 라우트가 동일 가드에
  자동 포섭되므로(라우트별 가드 누락 표면 없음) 정적 확인으로 충분. 기록·클램프는 단위로 직접 보장.
- **상태**: OPEN — HTTP e2e 보강은 후속 spec 위임(Low 권고). coverage-gap.md 와 동일 사안.

---

## 해결한 선행 설계 공백

| 식별자 | 선행 spec | 등급 | 013 해결 | 상태 |
|---|---|---|---|---|
| GAP-007-01 | 007-banner-stats-admin | Low | `admin_audit_logs`(append-only) 테이블 추가 + `AdminRepository` 빈 클래스 → 실 repository(create·list) + 판매자 승인 시 감사 기록(`approveSeller(adminUserId, sellerId)` 시그니처 변경) + `GET /admin/audit-logs`(AdminGuard) 조회. **부분 해결** — 감사 대상 = 판매자 승인(`SELLER_APPROVE`) 1종 | **RESOLVED (013, 커밋 b8b45aa) — 범위: 판매자 승인 감사 1종** |

> 007-banner-stats-admin/gaps.md 의 GAP-007-01 상태가 본 spec 으로 RESOLVED(013, 판매자 승인 감사 1종
> 한정)로 갱신되며, test/coverage-gap.md 의 해당 항목에 "013 에서 부분 해결(승인 감사)" 주석이 추가된다.
> banner CRUD·기타 관리자 mutation 의 감사는 GAP-013-01 로 후속 확장에 위임한다.
