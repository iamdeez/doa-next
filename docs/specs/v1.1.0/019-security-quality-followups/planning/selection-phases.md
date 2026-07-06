---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-04 [시각 미확인, spawn 기준 07:04]
상태: 확정
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 의존성 자가 점검 (PATCH-A15)](#신규-의존성-자가-점검-patch-a15)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)

---

## 선택 단계 활성화 결정

| Agent | 결정 | 근거 |
|---|---|---|
| **Database Design Agent** | **Y** | FR-006/007 이 `schema.prisma` 인덱스 추가 + 신규 Prisma 마이그레이션 생성을 **명시**한다(DB 스키마 변경). SC-007/008(static 인덱스 존재)·SC-009([env:e2e-db] EXPLAIN)가 스키마·마이그레이션 검증을 요구. 인덱스 컬럼 구성(ADR-003 복합 `[sellerId/status, createdAt Desc, id Desc]`)·마이그레이션 무결성(GAP-005-03 드리프트 위 순차 누적) 설계 검토가 필요. |
| **Deploy Agent** | **N** | **신규 npm 의존 0**(class-validator·class-transformer·nestjs-pino 전부 기존 설치). Dockerfile·docker-compose·CI(`ci.yml`) 변경 없음. 배포 구성·컨테이너화 변경 미명시. 마이그레이션은 표준 `prisma migrate` 경로(기존 16차와 동일)이며 운영 배포 실적용은 §범위 외. `[env:e2e-docker]` 태그 SC 부재. |
| **Security Agent** | **Y** | 본 spec 의 목적 자체가 보안 감사 후속 부채 해소이며 FR-008~012 가 **보안·개인정보(PII) 요구사항을 명시**한다 — find-email enumeration 감사 로그(FR-008/009/010), JWT 토큰 평문 로그 redact(FR-011/012), 비정수 입력 500 차단(FR-005). 017/018 security-report.md 가 SEC-017-01·SEC-018-02·SEC-018-03 을 비블로킹 권고로 남겼으므로, 재감사로 3건 RESOLVED 판정 + 신규 회귀(마스킹 누락·redact 경로 오류) 유무 확인이 필요. |
| **Performance Agent** | **Y** | NFR-003 이 `sellerId`/`status` 인덱스 추가 후 두 cursor 쿼리의 `EXPLAIN` 실행 계획이 **Seq Scan 이 아닌 인덱스 기반 스캔**임을 명시적으로 요구하고, SC-009([env:e2e-db])가 이 쿼리 플랜 검증을 대응 수용 기준으로 둔다. 인덱스 효과(쿼리 플랜) 검증은 Performance Agent 도메인. (부하/처리량 수치 목표가 아닌 쿼리 플랜 구조 검증이므로, 벤치마크가 아닌 EXPLAIN 플랜 확인 범위로 한정.) |

## 신규 의존성 자가 점검 (PATCH-A15)

```
자가 점검: 본 spec 에 신규 PyPI/npm 의존성 추가가 있는가? (package.json / pyproject 변경)
  → 없음. class-validator·class-transformer(기존 ListProductsDto 사용분)·nestjs-pino(기존 LoggerModule)·@prisma/client 전부 설치 완료.
  → [env:e2e-docker] 태그 SC 부재. → Deploy Agent 비활성 정당.
```

## 활성화된 단계 실행 순서

3단계 Design 완료 후:
1. **Database Design Agent** (3단계 후 / 4단계 전) — 인덱스 스키마·마이그레이션 설계 검토.

6단계 Docs 완료 후 (Deploy 비활성 → 캐스케이딩 블로킹 없음):
2. **Security Agent** — SEC-017-01/018-02/018-03 재감사.
3. **Performance Agent** — NFR-003/SC-009 인덱스 EXPLAIN 검증.

> 실행 순서 근거(agent-rules.md §0): 선택 Agent 순서 = Deploy → Security → Performance. Deploy 비활성이므로 Security 독립 실행. Security 가 Critical/High 없이 COMPLETE(재감사이므로 신규 취약점 기대 낮음) 시 Performance 진행. Security BLOCKED 시 Performance 스킵.

결정 일시: 2026-07-04 [시각 미확인, spawn 기준 07:04]
결정자: Planning Agent (ASM-001/002 사용자 확정 반영 — pipeline-log 2026-07-04 07:04 사용자 개입)
