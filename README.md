# Neuridion

Neuridion is an AI-assisted post-market surveillance (PMS) screening and
decision-record platform for medical-device manufacturers and their regulatory
teams. It retrieves public safety records from supported regulatory sources,
assesses their potential relevance to a customer-defined device profile, and
preserves the evidence, system output, human disposition, and export history.

Neuridion supports qualified people; it does not make a final regulatory
determination. The manufacturer remains responsible for defining its PMS scope,
validating the software for its intended use within its quality management
system, reviewing source evidence, deciding relevance and reportability, and
approving regulatory action.

This README describes the repository release candidate. It does not establish
which migrations, features, sources, schedules, or controls are active in a
particular deployment. Verify the deployed build and remote migration state
before relying on any capability.

## Repository product scope

| Capability | Current scope |
| --- | --- |
| Public-source retrieval | BfArM, FDA MAUDE, MHRA, and Swissmedic adapters |
| Screening | Device-profile matching and AI-assisted `relevant`, `uncertain`, or `excluded` output with rationale |
| Human control | Record-level human dispositions, rationale and qualification attestations; selected records can use blind-first and independent second-review controls |
| Validation controls | Immutable exclusion-sampling metadata and production-parity synthetic-canary isolation foundations |
| Evidence | Source-specific provenance, hashing, revision tracking, append-only system/human decisions, and controlled-evidence foundations |
| Exports | PDF, Word and Excel reports plus a versioned machine-readable evidence-chain export |
| Scheduled ingestion | Infrastructure is present but activation, source allow-listing, and production verification are deployment-specific |

The four supported databases are not a complete PMS system. Scientific
literature, complaints, service data, distributor/importer feedback, registries,
internal quality records, and any additional sources required by the
manufacturer's PMS plan remain outside this product scope unless explicitly
integrated.

## Known boundaries

- AI output can contain false positives and false negatives. Confidence values
  are model estimates, not calibrated probabilities or accuracy guarantees.
- Source completeness and timeliness depend on the upstream authority, adapter,
  configured date range, and operational status of each ingestion path.
- A successful search does not establish that every relevant safety record was
  found. Warnings, degraded runs, failed classifications, and source coverage
  must be reviewed.
- Uploaded or linked controlled documents only affect classification where the
  active pipeline explicitly extracts, versions, and supplies that evidence.
- Neuridion does not submit vigilance reports, determine reportability, initiate
  an FSCA, or replace the manufacturer's QMS, PRRC, regulatory function, or
  professional judgment.
- Qualification and validation are use- and customer-specific. Repository tests
  and supplier evidence support, but do not replace, the customer's validation
  under its own procedures.

See the draft [Supplier Assurance Pack](docs/compliance/supplier-assurance-pack.md)
for intended-use controls, validation responsibilities, release evidence,
acceptance testing, continuity, and exit planning.

## Service-led founding pilot

The recommended first-customer motion is a scoped service engagement, not an
unqualified claim that the software autonomously performs PMS. Neuridion staff
can operate the screening workflow for one agreed device family and deliver
review-ready evidence over a small number of cycles. The manufacturer defines
the source universe and procedure, supplies approved device evidence, assigns
qualified reviewers, owns the final regulatory disposition, and approves every
downstream action.

The pilot is intended to generate paid operational output, customer-specific
requirements, bounded validation evidence, and real audit questions. It is not a
substitute for the customer's PMS process or validation of Neuridion in the
customer's QMS. See the [Founding PMS Evidence Pilot](docs/FOUNDING_PMS_PILOT.md)
delivery specification.

## Architecture

```text
Authority sources
    -> source adapters and completeness contracts
    -> canonical records and evidence revisions
    -> deterministic matching and AI-assisted screening
    -> human review and approval
    -> controlled report/export
```

Primary technologies:

- Next.js 16, React 19, and TypeScript
- Supabase Auth, PostgreSQL, Row Level Security, and private storage
- Anthropic models for AI-assisted screening
- QStash/Upstash for worker dispatch and rate limiting
- React PDF, DOCX, and ExcelJS for controlled exports
- Stripe and Resend for billing and transactional email

## Local development

### Prerequisites

- Node.js compatible with Next.js 16
- npm
- A Supabase project or suitable local test configuration
- Service credentials for the integrations exercised locally

Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

Environment requirements and production checks are documented in
[`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md). Do not place real
credentials in committed files.

## Verification

Run the local static gates:

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
```

Additional bounded verification commands:

```bash
npm run benchmark:reviewed-pms
npm run verify:release
npm run verify:source-parity:all
```

Some commands require live credentials, paid APIs, or production access. A unit
test, build, benchmark fixture, or successful source request is evidence only for
the scope tested; none is a universal accuracy or production-readiness claim.

Recorded verification evidence lives in [`docs/verification/`](docs/verification/).
Read the date, release identifier, configuration, dataset scope, skipped checks,
and limitations in the selected run before citing it. Do not copy historical
test counts or benchmark results into current product claims.

## Database and deployment

Numbered SQL migrations live in `supabase/migrations/` and must be applied in
order through the controlled migration workflow. Never infer the production
schema from repository files alone; verify remote migration state before
deployment.

The repository uses the following release flow:

```text
feature/* or fix/* or chore/* -> dev -> staging -> main
```

Do not push directly to protected branches. The working branch should start from
`dev`, and changes should reach `dev` through review.

## Compliance-document status

Materials in `docs/compliance/` are working drafts unless their document control
section says otherwise. They are not legal opinions, certificates, or evidence
that a customer's QMS use has been validated. Qualified quality/regulatory review
and, where appropriate, legal review are required before external reliance.

## Security

Report suspected vulnerabilities privately to `info@neuridion.eu`. Do not open a
public issue containing credentials, customer information, or exploit details.
