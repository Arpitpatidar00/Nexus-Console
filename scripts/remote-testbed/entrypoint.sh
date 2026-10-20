# Install the testbed key for `nexus` (copied, so sshd's StrictModes sees the
# right owner), optionally grant docker access, then run sshd in the foreground.
set -eu
install -d -m 700 -o nexus -g nexus /home/nexus/.ssh
install -m 600 -o nexus -g nexus /keys/id_ed25519.pub /home/nexus/.ssh/authorized_keys
if [ "${NEXUS_DOCKER_GROUP:-}" = 1 ]; then usermod -aG docker nexus; fi
exec /usr/sbin/sshd -D -e
