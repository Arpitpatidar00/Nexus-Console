# Nexus Remote probe (docs/remote/PLAN.md §4.5). Piped to `sh -s` over ssh.
# Read-only: never sudo, never writes outside one mktemp file for stderr.
# Each section starts with `@@NX:<name>@@`; a missing tool prints
# `@@NX:<name>:absent@@`; a tool that failed prints `@@NX:<name>:error@@` and
# its first stderr line. `@@NX:end@@` marks a complete run.
LC_ALL=C
export LC_ALL
E=$(mktemp 2>/dev/null || echo "/tmp/nx-probe.$$")
trap 'rm -f "$E"' EXIT
if command -v timeout >/dev/null 2>&1; then T="timeout 5"; else T=""; fi

have() { command -v "$1" >/dev/null 2>&1; }
absent() { echo "@@NX:$1:absent@@"; }

# run <section> <cmd...> — failure means a non-zero exit with no stdout.
run() {
  s=$1
  shift
  out=$($T "$@" 2>"$E")
  rc=$?
  if [ "$rc" -ne 0 ] && [ -z "$out" ]; then
    echo "@@NX:$s:error@@"
    if [ "$rc" -eq 124 ]; then echo "timed out"; else head -n 1 "$E"; fi
    return 1
  fi
  echo "@@NX:$s@@"
  [ -n "$out" ] && printf '%s\n' "$out"
  return 0
}

echo "@@NX:meta@@"
echo "hostname=$(uname -n)"
echo "uname=$(uname -srm)"
echo "now=$(date -u +%s)"
cat /etc/os-release 2>/dev/null

echo "@@NX:uptime@@"
echo "uptime=$(cat /proc/uptime)"
echo "loadavg=$(cat /proc/loadavg)"
if have nproc; then echo "nproc=$(nproc)"; else echo "nproc=$(grep -c '^processor' /proc/cpuinfo)"; fi

echo "@@NX:cpu@@"
head -n 1 /proc/stat
sleep 0.5 2>/dev/null || sleep 1
head -n 1 /proc/stat

echo "@@NX:mem@@"
cat /proc/meminfo

# busybox df has no -x; the parser drops pseudo filesystems either way.
if df -P -k -x tmpfs -x devtmpfs -x overlay -x squashfs >/dev/null 2>&1; then
  run disk df -P -k -x tmpfs -x devtmpfs -x overlay -x squashfs
else
  run disk df -P -k
fi

echo "@@NX:reboot@@"
if [ -f /var/run/reboot-required ]; then echo yes; else echo no; fi

if ! have docker; then
  absent docker
elif run docker docker version --format '{{.Server.Version}}'; then
  run containers docker ps -a --no-trunc --format '{{json .}}'
  ids=$(docker ps -aq 2>/dev/null)
  if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    run inspect docker inspect --format '{{.Id}} {{.RestartCount}} {{json .HostConfig.RestartPolicy.Name}} {{json .State}}' $ids
    run stats docker stats --no-stream --format '{{json .}}'
  fi
  if docker compose version >/dev/null 2>&1; then
    run compose docker compose ls -a --format json
  else
    absent compose
  fi
fi

# systemctl can exist without systemd running (containers): check PID 1's dir.
if have systemctl && [ -d /run/systemd/system ]; then
  run units systemctl list-units --type=service --state=running --no-legend --plain --no-pager
  run failed systemctl --failed --no-legend --plain --no-pager
else
  absent units
  absent failed
fi

if have pm2; then run pm2 pm2 jlist; else absent pm2; fi

if have ss; then run ports ss -H -tlnp; else absent ports; fi

# Without adm/systemd-journal membership journalctl silently shows only the
# user's own entries; report that as an error instead of a misleading zero.
if have journalctl && [ -d /run/systemd/system ]; then
  jerr=$(journalctl -q -n 1 --no-pager 2>&1 >/dev/null)
  case "$jerr" in
    *"not seeing messages"* | *"insufficient permissions"* | *"No journal files"*)
      printf '@@NX:oom:error@@\nno permission to read the system journal\n'
      printf '@@NX:errors:error@@\nno permission to read the system journal\n'
      ;;
    *)
      run oom sh -c "journalctl -k --since -24h --no-pager -q 2>/dev/null | grep -c -i 'out of memory' || true"
      run errors sh -c "journalctl -p err --since -1h --no-pager -q -o short-iso 2>/dev/null | tail -n 50"
      ;;
  esac
else
  absent oom
  absent errors
fi

echo "@@NX:end@@"
