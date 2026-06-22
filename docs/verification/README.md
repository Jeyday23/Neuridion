# Neuridion verification evidence

This folder is the entry point for scraper, search, PRRC, release, and security
verification. It intentionally contains no credentials, `.env.local` content,
patient data, or copied authority payloads.

## Contents

- [CURRENT_STATUS.md](./CURRENT_STATUS.md) — current verified scope, results,
  limitations, and release interpretation.
- [RUNBOOK.md](./RUNBOOK.md) — repeatable local and production checks.
- [EVIDENCE_INDEX.md](./EVIDENCE_INDEX.md) — locations of authoritative tests,
  benchmarks, deployment guidance, security findings, and compliance records.
- [RUN_2026-06-22.md](./RUN_2026-06-22.md) — dated results and limitations for
  the current PRRC and scraper verification run.

Existing authoritative documents remain in their original locations so links,
automation, and review history are not broken. This folder consolidates access
to that information rather than creating conflicting copies.

## Secret handling

`.env.local` is ignored by Git and must remain local. Production secrets belong
in the deployment provider's secret environment. Commands in this folder use
environment-variable placeholders and never contain secret values.
