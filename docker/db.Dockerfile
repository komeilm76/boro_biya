# Database image: the vendor postgres:18.6 image plus Debian security updates applied at
# build time (QA-47, QA-14, SEC-63).
#
# Why a wrapper: upstream tag rebuilds lag Debian security advisories — the pulled
# postgres:18.6 image still shipped perl-base 5.36.0-7+deb12u3 with three published CRITICAL
# fixes (CVE-2026-8376, CVE-2026-42496, CVE-2026-13221, fixed in 5.36.0-7+deb12u4). Waiting
# for the vendor rebuild leaves the gate red, and suppressing findings violates GOV-12/SEC-63,
# so the single shipped layer applies every published OS security fix at build time.
#
# The PostgreSQL version pin stays exact (QA-47): the apt.postgresql.org (pgdg) repository is
# removed before upgrading, so an OS security upgrade can never pull a different PostgreSQL
# version. Binaries, PGDATA layout (/var/lib/postgresql/18/docker), entrypoint, gosu privilege
# drop, and environment behaviour are the vendor image's, unchanged.
FROM postgres:18.6

# Runs as the image's default root user — the vendor entrypoint itself drops privileges to
# `postgres` via gosu at runtime; adding a USER directive here would break initdb.
RUN rm -f /etc/apt/sources.list.d/pgdg.list /etc/apt/sources.list.d/pgdg.sources \
  && apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*
