---
작성: Development Agent
버전: v1.0
최종 수정: 2026-07-06 15:40
상태: 확정
---

# 사전평가 리포트 템플릿: 022-legacy-file-binary-migration

> Branch: 022-legacy-file-binary-migration | Plan: [../../docs/specs/v1.1.0/022-legacy-file-binary-migration/planning/plan.md](../../docs/specs/v1.1.0/022-legacy-file-binary-migration/planning/plan.md) | Runbook: [FILE-MIGRATION-RUNBOOK.md](FILE-MIGRATION-RUNBOOK.md)
>
> 본 문서는 **템플릿**이다. 실측값은 옵션 A(사용자 실행)로 주입한다 — 레거시 실 버킷·객체는 파이프라인에서 접근 불가하다(spec.md "사후 검증 활동 실행 방식"). 컷오버 실행 **전** 아래 표를 실측값으로 채운 뒤, 잔존 실패나 예상 소요 초과가 있으면 §3 게이트에 따라 진행 전 사용자 재확인을 거친다.

## 목차

- [1. 측정 방법](#1-측정-방법)
- [2. 총 개수·총 용량·예상 소요](#2-총-개수총-용량예상-소요)
- [3. 잔존 실패 목록 (재확인 필요 게이트)](#3-잔존-실패-목록-재확인-필요-게이트)
- [4. 멀티파트 ETag 형식 샘플 확인 (ASM-003)](#4-멀티파트-etag-형식-샘플-확인-asm-003)
- [5. 예상 전송량·비용 인지](#5-예상-전송량비용-인지)
- [6. 종합 판정](#6-종합-판정)

---

## 1. 측정 방법

1. **총 개수·총 용량 실측**: `files-migrate.sh precheck` 를 사용자 환경(레거시 S3 read 자격증명)에서 실행하면 `migration-run/precheck-report.json` 에 다음 값이 기록된다.
   ```bash
   /migration/files-migrate.sh precheck
   cat migration-run/precheck-report.json
   ```
   - `legacy_bucket_object_count`: 레거시 버킷 실측 객체 개수(`rclone size --json`).
   - `legacy_bucket_total_bytes`: 레거시 버킷 실측 총 바이트.
   - `files_files_uploaded_count`: 타깃 `files.files WHERE status='UPLOADED'` 카운트(이관 대상 SoT, ADR-004).
2. **처리량(객체/초, 바이트/초) 파일럿 측정**: 소규모 샘플(예: 1,000개 객체)로 `precopy` 를 1회 실행하여 소요 시간을 측정하고, 이를 근거로 전체 예상 소요를 산정한다(020 PRE-ASSESSMENT.md §1 파일럿 방법 승계).
3. **예상 소요 산정**: `예상소요(초) = 총 개수 / 파일럿 처리량(객체/초)`(또는 총 용량 기준 `총 바이트 / 파일럿 처리량(바이트/초)` 중 더 보수적인 값). 사전 대량 복사(precopy) 구간은 시간 상한이 없으므로(NFR-002) 전체가 소요되어도 무방하나, **윈도우 내 델타(delta) 구간만 NFR-001(60분) 제약**을 받는다 — 델타 예상 소요는 "precopy 완료 시점 이후 신규 UPLOADED 예상 발생량"으로 별도 산정한다(통상 소량, plan.md ASM-004 안전망).

## 2. 총 개수·총 용량·예상 소요

| 항목 | 실측값 |
|---|---|
| 레거시 버킷 총 개수(`legacy_bucket_object_count`) | [TO-VERIFY] |
| 레거시 버킷 총 용량(`legacy_bucket_total_bytes`) | [TO-VERIFY] |
| `files.files` UPLOADED 카운트(`files_files_uploaded_count`) | [TO-VERIFY] |
| 사전 복사(precopy) 예상 소요 | [TO-VERIFY] |
| 윈도우 내 델타(delta) 예상 소요(020 60분 윈도우 공유, NFR-001) | [TO-VERIFY] |

> 총 개수·총 용량·예상 소요 3항목이 이관 규모 판단의 최소 기준이다(FR-009/SC-009). 레거시 버킷 총 개수와 `files.files` UPLOADED 카운트가 크게 다르면(예: 고아 메타 또는 고아 객체) §3.2 원인 조사 대상이다.

## 3. 잔존 실패 목록 (재확인 필요 게이트)

precopy(또는 delta) 재시도 후에도 미해소된 **잔존 실패**가 있으면 아래에 key 목록을 채운다(`migration-run/precopy-remaining-failures.md` 또는 `migration-run/delta-remaining-failures.md` 내용을 그대로 반영).

- [ ] 잔존 실패 0건 — 이관 대상 전건 성공.
- [ ] 잔존 실패 존재 — 아래 목록 기재:

```
[TO-VERIFY: 잔존 실패 key 목록 — 없으면 "없음" 기재]
```

> **컷오버 개시 전 사용자 재확인 필요**: 잔존 실패가 1건이라도 있으면 컷오버 유지보수 윈도우 개시 전에 반드시 원인(레거시 객체 부재/key 비호환/권한 문제 등, ASM-002/005)을 조사하고 진행 여부를 사용자가 재확인해야 한다(FR-007/SC-007).

## 4. 멀티파트 ETag 형식 샘플 확인 (ASM-003)

레거시 스토리지의 멀티파트 업로드 객체는 ETag 가 단순 MD5 가 아니라 파트 해시들의 해시(`-N` 접미사)라 체크섬 비교 시 정상 객체를 손상으로 오판할 수 있다. `files-migrate.sh verify` 는 이런 후보를 자동으로 콘텐츠 바이트 대조 fallback 처리하지만(ASM-003 안전망), 사전에 샘플 ETag 형식을 확인해 두면 verify 리포트 해석에 도움이 된다.

- [ ] 레거시 버킷에서 임의 객체 1건 이상의 ETag 형식 확인(단일 해시 vs `-N` 멀티파트 접미사).
- [ ] 멀티파트 객체 비중이 높다고 판단되면 verify 단계에서 `--download` fallback 소요 시간이 늘어날 수 있음을 인지(윈도우 예산에 반영).

## 5. 예상 전송량·비용 인지

- 레거시 AWS S3 egress 요금은 사전 대량 복사(precopy) 시 총 전송 바이트에 비례하여 발생한다(§2 총 용량 참고). R2 는 ingress 무료다.
- [ ] 예상 전송량에 따른 레거시 egress 비용을 운영 담당자가 인지했는가.

## 6. 종합 판정

- [ ] §2 표 전 항목 실측 완료.
- [ ] §3 잔존 실패 목록 확인 완료 — 잔존 실패가 있으면 사용자 재확인 기록: ______________.
- [ ] §4 멀티파트 ETag 샘플 확인 완료.
- [ ] 델타 예상 소요가 020 NFR-001(60분) 윈도우 예산(DB 델타와 합산) 이내 — 초과 시 [FILE-MIGRATION-RUNBOOK.md §4](FILE-MIGRATION-RUNBOOK.md#4-020-컷오버-윈도우-통합-체크포인트) 재협의.
- [ ] 리허설(dry-run) 실측치와 본 사전평가 추정치의 편차 확인(±20% 이상 편차 시 재산정 권고).
