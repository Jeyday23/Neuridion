# Regulatory evidence foundation

Migration 068 adds an append-only evidence path alongside the existing search
pipeline. It deliberately preserves two different identities:

- `fsn_canonical` is one record published by one authority.
- `regulatory_safety_actions` is a real-world corrective action that may be
  represented by several authority records.

`REGULATORY_EVIDENCE_CAPTURE=true` plus the explicit
`REGULATORY_EVIDENCE_SOURCES` allow-list records the exact canonical JSON emitted by
the current source adapter. These objects are labelled `adapter_output`. The
BfArM adapter additionally retains the exact HTML response bytes as private
`raw_response` objects; query values are replaced by a SHA-256 fingerprint in
the stored request locator. Other sources must still be described as adapter
output until their raw-response paths are implemented and validated.

## Integrity boundaries

- A new authority revision is created only when the captured source payload
  hash changes. Parser-version changes alone do not create source revisions.
- Basic UDI-DI identifies a device family, not a corrective action.
- Issuer/reference matches may be confirmed automatically only as a composite
  key. Fuzzy matches remain proposals requiring review.
- Current adapters do not expose a separately validated manufacturer-issued
  FSCA reference, so the capture bridge leaves `fsca_reference` null. Cross-source
  matching must remain inactive until each adapter provides that field with
  source-specific tests; regulator references are not silently repurposed.
- Database hash chains are tamper-evident, not independently tamper-proof.
  Stronger assurance requires protected storage retention and an external
  signed checkpoint.

## Retention and redaction

No blanket retention deadline is encoded. Retention and legal-hold decisions
are appended to `evidence_governance_events`. Redaction is performed by trusted
server code: it records the request, removes the private storage object, records
completion or failure, and writes the operator event to `audit_log`. The hash
and provenance row remain.

FDA adapter output is marked as potentially containing personal data. Enabling
capture therefore requires an approved retention and access-control policy plus
the separate `REGULATORY_EVIDENCE_ALLOW_SENSITIVE=true` gate.

## Rollout

1. Apply migration 068 and verify the bucket is private.
2. Keep `REGULATORY_EVIDENCE_CAPTURE=false` during deployment smoke tests.
3. Enable it in a non-production environment and verify append-only, revision,
   storage, and redaction behavior.
4. Enable one production source at a time through
   `REGULATORY_EVIDENCE_SOURCES` after retention approval.
5. For BfArM, verify that every captured fetch links both response artifacts and
   normalized record artifacts before treating the raw-evidence path as active.
