# Remote probe fixtures

Real `probe.sh` output, one folder per case, read by the tests in
`src-tauri/src/remote/probe.rs`. Recapture with
`sh scripts/remote-testbed/capture/capture.sh` (needs a running Docker; everything
runs on a throwaway dind daemon, so nothing from the host's own Docker appears).

Each case is a container, so `disk` shows the container's bind mounts rather than a
server's partitions, and kernels are `linuxkit`. Every other section is the
distro's real tool output, captured as a non-root `nexus` user.

| case                             | what it covers                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `ubuntu-24.04-docker`            | systemd + dbus, docker OK (user in `docker` + `adm`), one healthy compose container, a failed unit, journal errors |
| `ubuntu-22.04-no-docker`         | no docker, reboot required, user can't read the system journal                                                     |
| `debian-12-docker-no-permission` | docker CLI present, user not in the `docker` group                                                                 |
| `amazon-linux-2023-docker-pm2`   | no systemd as PID 1, PM2 with one online and one errored app                                                       |
| `alpine-no-systemd`              | busybox only: no systemd, journald, ss, docker or pm2                                                              |
| `container-restarting-unhealthy` | `crashy` restarting, `sick` unhealthy, `web` healthy                                                               |
| `disk-96pct`                     | **edited**: `ubuntu-24.04-docker` with only the `df` row changed to 96 % used                                      |
