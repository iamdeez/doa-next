---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
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

- **Database Design Agent**: **Y**
  - 근거: `admin` 스키마에 신규 테이블 `admin_audit_logs`(`AdminAuditLog` 모델) 1종 추가 + 인덱스 2종
    (`createdAt desc`·`adminId, createdAt desc`) + 비파괴 마이그레이션 013(`CREATE TABLE`). FR-001 이
    DB 스키마 변경(테이블·인덱스)·마이그레이션 파일을 직접 요구한다. Database Design Agent 가 테이블
    정의·인덱스·append-only 무결성 규칙·마이그레이션 SQL·롤백 전략을 확정한다.

- **Security Agent**: **Y**
  - 근거: 본 spec 은 **책임 추적(audit trail)**·**접근 제어**가 핵심이다. (1) 감사 로그 조회 `GET
    /admin/audit-logs` 는 `JwtAuthGuard`+`AdminGuard`(fail-closed) 인가 표면이다. (2) `adminId` 출처가
    클라이언트 입력이 아닌 서버 `@CurrentUser().userId` 임을 검증해야 한다(위조 표면). (3) append-only
    (UPDATE/DELETE 미제공)·위변조 방지 설계의 보안 적정성 검토가 필요하다. 007 GAP-007-01 자체가
    security-report.md A09(로깅·모니터링) 권고였으므로 그 해소의 보안 적정성을 Security Agent 가 감사한다.

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. 신규 npm 의존성 0건, Dockerfile/
    docker-compose·env 변경 0(`ADMIN_USER_IDS` 는 007 기존). 마이그레이션은 기존 `prisma migrate` 절차로
    적용(007~012 와 동일 운영).

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95·처리량) 명시 없음. 감사 기록은 승인당 INSERT 1건(저빈도), 조회는
    인덱스(`createdAt desc`) 기반 take 제한(클램프 ≤200) 단순 쿼리다. 알고리즘 복잡도·고부하 표면 없음.

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 없음. 신규 npm 패키지 0건. 기존 Prisma·@prisma/client(AdminAuditLog·SellerStatus)·NestJS 가드만 사용.
  → 본 항목 무관. (Deploy Agent 비활성)
```

## 활성화된 단계 실행 순서

- Database Design Agent: 3단계(Design) 후 / 4단계(Development) 전 (`admin_audit_logs` 테이블·인덱스·
  마이그레이션 013 확정)
- Security Agent: 6단계(Docs) 후 / 7단계(Retrospective) 전 (책임 추적·append-only·AdminGuard·adminId
  서버 확정 감사)

> 캐스케이딩 블로킹: Deploy 비활성 → Security 독립 실행 가능. Security Agent: COMPLETE(Critical/High/
> Medium 0) → Performance 는 비활성(N)이므로 미실행. Database Design Agent 단독 활성(테이블·마이그레이션
> 산출) 후 4단계 진입, Security 는 문서화 후 감사.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-29 21:19
- 결정자: Planning Agent (2단계, retroactive)
