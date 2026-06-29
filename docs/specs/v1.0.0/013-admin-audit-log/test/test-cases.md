---
작성: Test Agent (AUTHORING)
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Test Cases: 013-admin-audit-log

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [케이스 상세](#케이스-상세)
- [외부 의존성 명시](#외부-의존성-명시)
- [미커버 항목 (사전 분류)](#미커버-항목-사전-분류)

---

## SC × 시나리오 매트릭스

> 테스트 함수명은 실제 spec 파일의 `describe`/`it` 식별자 기준.
> 013 은 기존 `approveSeller` 테스트를 감사 append 단언 포함으로 갱신(it 명 변경)하고, `listAuditLogs`
> describe 2 it() 를 신규 추가한다(unit 합계 253→255, +2). SC-003·004 는 정적 코드/스키마/cross-schema 검증.

| SC-ID | 수용 기준 | Happy Path | Edge Case | 테스트 파일·함수 | env 태그 |
|---|---|---|---|---|---|
| SC-001 | approveSeller 시 감사 append | 승인 후 createAuditLog 호출 단언 | — | admin.service.spec.ts::approveSeller | [env:unit] |
| SC-002 | listAuditLogs limit 클램프 | limit 미지정→50 | limit 9999→200(MAX) | admin.service.spec.ts::listAuditLogs | [env:unit] |
| SC-003 | audit-logs 라우트 가드 | — | — | (정적) admin.controller.ts `@UseGuards(JwtAuthGuard, AdminGuard)` | [env:static] |
| SC-004 | 테이블·인덱스·모듈 경계 | — | — | (정적) schema.prisma·migration·cross-schema.spec.ts AdminRepository 규칙 | [env:static] |

---

## 케이스 상세

### SC-001 (admin.service.spec.ts :: approveSeller — 단언 갱신)

- 선행: `mockSellerService.approve.mockResolvedValue({ id: 's1', status: SellerStatus.APPROVED })`,
  `mockAdminRepository.createAuditLog.mockResolvedValue({ id: 'log-1' })`.
- 입력: `service.approveSeller('admin-user-1', 's1')`.
- 단언(013 갱신): `expect(mockSellerService.approve).toHaveBeenCalledWith('s1')` +
  `expect(mockAdminRepository.createAuditLog).toHaveBeenCalledWith({ adminId: 'admin-user-1', action:
  AUDIT_ACTION.SELLER_APPROVE, targetType: AUDIT_TARGET.SELLER, targetId: 's1' })` + `result` 가
  `approve` 반환값.
  - 013 이전: `approveSeller('s1')`(adminUserId 없음, 감사 단언 없음) → it 명
    `when_called_then_reuses_seller_approve` → 갱신 후 `..._and_records_audit`.

### SC-002 (admin.service.spec.ts :: listAuditLogs — 신규 describe 2 it())

- it `when_limit_undefined_then_default_clamped_take`: `mockAdminRepository.listAuditLogs.mockResolvedValue
  ([])` → `service.listAuditLogs(undefined)` → `expect(mockAdminRepository.listAuditLogs).
  toHaveBeenCalledWith(50)`(DEFAULT_AUDIT_LOG_LIMIT).
- it `when_limit_exceeds_max_then_clamped_to_max`: `service.listAuditLogs(9999)` →
  `expect(mockAdminRepository.listAuditLogs).toHaveBeenCalledWith(MAX_AUDIT_LOG_LIMIT)`(200).

### SC-003 (정적 — audit-logs 라우트 가드)

- 검증 방법: `admin.controller.ts` 코드 리뷰/grep.
- 확인 사실: `AdminController` 가 컨트롤러 레벨 `@UseGuards(JwtAuthGuard, AdminGuard)`(007 기존)를
  적용하며, `GET /admin/audit-logs` 핸들러(`listAuditLogs`)가 그 가드에 포섭된다. 라우트별 추가 가드
  선언 없이 관리자 전용(fail-closed).

### SC-004 (정적 — 테이블·인덱스·모듈 경계)

- 검증 방법: `schema.prisma`·마이그레이션 013·`cross-schema.spec.ts` 코드 리뷰.
- 확인 사실: `AdminAuditLog` 모델(append-only — id·adminId·action·targetType·targetId·createdAt, 인덱스
  `(createdAt desc)`·`(adminId, createdAt desc)`, `@@schema("admin")`) 존재. 마이그레이션 013 `CREATE
  TABLE "admin"."admin_audit_logs"` + 인덱스 2종. `cross-schema.spec.ts` AdminRepository 규칙(label
  `007/013`)이 admin 스키마 외 모델(users·sellers·orders·payments·products) 직접 참조 금지를 정적으로
  검증 PASS — admin 스키마 자기 소유 테이블 접근만 허용.

---

## 외부 의존성 명시

### fixture / mock

- `mockSellerService`: `approve`·`listByStatus` jest.fn().
- `mockUserService`: `listUsersForAdmin` jest.fn()(007 기존).
- `mockAdminRepository`(013 신규): `createAuditLog`·`listAuditLogs` jest.fn(). SC-001 은 createAuditLog
  인자, SC-002 는 listAuditLogs(take) 인자 단언.
- 상수: `AUDIT_ACTION.SELLER_APPROVE`·`AUDIT_TARGET.SELLER`·`MAX_AUDIT_LOG_LIMIT`(200).

### 환경 변수

- 단위 테스트: 별도 환경 변수 불필요(전부 mock, DB 연결 없음). `ADMIN_USER_IDS`(AdminGuard)는 단위
  테스트 경로에 미관여.

### 외부 서비스

- 단위: DB·네트워크 연결 없음. 전부 mock. SC-003·004 는 정적 코드/스키마/cross-schema 검증(테스트 실행
  아님 — cross-schema 는 정적 suite 로 실행되나 DB 무연결 AST/규칙 검증).

---

## 미커버 항목 (사전 분류)

| 항목 | 미커버 사유 | 카테고리 | 권장 검증 방법 |
|---|---|---|---|
| `GET /admin/audit-logs` HTTP e2e | 관리자 200·비인증 401·비관리자 403 의 end-to-end 통합 테스트 부재. 가드는 정적(SC-003)·기록/클램프는 단위(SC-001·002)로 갈음 | (2) 설계(통합 한계) | 관리자/비인증/비관리자 HTTP 시나리오 e2e 추가 |
| 판매자 승인 외 mutation 감사 | banner CRUD·기타 관리자 mutation 의 감사 기록 production 부재 | (3) 기능 미구현(범위 외) | 후속 spec — 각 도메인 recordAudit 호출 또는 이벤트 구독 + 기록 테스트 |
| 감사 기록 실패 격리 | createAuditLog 실패 시 흡수/전파 동작 단언 부재(현재 try/catch 미적용 — 예외 전파) | (2) 설계(한계) | 후속 — 격리/트랜잭션 정책 확정 후 실패 시나리오 테스트 |
| `AdminRepository` create/list 직접 단위 | repository 메서드 위임·정렬·take 직접 단언 부재 | (1) 단위테스트 가능 | admin.repository 직접 테스트(Prisma mock) 추가 |
