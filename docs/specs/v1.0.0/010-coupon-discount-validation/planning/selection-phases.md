---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 20:17
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
  - 근거: DB 스키마 변경 0. Coupon 테이블의 기존 `discountValue`·`maxDiscountAmount`·`minOrderAmount` `@db.Decimal(12,2)` 필드(004 정의)를 재사용한다. 신규 테이블·컬럼·enum·인덱스·마이그레이션 없음. FR-001·002 는 전부 service 레벨 로직이다. (data-model.md 는 "스키마 변경 없음" 을 명시적으로 기록하는 stub 으로만 존재.)

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. 신규 npm 의존성 0건, Dockerfile/docker-compose·env 변경 0. 004 와 동일 운영.

- **Security Agent**: **Y**
  - 근거: 본 spec 의 직접 목적이 004 보안 발견(SEC-001, Medium — 쿠폰 할인값 검증 누락에 의한 과다청구)의 해결이다. Security Agent 가 (1) 생성 검증(`_assertValidDiscount`)에 의한 음수/범위 위반 차단, (2) 계산 0 floor(`_calcDiscount`)에 의한 음수 할인 방어, (3) 과다청구 경로(`totalAmount − discountAmount`) 차단을 검증하고 SEC-001 의 RESOLVED 판정을 확정한다.

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95·처리량) 명시 없음. 검증(`lte`·`gt`·`lt`)·floor(`max`·`min`)는 상수 시간 Decimal 비교이며 별도 성능 게이트 대상 부재.

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 없음. 신규 npm 패키지 0건. 기존 Prisma·NestJS 만 사용.
  → BadRequestException 은 @nestjs/common(이미 사용 중) import 추가일 뿐 신규 패키지 아님.
  → 본 항목 무관. (Deploy Agent 비활성)
```

## 활성화된 단계 실행 순서

- Security Agent: 6단계 후 / 7단계 전 (SEC-001 RESOLVED 검증)

> 캐스케이딩 블로킹: Deploy 비활성 → Security 독립 실행. 감사 결과 Critical/High/Medium 0건(SEC-001 RESOLVED) → COMPLETE. Performance 비활성.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-29 20:17
- 결정자: Planning Agent (2단계, retroactive)
