---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-01
상태: 확정
---

# Assumptions: 013-flutter-customer-phase2

| ID | 가정 내용 | 확인 필요 여부 | 확인 방법 |
|---|---|---|---|
| ASM-001 | 고객지원 이메일 주소는 구현 시 확정될 구성 가능한 상수로 간주한다. spec에 특정 이메일 주소를 포함하지 않는다. | 구현 시 확인 필요 | 실제 지원 이메일 주소를 config 상수로 등록 후 확인 |
| ASM-002 | FAQ·공지사항 정적 콘텐츠의 실제 내용은 구현 단계에서 채운다. 항목 수·내용은 spec 범위 외. | 구현 시 확인 필요 | 실제 FAQ/공지 항목을 stakeholder와 협의하여 확정 |
| ASM-003 | OTP 이메일 발송을 위한 이메일 서비스(SMTP 서버 또는 외부 서비스)는 Planning 단계에서 결정한다. 현재 프로젝트에 이메일 발송 인프라가 없음을 전제한다. | Planning 단계에서 결정 | Planning Agent가 이메일 서비스 옵션 검토 후 확정 |
| ASM-004 | User 엔티티에 phone 컬럼이 존재한다. UpdateProfileDto가 phone?: string을 수락하므로 DB 스키마에 phone 컬럼이 있음을 추정한다. | 구현 시 코드 확인 필요 | user.entity.ts 또는 Prisma schema의 User 모델에서 phone 컬럼 존재 확인 |
| ASM-005 | 이메일 찾기(POST /auth/find-email)는 사용자가 가입 시 연락처(phone)를 등록한 경우에만 동작한다. phone 미등록 사용자는 이메일 찾기 불가이며, 이는 예상 오류 케이스(SC-023)로 처리한다. | 설계 시 확인 필요 | 이메일 찾기 결과 없음 응답의 메시지 문구를 Planning에서 결정 |
