---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 PyPI/npm 의존성 자가 점검](#신규-pypinpm-의존성-자가-점검)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)
- [결정 일시 및 결정자](#결정-일시-및-결정자)

## 선택 단계 활성화 결정

> 활성화 기준: spec.md FR/NFR 에 **명시적 요구사항**이 존재할 때만 활성화(암묵적 연관 금지).

- **Database Design Agent**: **N**
  - 근거: 스키마 변경 0건. 009 는 006 의 `users.notifications` 테이블과 `NotificationType` enum 을 그대로 재사용하며 신규 테이블·컬럼·enum·인덱스가 없다. 마이그레이션 0. DB 무결성 제약 변경도 없으므로 DB Design 활성화 사유 부재. db-design/data-model.md 에 "스키마 변경 없음" 사실만 기록.

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. 신규 npm 의존성 0건(`@nestjs/event-emitter` 기존), Dockerfile/docker-compose 구조 변경 0건. 신규 env 0.

- **Security Agent**: **Y**
  - 근거: FR/NFR 에 보안 표면 존재 — (1) **실패 격리**: 알림 실패가 주문·배송·정산·리뷰 흐름에 전파되지 않아야 함(`safeNotify`, FR-005). (2) **수신자 해석 권한**: 알림 수신자(userId)는 서버가 도메인 Service 로 해석하며 클라이언트가 임의 지정할 수 없음(타인 알림 생성 방지, NFR-001). (3) **순환 의존 부재**: 모듈 import 단방향성(NFR-002) 확인. Security Agent 가 이 3축의 긍정 확인을 수행하고 GAP-006-01 의 해결을 검증한다.

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95·처리량) 명시 없음. 수신자 해석은 단건 findById 조회이며 별도 성능 게이트 대상 부재.

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 없음. 신규 npm 패키지 0건. 인-프로세스 이벤트는 기존 @nestjs/event-emitter(EventEmitter2) 사용.
  → 외부 메시지 브로커·푸시 SDK 미도입.
  → 본 항목 무관. (Deploy Agent 비활성)
```

## 활성화된 단계 실행 순서

- Security Agent: 6단계 후 / 7단계 전 (실패 격리·수신자 해석 권한·순환 의존 부재 확인, GAP-006-01 해결 검증)

> 캐스케이딩 블로킹: Deploy 비활성 → Security 독립 실행. 감사 결과 Critical/High 0건 → COMPLETE.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-29 19:01
- 결정자: Planning Agent (2단계, retroactive)
