# scripts/migration/Dockerfile — 020-data-migration-cutover 전용 러너 이미지 (GAP-020-05 대안 B)
#
# 목적: 컷오버 러너(extract.sh·load.sh·run.sh)를 실행하기 위한 최소 도구 이미지.
# apps/backend/Dockerfile(운영 앱 이미지)에는 포함하지 않는다 — 이관 도구는 컷오버 시점에만
# 필요하므로 상시 운영 이미지에 psql/pg_dump/bash 를 얹으면 이미지가 불필요하게 비대해진다
# (P-001, GAP-020-05 대안 B 채택 근거). 멀티스테이지 불요 — 앱이 아닌 CLI 도구 묶음이다.
#
# 자격증명은 이미지에 굽지 않는다(P-002/보안). config.env(config.example.env 를 복사해 채운
# 파일)는 빌드 시 COPY 하지 않고 런타임에 볼륨 마운트 또는 `fly machine run --env` 로 주입한다.
#
# 빌드(scripts/migration/ 디렉토리를 컨텍스트로 사용 — 레포 전체를 컨텍스트로 잡을 필요 없음):
#   docker build -f scripts/migration/Dockerfile -t doa-migration-runner scripts/migration
#
# 실행 예(Fly.io one-off machine, ADR-002 — 타깃 Postgres 동일 리전 co-located):
#   fly machine run doa-migration-runner \
#     --app <target-app> \
#     -v migration_config:/config \
#     --command "/migration/run.sh cutover --config-dir=/config" \
#     -e MIGRATION_CONFIG=/config/config.env
#   (또는 fly ssh console 진입 후 동일 이미지의 실행 중인 머신에서 직접 명령 실행)

FROM postgres:16-alpine

# postgres:16-alpine(docker-library 공식 이미지)은 엔트리포인트 스크립트가 bash 를 요구하므로
# bash·psql·pg_dump 가 이미 포함되어 있다. curl 은 run.sh 의 트래픽전환 후 스모크 GET /health 용.
# rclone 은 022-legacy-file-binary-migration 파일 바이너리 이관(files-migrate.sh)에서 레거시
# S3↔R2 오브젝트 복사에 사용한다(ADR-001/002 — vendor-neutral, 신규 별도 이미지 도입 아님/FR-010).
# alpine community 레포에 rclone 패키지가 존재하며 postgres:16-alpine 은 기본적으로 community 를
# 활성화한 상태다(GAP-022-01 — 이 가정은 아래 docker build 검증으로 실증한다).
RUN apk add --no-cache curl rclone

WORKDIR /migration
COPY . /migration/

RUN chmod +x /migration/extract.sh /migration/load.sh /migration/run.sh /migration/files-migrate.sh

# postgres 베이스 이미지의 기본 ENTRYPOINT(docker-entrypoint.sh, postgres 서버 기동용)를 무력화한다
# — 이 이미지는 서버가 아니라 CLI 러너다. 인자 없이 실행되면 서버를 기동하는 대신 사용법만 출력하고
# 대기한다(운영자가 `fly machine run <image> --command "..."` 로 실제 서브커맨드를 지정해 덮어씀).
ENTRYPOINT []
CMD ["/bin/bash", "-c", "echo 'doa-migration-runner ready — invoke: /migration/run.sh <precopy|outbox-check|cutover|rollback> [...]' && sleep infinity"]
