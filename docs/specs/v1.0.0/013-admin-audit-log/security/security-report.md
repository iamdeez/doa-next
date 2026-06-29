---
작성: Security Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# 보안 감사 결과 — 013-admin-audit-log

## 목차

- [검토 범위](#검토-범위)
- [요약](#요약)
- [Constitution 보안 조항 이행 현황](#constitution-보안-조항-이행-현황)
- [관찰 목록](#관찰-목록)
- [NFR 보안 요구사항 이행 현황](#nfr-보안-요구사항-이행-현황)
- [OWASP Top 10 점검 결과](#owasp-top-10-점검-결과)
- [긍정 확인 사항](#긍정-확인-사항)
- [권고사항](#권고사항)

---

## 검토 범위

### 검토 대상 파일 (DIFF-013-admin-audit-log.md 기반)

| 파일 | 검토 이유 |
|---|---|
| `prisma/schema.prisma` | `AdminAuditLog` 모델 — append-only 설계·FK 미선언(P-001)·민감/금전 필드 부재 |
| `prisma/migrations/20260629121613_013_admin_audit_log/migration.sql` | 신규 테이블·인덱스 — 비파괴·UNIQUE/FK 제약 적정성 |
| `admin/admin.repository.ts` | admin 스키마 자기 소유 접근(P-001)·append-only(UPDATE/DELETE 미제공) |
| `admin/admin.service.ts` | approveSeller 감사 기록 시점·adminId 출처·기록 실패 전파 경계 |
| `admin/admin.controller.ts` | `GET /admin/audit-logs` 인가(JwtAuthGuard+AdminGuard)·adminId 서버 확정 |
| `admin/admin.constants.ts` | 감사 상수(action·target·limit 클램프) — 입력 검증 표면 |
| `test/static/cross-schema.spec.ts` | AdminRepository 모듈 경계(P-001) 정적 검증 |

### 제외 파일 및 사유

- `admin/admin.service.spec.ts` — 단위 테스트 코드(보안 로직 없음, 감사 동작 단언)
- `seller/*`·`user/*` — 013 미변경(approveSeller 가 재사용하는 `SellerService.approve` 시그니처 불변)

---

## 요약

| 항목 | 내용 |
|---|---|
| 검토 대상 파일 수 | 7개 |
| Critical 건수 | 0 |
| High 건수 | 0 |
| Medium 건수 | 0 |
| Low 건수 | 2 (OBS-013-01 감사 기록 실패 격리 부재, OBS-013-02 감사 대상 1종 한정 — 설계 관찰) |
| 전체 취약점 건수 | 0 (취약점), 2 (Low 설계 관찰) |
| 판정 | **COMPLETE** — Critical/High/Medium 0건. 책임 추적(audit trail) 도입은 007 A09 권고를 해소하는 보안 *개선*이며, Low 2건은 권고사항으로 기록 |

---

## Constitution 보안 조항 이행 현황

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-001 (모듈 경계 원칙) | 이행 (강화) | `AdminRepository` 가 admin 스키마 자기 소유 테이블(`admin_audit_logs`)만 접근. 타 도메인은 Seller/User Service DI 경유(직접 쿼리 0). cross-schema 정적 검증(AdminRepository 규칙 — 타 스키마 모델 forbidden) PASS |
| P-002 (외부 의존 추상화) | 이행 | 신규 npm 의존 0. AWS SDK·외부 서비스 0 |
| P-005 (결제·정산 정합성) | 이행 (무관) | `admin_audit_logs` 는 금전 필드 없음(메타 기록). 정산·금액 로직 변경 0 |

---

## 관찰 목록

### OBS-013-01 — Low (설계 관찰, 취약점 아님)

| 항목 | 내용 |
|---|---|
| **OBS-ID** | OBS-013-01 |
| **심각도** | Low (설계 관찰) |
| **OWASP** | A09 (로깅·모니터링 — 감사 기록 신뢰성, 권한 상승 아님) |
| **위치** | `apps/backend/src/modules/admin/admin.service.ts` `approveSeller` |
| **설명** | `approveSeller` 가 `sellerService.approve(sellerId)` → `adminRepository.createAuditLog(...)` 를 순차 await 하며 단일 `$transaction`·try/catch 로 감싸지 않는다. 승인 성공 후 감사 append 라 기록 실패가 승인을 롤백하지는 않으나, try/catch 가 없어 `createAuditLog` 실패 시 예외가 호출 측(controller→500)으로 전파된다(원자성 아님). |
| **공격 경로** | 없음(권한 상승 표면 아님). 정상 경로(감사 INSERT 성공)에서는 무영향. 감사 INSERT 실패는 드문 내부 오류(append-only 단일 테이블) |
| **공격자 요건** | 해당 없음 — 외부 공격 표면이 아니라 내부 오류 처리 정책 관찰 |
| **실질 위험** | 낮음 — "감사 실패 시 승인을 유지/요청 실패" 는 정책 결정. 보안 노출은 없으며 감사 누락 가능성(기록 실패 시) 관찰 |
| **수정 방향** | try/catch 로 감사 실패 흡수(로깅 후 승인 반환 — 009 safeNotify 동형) 또는 단일 `$transaction` 원자화. 후속 정책 spec 결정 |
| **상태** | OPEN (gaps.md GAP-013-02 교차 기재, 후속 위임) |

### OBS-013-02 — Low (설계 관찰, 취약점 아님)

| 항목 | 내용 |
|---|---|
| **OBS-ID** | OBS-013-02 |
| **심각도** | Low (설계 관찰) |
| **OWASP** | A09 (로깅·모니터링 — 감사 범위 부분 적용) |
| **위치** | `apps/backend/src/modules/admin/admin.service.ts`(감사 기록 경로), `admin.constants.ts`(`AUDIT_ACTION`) |
| **설명** | 감사 대상이 판매자 승인(`SELLER_APPROVE`) 1종이다. banner CRUD·기타 관리자 mutation 은 아직 감사되지 않아 audit trail 이 부분 적용이다. |
| **공격 경로** | 없음. 감사 미적용 조치도 각자 JwtAuthGuard+AdminGuard 로 보호됨(인가 표면 동일) |
| **공격자 요건** | 해당 없음 |
| **실질 위험** | 낮음 — 007 GAP 의 대표 조치(승인)는 감사됨. 미감사 조치의 책임 추적 공백은 잔존(거버넌스 부분 해결) |
| **수정 방향** | 각 도메인 mutation 에서 `AdminService.recordAudit` 호출 또는 도메인 이벤트 구독으로 감사 대상 확장(`action`·`targetType` String 으로 마이그레이션 불필요) |
| **상태** | OPEN (gaps.md GAP-013-01 교차 기재, 후속 확장 위임) |

---

## NFR 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-001 | Repository cross-schema 접근 금지(P-001) | 이행 | `AdminRepository` 가 admin 스키마(`admin_audit_logs`)만 접근. 타 스키마 모델 직접 참조 0. cross-schema 정적 PASS |
| NFR-002 | 책임 추적·append-only 위변조 방지 | 이행 | 감사 로그 append-only(`AdminRepository` create·findMany 만, UPDATE/DELETE 미제공). adminId 와 함께 기록 |
| NFR-003 | 인증·인가(JwtAuthGuard+AdminGuard)·adminId 서버 확정 | 이행 | `GET /admin/audit-logs` 컨트롤러 가드 포섭(fail-closed). `adminId` = `@CurrentUser().userId`(클라이언트 입력 아님) |
| NFR-004 | 비파괴 마이그레이션·확장성 | 이행 | 신규 테이블 추가(비파괴). action·targetType String(enum 아님) — 확장 마이그레이션 불필요 |
| NFR-005 | 외부 의존 무 | 이행 | 신규 npm 0. AWS SDK 0 |

---

## OWASP Top 10 점검 결과

| OWASP | 항목 | 점검 결과 | 근거 |
|---|---|---|---|
| A01 | 접근 제어 취약점 | 양호 | `GET /admin/audit-logs` 가 `AdminController` 컨트롤러 레벨 JwtAuthGuard+AdminGuard(fail-closed)에 포섭 — 비인증 401·비관리자 403. 라우트별 가드 누락 표면 없음 |
| A02 | 암호화 실패 | 해당 없음 | 암호화 신규 로직 없음. 감사 로그에 비밀번호·토큰 등 민감 필드 미저장 |
| A03 | 인젝션 | 양호 | Prisma 파라미터화 쿼리만(`adminAuditLog.create`·`findMany`). raw SQL 미사용. action·targetType 은 서버 상수값 |
| A04 | 안전하지 않은 설계 | 양호 | append-only(UPDATE/DELETE 미제공)·adminId 서버 확정. 감사 기록 실패 격리는 Low 관찰(OBS-013-01) |
| A05 | 보안 설정 오류 | 양호 | cross-schema 격리(AdminRepository admin 스키마만). AdminGuard fail-closed(ADMIN_USER_IDS 미설정 시 전원 거부) |
| A06 | 취약한 컴포넌트 | 양호 | 기존 라이브러리(Prisma·NestJS 가드) 재사용. 신규 패키지 0 |
| A07 | 인증·세션 관리 | 양호 | 감사 조회 JwtAuthGuard+AdminGuard. adminId 는 JWT 확정 userId |
| A08 | 소프트웨어 무결성 | 양호 | 외부 코드 주입 없음. 감사 로그 위변조 표면 축소(애플리케이션 경로 UPDATE/DELETE 부재) |
| A09 | 로깅·모니터링 | 개선(부분) | **007 GAP-007-01(관리자 audit log 부재) 부분 해소** — 판매자 승인 감사 도입(adminId·action·target·시각 append-only). 잔여: 감사 대상 1종 한정(OBS-013-02)·기록 실패 격리(OBS-013-01) |
| A10 | SSRF | 해당 없음 | 외부 URL 조회 로직 없음 |

---

## 긍정 확인 사항

본 감사에서 확인된 안전한 설계·구현:

| 항목 | 확인 내용 |
|---|---|
| **책임 추적(audit trail) 도입** | 관리자 판매자 승인을 `adminId`(승인 수행 관리자)·`action`·`targetType`·`targetId`·`createdAt` 으로 append-only 기록 → 007 A09 권고(GAP-007-01) 부분 해소. 다수 관리자 운영 시 "누가 승인했는가" 사후 추적 가능 |
| **append-only 위변조 방지** | `AdminRepository` 가 `createAuditLog`(INSERT)·`listAuditLogs`(SELECT) 만 노출, UPDATE/DELETE 메서드 부재 → 애플리케이션 경로로 감사 로그 수정·삭제 불가 |
| **adminId 서버 확정(위조 차단)** | `adminId` 가 클라이언트 입력이 아닌 `@CurrentUser().userId`(JWT 확정) → 승인 주체 위조 표면 부재. controller 가 `user.userId` 를 service 에 전달 |
| **AdminGuard fail-closed 포섭** | `GET /admin/audit-logs` 가 별도 가드 선언 없이 컨트롤러 레벨 `@UseGuards(JwtAuthGuard, AdminGuard)`(007 검증 완료)에 자동 포섭 → 신규 라우트 가드 누락 표면 없음 |
| **모듈 경계(P-001) 강화** | admin 모듈 최초 자기 소유 테이블(`admin_audit_logs`)을 `AdminRepository` 가 admin 스키마에서만 접근. 타 도메인은 Service DI 유지. cross-schema 정적 PASS(label 007/013) |
| **민감/금전 필드 부재** | 감사 로그에 비밀번호·토큰·금전 필드 없음(메타: adminId·action·targetType·targetId·createdAt). FK 미선언(cross-schema plain — 스키마 결합 회피) |

---

## 권고사항

### 권고-001 (Low, OBS-013-01 관련)

감사 기록 실패 격리/원자성 — 후속 정책 spec 에서 처리 권장:

```
# 현재 (순차 await, try/catch·tx 없음)
approveSeller(adminUserId, sellerId):
  result = await sellerService.approve(sellerId)     # 커밋됨
  await adminRepository.createAuditLog(...)           # 실패 시 예외 전파(승인은 이미 성공)
  return result

# 권고 (택1)
#  (a) try/catch 로 감사 실패 흡수(로깅 후 승인 반환 — 009 safeNotify 동형)
#  (b) 단일 $transaction 으로 승인+감사 원자화(감사 실패 시 승인도 롤백)
```

### 권고-002 (Low, OBS-013-02 관련)

감사 대상 확장 — 후속 spec 에서 banner CRUD·기타 관리자 mutation 감사 도입 권장:

```
# 현재: SELLER_APPROVE 1종만 감사
# 권고: 각 도메인 mutation 에서 AdminService.recordAudit(...) 호출
#       또는 도메인 이벤트(banner.deleted 등) 구독 핸들러에서 감사 기록
#       (action·targetType String 이라 마이그레이션 불필요)
```

### 일반 권고 (Informational)

- **감사 조회 HTTP e2e(GAP-013-03)**: `GET /admin/audit-logs` 의 관리자 200·비인증 401·비관리자 403
  end-to-end 통합 테스트 부재. 가드는 정적·기록/클램프는 단위로 검증되나, HTTP 시나리오 e2e 보강 권장
  (보안 위험 낮음 — 컨트롤러 가드 포섭 확인됨).
