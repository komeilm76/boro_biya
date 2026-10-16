# Database image: the vendor postgres:18.6 image plus two build-time security corrections
# (QA-101, QA-14, SEC-63).
#
# Why a wrapper: upstream tag rebuilds lag Debian security advisories — the pulled
# postgres:18.6 image still shipped perl-base 5.36.0-7+deb12u3 with three published CRITICAL
# fixes (CVE-2026-8376, CVE-2026-42496, CVE-2026-13221, fixed in 5.36.0-7+deb12u4). Waiting
# for the vendor rebuild leaves the gate red, and suppressing findings violates GOV-12/SEC-63,
# so the shipped layer applies every published OS security fix at build time.
#
# The PostgreSQL version pin stays exact (QA-101): the apt.postgresql.org (pgdg) repository is
# removed before upgrading, so an OS security upgrade can never pull a different PostgreSQL
# version. Binaries, PGDATA layout (/var/lib/postgresql/18/docker), entrypoint, and
# environment behaviour are the vendor image's, unchanged.
#
# gosu: the entrypoint's privilege-drop helper is a compiled Go binary in /usr/local/bin that
# apt cannot update. The official gosu 1.19 release binaries embed Go stdlib 1.24.6 (they are
# built FROM golang:1.24.6-trixie per tianon/gosu's own Dockerfile), which carries
# CVE-2025-68121 (crypto/tls certificate validation during session resumption; fixed in Go
# 1.24.13 / 1.25.7 / 1.26.0-rc.3, released 2026-02-04). No fixed upstream release exists, so
# the builder stage below rebuilds gosu from the checksum-pinned 1.19 source with a patched
# toolchain — upstream's own build recipe (CGO_ENABLED=0, -trimpath, -ldflags '-d -w'; no -s,
# keeping symbols for govulncheck per tianon/gosu SECURITY.md) — and smoke-tests it exactly as
# the vendor Dockerfiles do. The go.mod/go.sum-pinned dependency modules are the same versions
# the shipped binary already carries (proven clean by the image scan); only the stdlib changes.
FROM golang:1.26.9-bookworm AS gosu-builder

ARG GOSU_VERSION=1.19
# sha256 of https://codeload.github.com/tianon/gosu/tar.gz/refs/tags/1.19 (verified 2026-10-15)
ARG GOSU_SOURCE_SHA256=cd9719b775dbfedae53923c9b0dc792b66d42c51e0b36652ed6f747fbadc0164
ENV CGO_ENABLED=0

RUN set -eux; \
    curl -fsSL -o /tmp/gosu-source.tar.gz \
      "https://codeload.github.com/tianon/gosu/tar.gz/refs/tags/${GOSU_VERSION}"; \
    echo "${GOSU_SOURCE_SHA256}  /tmp/gosu-source.tar.gz" | sha256sum -c -; \
    mkdir -p /usr/src/gosu; \
    tar -xzf /tmp/gosu-source.tar.gz -C /usr/src/gosu --strip-components=1; \
    rm /tmp/gosu-source.tar.gz; \
    cd /usr/src/gosu; \
    go build -v -trimpath -ldflags '-d -w' -buildvcs=false -o /usr/local/bin/gosu .; \
    /usr/local/bin/gosu --version

FROM postgres:18.6

# Runs as the image's default root user — the vendor entrypoint itself drops privileges to
# `postgres` via gosu at runtime; adding a USER directive here would break initdb.
COPY --from=gosu-builder /usr/local/bin/gosu /usr/local/bin/gosu

RUN rm -f /etc/apt/sources.list.d/pgdg.list /etc/apt/sources.list.d/pgdg.sources \
  && apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/* \
  && chmod 0755 /usr/local/bin/gosu \
  && gosu --version \
  && gosu nobody true
