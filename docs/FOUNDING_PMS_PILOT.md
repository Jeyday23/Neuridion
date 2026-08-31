# Founding PMS Evidence Pilot

**Status:** DRAFT DELIVERY SPECIFICATION  
**Owner:** [ASSIGN]  
**Required approval before customer use:** Product, qualified QA/RA and legal  
**Commercial terms:** Defined only in the signed order form or statement of work

## 1. Objective

Deliver a paid, service-led post-market surveillance screening engagement for
one agreed medical-device family while Neuridion is operated as a supporting
tool. The engagement is designed to produce review-ready evidence and learn from
real customer workflow. It does not transfer the manufacturer's regulatory
responsibility to Neuridion and does not represent autonomous PMS.

## 2. Entry criteria

Do not start an operational cycle until the parties have approved:

- legal manufacturer, device family, models/variants and markets in scope;
- controlled IFU and any other device evidence permitted for the engagement;
- named PMS procedure, source universe, date range and monitoring frequency;
- customer system owner and authorized qualified reviewer(s);
- relevance, escalation and serious-event handling rules;
- data-processing, confidentiality, retention and security terms;
- deliverables, acceptance criteria, timelines and change procedure; and
- a fallback process for unavailable, degraded or unsupported sources.

Neuridion does not infer the customer's complete PMS source universe from the
product configuration. Unsupported sources remain customer responsibilities
unless the statement of work assigns a documented manual service.

## 3. Proposed initial scope

The default commercial proposal is one device family over three surveillance
cycles. The signed statement of work may change that scope. Each cycle includes:

1. freeze the approved device-evidence and configuration baseline;
2. retrieve records from the agreed supported public sources;
3. inspect source status, warnings, failures and coverage boundaries;
4. perform device-specific, AI-assisted screening;
5. prepare record-level system output and evidence for customer review;
6. capture authorized human dispositions, rationales and required second review;
7. obtain customer approval of the operational regulatory record; and
8. deliver the agreed report and machine-readable evidence-chain export.

All customer-facing reports remain controlled drafts until the customer's
authorized approval procedure is complete.

## 4. Responsibility model

| Activity | Neuridion service team | Manufacturer/customer | Authorized reviewer/PRRC |
| --- | --- | --- | --- |
| Configure agreed supported sources and device baseline | Perform and document | Provide/approve | Review as assigned |
| Run screening and investigate system/source warnings | Perform and disclose | Informed/escalate internally | Review material issues |
| Propose record relevance | Prepare advisory output | Define procedure | Decide under procedure |
| Decide reportability, vigilance action, FSCA or other action | No authority | Accountable | Perform/approve as assigned |
| Supply missing internal PMS sources | No duty unless contracted | Accountable | Confirm completeness |
| Validate Neuridion use in the customer QMS | Provide supplier evidence/templates | Accountable | Participate as assigned |
| Preserve required records | Provide contracted exports/retention | Accountable | Verify decision record |

Calling a user a PRRC in the platform does not establish Article 15
qualification, appointment or authorization. The customer must document those
facts under its own procedures.

## 5. Human-review and validation controls

- The final post-reveal disposition is the operational regulatory record.
- A pre-registered 10–20% blind-first arm, or another approved fraction, may be
  used to capture an independent provisional human judgment before AI reveal.
- A provisional `relevant` disposition changed to `excluded` after AI reveal
  requires explicit written rationale.
- Serious-event exclusions and material relevant-to-excluded changes require a
  second qualified reviewer when configured by the approved procedure.
- Sampled exclusions retain the inclusion probability, policy/version, stratum,
  selection reason and timestamp recorded at selection time.
- Synthetic canaries use a Neuridion-owned profile through the production code
  path and must be technically excluded from every customer query and export.

Canaries and targeted sampling are monitoring controls; they are not by
themselves estimates of sensitivity. No accuracy percentage may be inferred
from agreement on surfaced records alone.

## 6. Customer time and information request

The proposal should minimize customer burden but must not conceal it. Plan for:

- one onboarding and evidence-baseline session;
- review time for surfaced and sampled records in each cycle;
- prompt clarification of device identity, variants and risk context;
- final approval or documented rejection of each cycle; and
- a close-out discussion on audit questions, defects and workflow fit.

Request redacted notified-body questions or prior audit findings only where the
customer is permitted and willing to share them. They are useful inputs, not a
mandatory condition of participation.

## 7. Deliverables

- approved engagement scope and configuration baseline;
- source coverage/status record for each cycle;
- record-level original system output and human decision history;
- controlled draft PMS screening report in the contracted format;
- versioned machine-readable evidence-chain export and verification guidance;
- issue/deviation register with disposition;
- end-of-pilot findings and prioritized product requirements; and
- release-specific supplier assurance material available at that time.

The supplier assurance pack is supporting evidence and a customer-completion
template. It is not a validation summary for the customer's QMS and must not be
represented as one.

## 8. Success measures

Pre-register commercial and operational measures before starting. Recommended
measures include:

- all contracted cycles delivered and accepted on time;
- zero unresolved source failures or unexplained degraded outcomes at approval;
- all required records have an authorized final disposition and rationale;
- all required second reviews completed before controlled release;
- evidence export reconstructed outside Neuridion using the agreed instructions;
- reviewer time and system-overturn patterns measured without converting them
  into unsupported accuracy claims; and
- a documented customer decision to continue, expand, pause or stop.

## 9. Continuity and exit

The statement of work must define what the customer receives if the pilot ends
or Neuridion becomes unavailable. At minimum, agree the export timing, format,
schema/version, evidence references or permitted source copies, hashes, device
evidence versions, system and human decisions, identities, timestamps, sampling
facts, warnings and offline verification instructions.

Any post-termination access period, transition service, escrow, insolvency
assistance or additional retention promise exists only if stated in the signed
agreement. The customer should test the exit package before accepting the final
cycle.

## 10. Stop conditions

Pause the engagement and escalate when:

- required customer evidence or reviewer authorization is absent;
- an agreed source is unavailable without an approved fallback;
- the released configuration differs from the approved baseline;
- a serious-event or possible reportability question exceeds the contracted
  decision process;
- a security, privacy or tenant-isolation concern is identified; or
- a customer requests Neuridion to make or sign the regulatory decision on its
  behalf outside an approved professional-service scope.

## 11. Approval

| Approval | Name/role | Decision | Date/signature |
| --- | --- | --- | --- |
| Neuridion product owner | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Neuridion QA/RA | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Neuridion legal | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Customer system owner | [ENTER] | [ACCEPT/REJECT] | [ENTER] |
| Customer authorized regulatory approver | [ENTER] | [ACCEPT/REJECT] | [ENTER] |
