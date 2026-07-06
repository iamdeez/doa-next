---
작성: Planning Agent
버전: v1.1
최종 수정: 2026-07-06 [시각 미확인 — Bash 미제공, date 실행 불가]
상태: 확정
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 npm 의존성 자가 점검 (PATCH-A15 준용)](#신규-npm-의존성-자가-점검-patch-a15-준용)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)

---

## 선택 단계 활성화 결정

> 활성화 기준: spec.md 의 FR/NFR 에 **명시적 요구사항**이 존재할 때만 Y. 암묵적 연관 금지.

- **Database Design Agent**: **N**
  - 근거: 본 spec 은 외부 연동 Port 구현체(IniisisPaymentGateway·R2FileStorage)만 교체하며 **신규 테이블·컬럼·마이그레이션이 0건**이다(plan.md 데이터 모델 절 — payments·files 스키마 전부 기존 유지, pgTransactionId/pgRefundId 기존 nullable 컬럼 재사용). FR/NFR 에 DB 스키마 변경·생성 명시 없음.

- **Deploy Agent**: **Y**
  - 근거: FR-005(sandbox↔운영 자격증명 env 전환)·ASM-008(Fly secrets 사용자 등록)·plan.md "배포 환경 영향(PROC-009)" 절 — **신규 외부 아웃바운드 연동 2종**(이니시스 결제 API·Cloudflare R2 S3 API) 도입 + 신규 Fly secrets(`INICIS_*`·`R2_*`·`PAYMENT_PROVIDER`·`FILE_STORAGE`) 등록 필요 + `.env.example`·infra.md §3.4/§5/§6/§7 갱신 필요. `[env:e2e-docker]` 태그 SC(SC-001~005·010·011·013) 다수 존재.

- **Security Agent**: **Y**
  - 근거: FR-005/NFR-004(자격증명·카드정보 로그 미노출, SC-016)·P-005(결제 정합성) — 실 PG API 키·서명(hash)·MID·R2 API 토큰 등 **실 결제 자격증명 취급** + 결제 요청/응답 로깅 보안 + 서명 위·변조 방어 감사가 필수. 결제 데이터 보안이 명시적 NFR(NFR-004)로 존재.

- **Performance Agent**: **Y**
  - 근거: NFR-001(결제 관련 API P95 ≤2,000ms **수치** 명시)·SC-013(100회 순차 P95 측정, `[env:e2e-docker]`) — 성능 목표 수치가 spec.md 에 명시되어 있어 활성화 조건 충족. 단 이니시스 외부 API 지연은 통제불가 변동요인(ASM-004)임을 측정 시 구분한다.

---

## 신규 npm 의존성 자가 점검 (PATCH-A15 준용)

> PATCH-A15 는 PyPI 대상이나 동일 원칙을 npm 생태계에 적용(02-planning.md 선택단계 표 "다른 언어/생태계는 별도 패키지 매니저에 동일 원칙 적용").

```
자가 점검: 본 spec 에 신규 npm 의존성 추가가 있는가? (package.json dependencies 변경)
  → 있음: @aws-sdk/client-s3 (+ @aws-sdk/s3-request-presigner [TO-VERIFY]) — R2 연동.
    이니시스는 native fetch 로 신규 런타임 의존 없음(crypto 내장 서명).
  → [env:e2e-docker] 태그 SC 존재? 예 (SC-010/011 R2 업로드·접근).
  → 결론: Deploy Agent 활성(Y). Dockerfile 빌드 환경에서 @aws-sdk/client-s3 import 가능해야 함
    (R2 실 연동 e2e). 정적 갈음 아님 — 실 R2 PUT/GET 검증(SC-010/011)이 e2e-docker 대상.
```

- `@aws-sdk/client-s3` 는 P-002 L32 명시 허용·infra.md §6 "의존성 구조(확정)" 기재분의 실제 설치. 신규 벤더 종속 아님(S3 호환 표준).

---

## 활성화된 단계 실행 순서

Deploy Agent → Security Agent → Performance Agent
(agent-rules §0 선택 Agent 실행 순서. 6단계 Docs 후 / 7단계 Retrospective 전. 캐스케이딩 블로킹 규칙 적용 — Deploy FAIL 시 Security·Performance 스킵, Security Critical/High BLOCKED 시 Performance 스킵.)

- Database Design Agent 비활성(N) → 3단계 후 4단계 직접 진입.

## 결정 일시 및 결정자

- 결정자: Planning Agent (2단계)
- 결정 일시: 2026-07-06 [시각 미확인 — Bash 미제공, date 실행 불가]
</content>
