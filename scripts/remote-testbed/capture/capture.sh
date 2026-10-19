#!/bin/sh
# Capture real probe.sh output into fixtures/remote/<case>/probe.txt
# (docs/remote/PLAN.md §8.2). Everything runs against a throwaway dind daemon,
# so nothing from the Mac's own Docker ever lands in a fixture.
#   sh scripts/remote-testbed/capture/capture.sh
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
PROBE="$ROOT/src-tauri/src/remote/probe.sh"
OUT="$ROOT/fixtures/remote"
SOCK=unix:///var/run/dind/docker.sock
CTRS="nx-fx-dockerd nx-fx-alpine nx-fx-u22 nx-fx-deb12 nx-fx-u24 nx-fx-al2023"

cleanup() {
  # shellcheck disable=SC2086
  docker rm -f $CTRS >/dev/null 2>&1 || true
  docker volume rm nx-fx-sock >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

build() { docker build -q -t "nx-fx/$1" -f "$HERE/Dockerfile.$1" "$HERE" >/dev/null; }
for img in alpine ubuntu-22.04 ubuntu-24.04 debian-12 amazonlinux-2023; do
  echo "building $img"
  build "$img"
done

echo "starting dind"
docker volume create nx-fx-sock >/dev/null
docker run -d --privileged --name nx-fx-dockerd -e DOCKER_TLS_CERTDIR= \
  -v nx-fx-sock:/var/run/dind docker:29-dind dockerd --host "$SOCK" --group 2375 >/dev/null
i=0
until docker exec nx-fx-dockerd docker -H "$SOCK" info >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "dind never came up"; exit 1; }
  sleep 1
done
compose() { docker exec -i nx-fx-dockerd docker -H "$SOCK" compose -f - "$@" < "$HERE/workloads.compose.yml"; }

systemd_ctr() { # name image hostname
  docker run -d --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
    --tmpfs /run --tmpfs /run/lock -v nx-fx-sock:/var/run/dind \
    --hostname "$3" --name "$1" "nx-fx/$2" >/dev/null
  docker exec "$1" systemctl is-system-running --wait >/dev/null 2>&1 || true
}
plain_ctr() { # name image hostname
  docker run -d -v nx-fx-sock:/var/run/dind --hostname "$3" --name "$1" "nx-fx/$2" >/dev/null
}
probe() { # container case
  mkdir -p "$OUT/$2"
  docker exec -i -u nexus -w /home/nexus -e DOCKER_HOST="$SOCK" "$1" \
    sh -c 'LC_ALL=C sh -s' < "$PROBE" > "$OUT/$2/probe.txt"
  echo "captured $2 ($(wc -l < "$OUT/$2/probe.txt") lines)"
}

plain_ctr nx-fx-alpine alpine edge-01
probe nx-fx-alpine alpine-no-systemd

systemd_ctr nx-fx-u22 ubuntu-22.04 legacy-01
docker exec nx-fx-u22 touch /run/reboot-required
probe nx-fx-u22 ubuntu-22.04-no-docker

systemd_ctr nx-fx-deb12 debian-12 billing-staging
probe nx-fx-deb12 debian-12-docker-no-permission

systemd_ctr nx-fx-u24 ubuntu-24.04 fameo-prod
compose up -d --quiet-pull --wait web
probe nx-fx-u24 ubuntu-24.04-docker

compose up -d --quiet-pull crashy sick
sleep 15 # crashy cycles through restarts; sick fails its healthcheck
probe nx-fx-u24 container-restarting-unhealthy

plain_ctr nx-fx-al2023 amazonlinux-2023 shop-dev
docker exec -u nexus -w /home/nexus nx-fx-al2023 sh -c \
  'pm2 start api.js --name api >/dev/null && pm2 start worker.js --name worker --max-restarts 3 >/dev/null && sleep 5'
probe nx-fx-al2023 amazon-linux-2023-docker-pm2
