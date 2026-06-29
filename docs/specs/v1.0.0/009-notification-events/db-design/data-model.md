---
작성: Design Agent (Database Design Agent 비활성 — 스키마 무변경 명시)
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# Data Model: 009-notification-events

## 목차

- [스키마 변경 없음](#스키마-변경-없음)
- [재사용하는 기존 모델 (006)](#재사용하는-기존-모델-006)
- [마이그레이션](#마이그레이션)

---

## 스키마 변경 없음

009 는 **데이터베이스 스키마를 변경하지 않는다**. 신규 테이블·컬럼·enum·인덱스·제약이 없으며,
`prisma/schema.prisma` 변경 0건, 마이그레이션 0건이다. 따라서 Database Design Agent 는 비활성
(selection-phases.md: N)이며 본 문서는 "변경 없음" 사실만 기록한다.

009 는 006-search-notification-file 에서 이미 정의된 알림 테이블과 enum 을 **그대로 재사용**하여
도메인 이벤트로부터 알림 레코드를 생성(insert)할 뿐이다.

---

## 재사용하는 기존 모델 (006)

| 모델 | 스키마 | 009 에서의 사용 |
|---|---|---|
| `Notification`(`users.notifications`) | users | `NotificationService.create(userId, type, title, body)` 가 레코드 insert. 009 가 4종 도메인 이벤트 핸들러에서 이 메서드를 호출 |
| `NotificationType` enum | users | `ORDER_PLACED`·`ORDER_SHIPPED`·`SETTLEMENT_CREATED`·`REVIEW_RECEIVED` 4종 — 009 가 각 이벤트를 대응 type 으로 매핑. 006 에서 이미 4종 전부 열거됨 |

> `users.notifications` 인덱스(`(userId, isRead, createdAt desc)`)·필드(006)는 변경 없이 사용한다.
> 009 의 신규 알림 생성도 동일 테이블·인덱스에 기록된다.

---

## 마이그레이션

**없음.** 스키마 변경이 0건이므로 신규 마이그레이션 파일이 생성되지 않았다. 006 의
`20260629081946_006_search_notification_file` 마이그레이션이 알림 테이블·enum 의 SoT 다.
