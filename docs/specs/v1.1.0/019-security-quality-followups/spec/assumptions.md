---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-04 06:56
상태: 확정
---

# Assumptions: 019-security-quality-followups

| ID | 가정 내용 | 확인 필요 여부 | 확인 방법 |
|---|---|---|---|
| ASM-001 | SEC-017-01 DTO 전환 대상을 Task가 명시한 2개 엔드포인트(`admin/sellers/pending`·`sellers/me/products`)에서 4개(`admin/users`·`admin/audit-logs` 포함)로 확장했다. 근거: `admin.controller.ts` 코드 확인 결과 `listUsers`·`listAuditLogs`도 동일한 개별 `@Query()` + 수동 `parseInt` anti-pattern을 사용하며, 017 security-report.md가 이미 "일관성 측면에서 함께 정정" 권고를 명시했다. | 낮음(코드 근거로 뒷받침된 합리적 확장, 순수 입력 검증 강화이며 기존 유효 입력 동작 불변) | Planning/Design 단계에서 4개 엔드포인트 전부가 tasks.md에 반영되는지 확인. 사용자가 2개로 축소를 원하면 spec.md FR-002·FR-003 및 대응 SC-002·SC-003 제거 |
| ASM-002 | GAP-017-03 인덱스 마이그레이션은 로컬 개발 DB(Docker Compose PostgreSQL) 적용 + 신규 Prisma 마이그레이션 파일 생성까지를 spec 범위로 하고, 실 운영(prod) 배포 적용은 표준 `prisma migrate deploy` 경로(향후 배포 시 자동 수반)로 별도 취급한다. | 낮음(프로젝트가 아직 Stage 1~3 — `fly.toml` 미존재로 "운영 배포"라는 별도 환경이 코드베이스 관점에서 아직 존재하지 않음) | 향후 Stage 4+ 실 배포 시점에 마이그레이션이 정상 적용되는지 배포 체크리스트로 확인(본 spec 산출물은 마이그레이션 파일 자체가 SoT) |
