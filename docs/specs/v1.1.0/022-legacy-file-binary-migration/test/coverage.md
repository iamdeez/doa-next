---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-07-06 14:55
상태: 확정
---

# Coverage: 022-legacy-file-binary-migration

## 목차

- [SC × 시나리오 매트릭스](#sc--시나리오-매트릭스)
- [Deferred SC (env 태그 라우팅)](#deferred-sc-env-태그-라우팅)
- [STALE_SC 경고](#stale_sc-경고)

---

## SC × 시나리오 매트릭스

> "수용 기준" 열은 spec.md 원문을 복사한다(PATCH-001 — 요약·재구성 금지). "검증 파일" 열은 실재 확인된 파일 경로만 기재한다.

| SC-ID | 수용 기준(spec.md 원문) | Happy Path | Edge Case | Error Case | plan.md 시나리오 전체 | 상태 |
|---|---|---|---|---|---|---|
| SC-001 | 이관 파이프라인 실행 후 `status=UPLOADED` 레코드가 참조하는 파일 객체 전건이 R2 버킷에 존재하고, `status=PENDING` 레코드는 이관 대상에서 제외되었음을 확인한다. [env:e2e-db] | test-cases.md §옵션 A 실행 계약 1 | 동상(PENDING 자연 배제) | — | Y | DEFERRED(옵션 A) |
| SC-002 | 벌크 사전 복사 완료 시점에 사전 복사 대상 파일의 100%가 R2 로 이관(성공)되었음을 확인한다(잔존 실패는 SC-007 로 별도 처리). [env:e2e-db] | test-cases.md §옵션 A 실행 계약 2 | — | — | Y | DEFERRED(옵션 A) |
| SC-003 | 컷오버 윈도우 개시 이후, 사전 복사 완료 시점 이후 생성된 최종 델타 파일(신규 `UPLOADED` 레코드)이 윈도우 내에 추가 이관됨을 확인한다. [env:e2e-db] | — | test-cases.md §옵션 A 실행 계약 3 | — | Y | DEFERRED(옵션 A) |
| SC-004 | 이관된 각 R2 객체의 key 값이 레거시 객체 key 값과 동일하며, 해당 `files.files` 레코드의 `url` 필드가 `R2_PUBLIC_BASE_URL` + key 형태로 갱신되어 있음을 확인한다. [env:integration] | test-cases.md §옵션 A 실행 계약 4 + `sql/30_file_url_update.sql` (c) 쿼리 정적 확인 | — | — | Y | DEFERRED(옵션 A, 정적 갈음 확인 완료) |
| SC-005 | 정합성 검증 리포트에서 이관 대상 파일 개수가 레거시=신규로 100% 일치하고, 무작위 샘플(스키마당 최소 100건 또는 전체 1% 중 큰 값, 020 SC-007 패턴 승계)의 체크섬이 일치함을 확인한다. [env:e2e-db] | test-cases.md §옵션 A 실행 계약 5 | 동상(멀티파트 fallback 포함) | — | Y | DEFERRED(옵션 A) |
| SC-006 | 개별 파일 이관 실패를 인위적으로 재현했을 때, 절차가 전체를 중단하지 않고 실패 목록에 기록한 뒤 재시도를 수행함을 확인한다. [env:integration] | — | — | test-cases.md §옵션 A 실행 계약 6 + `files-migrate.sh` `--retries`·실패 key 캡처 경로 정적 확인 | Y | DEFERRED(옵션 A, 정적 갈음 확인 완료) |
| SC-007 | 사전 복사 완료 후에도 미해결 실패가 잔존하는 시나리오를 재현했을 때, 사전 평가 리포트에 잔존 실패 목록과 "컷오버 개시 전 사용자 재확인 필요" 문구가 포함됨을 확인한다. [env:static] | — | — | `apps/backend/test/static/file-migration-pre-assessment.spec.ts::test_SC007_pre_assessment_documents_residual_failure_reconfirmation` | Y | PASS |
| SC-008 | 실행 절차 문서(런북)에 레거시 S3 자격증명·버킷 접근이 필요한 단계마다 "사용자 환경 실행 → 결과 전달 → 검증" 절차가 명시되어 있음을 확인한다. [env:static] | `apps/backend/test/static/file-migration-runbook.spec.ts::test_SC008_*`(it.each 5건 + 라벨 최소출현) | — | — | Y | PASS |
| SC-009 | 사전 평가 리포트에 레거시 파일 총 개수·총 용량 실측값과 예상 소요 시간이 기재되어 있음을 확인한다. [env:static] | `apps/backend/test/static/file-migration-pre-assessment.spec.ts::test_SC009_pre_assessment_has_total_count_capacity_duration_slots` | — | — | Y | PASS |
| SC-010 | 파일 이관 스크립트가 020 전용 러너 이미지(`scripts/migration/Dockerfile`) 내에서 정상 실행 가능함을 확인한다(신규 별도 이미지 생성 없음). [env:static] | `apps/backend/test/static/file-migration-script.spec.ts::test_SC010_*` | — | — | Y | PASS |
| SC-011 | 리허설 또는 실제 실행 로그에서 컷오버 윈도우 내 델타 파일 이관 소요가 020 NFR-001(60분) 범위 안에 포함됨을 확인한다. [env:e2e-db] | — | test-cases.md §옵션 A 실행 계약 7 | — | Y | DEFERRED(옵션 A) |
| SC-012 | 사전 대량 복사 단계 실행 스크립트·로그에 별도 시간 상한 강제 로직(타임아웃에 의한 자동 중단)이 없음을 확인한다. [env:static] | — | `apps/backend/test/static/file-migration-script.spec.ts::test_SC012_*` | — | Y | PASS |
| SC-013 | 컷오버 개시 시점(사전 복사 완료 확정 시점) 파일 개수 대조에서 불일치 0건임을 확인한다. [env:e2e-db] | test-cases.md §옵션 A 실행 계약 8 | — | — | Y | DEFERRED(옵션 A) |
| SC-014 | 이관 전송 채널 설정에 TLS/HTTPS 가 적용되어 있음을 설정 검토로 확인한다. [env:static] | `apps/backend/test/static/file-migration-script.spec.ts::test_SC014_*` | — | — | Y | PASS |
| SC-015 | 이관 실행 로그(파일별 성공/실패·재시도 횟수·검증 결과)가 감사 가능한 형태(파일 또는 감사 테이블)로 저장됨을 확인한다. [env:integration] | test-cases.md §옵션 A 실행 계약 9 + `verification_runs`(phase='file-migration') INSERT/UPDATE 경로 정적 확인 | — | — | Y | DEFERRED(옵션 A, 정적 갈음 확인 완료) |

> **SC-XXX 시나리오 유형 커버리지**: Happy(SC-001·002·004·005·008·009·010·013·014·015) / Edge(SC-003·011·012) / Error(SC-006·007) — plan.md 테스트 전략의 3유형 분류와 완전 일치(plan.md "SC-XXX 시나리오 유형 커버리지" 절 대조 완료).

---

## Deferred SC (env 태그 라우팅)

| SC-ID | env 태그 | deferred 사유 | 검증 주체 |
|---|---|---|---|
| SC-001 | e2e-db | 실 레거시 AWS S3 자격증명·네트워크 접근이 사용자 환경에만 존재 | 옵션 A(사용자 실행) → 5b/Deploy Agent 판정 |
| SC-002 | e2e-db | 상동 | 상동 |
| SC-003 | e2e-db | 상동 | 상동 |
| SC-004 | integration | 상동(정적 갈음: SQL 결정적 함수 형태 확인 완료) | 상동 |
| SC-005 | e2e-db | 상동 | 상동 |
| SC-006 | integration | 상동(정적 갈음: 재시도·실패목록 캡처 경로 확인 완료) | 상동 |
| SC-011 | e2e-db | 상동(리허설/실행 로그 필요) | 상동 |
| SC-013 | e2e-db | 상동 | 상동 |
| SC-015 | integration | 상동(정적 갈음: `verification_runs` 경로 확인 완료) | 상동 |

deferred 9건은 "모든 SC-XXX 에 대응하는 테스트 케이스 존재" 완료 기준을 test-cases.md §옵션 A 실행 계약(실행 절차·기대 결과·판정 기준 명세)으로 충족한 것으로 간주한다. 정적 검증 6건은 자동 실행·PASS 확인 완료.

---

## STALE_SC 경고

검출 결과: **0건**. `apps/backend/test/static/file-migration-*.spec.ts` 3개 파일의 docstring·describe 블록에 등장하는 SC 번호(SC-007·008·009·010·012·014)는 전부 spec.md 022 의 SC 집합(SC-001~015) 내에 존재한다.

참고(비-STALE): `file-migration-runbook.spec.ts` 주석에 "020 SC-015 근사 검증 패턴 승계"라는 문구가 있으나, 이는 020 spec 의 SC-015(선행 spec 참조)를 인용한 설계 근거 서술이며 본 파일이 022 SC-015 를 커버한다고 주장하는 서술이 아니다(실제 `describe`/`it` 블록은 전부 SC-008 대상). 022 자체의 SC-015 는 test-cases.md §옵션 A 실행 계약 9 로 별도 매핑되어 있어 혼선 없음.

```yaml
stale_sc:
  count: 0
  decision: NONE_FOUND
```
