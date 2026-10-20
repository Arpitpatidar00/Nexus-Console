# One testbed server image (docs/remote/PLAN.md §8.3): sshd with key-only auth
# for user `nexus`, plus the probe's tools and the docker CLI. The daemon is
# the testbed's own dind service, never the Mac's Docker.
FROM docker:29-cli AS cli
FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      openssh-server procps iproute2 && rm -rf /var/lib/apt/lists/*
COPY --from=cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
RUN groupadd -g 2375 docker && useradd -m -s /bin/bash nexus \
 && passwd -l nexus \
 && mkdir -p /run/sshd \
 && printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/nexus.conf \
 # dind serves its socket in a shared volume; the CLI looks in the usual place.
 # Without that volume (nexus-dev) the link dangles, so docker reports "daemon down".
 && ln -s /var/run/dind/docker.sock /var/run/docker.sock
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]
