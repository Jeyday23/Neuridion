# Frozen recall release gate

This gate evaluates screening **recall**, not generic accuracy or F1. It is provider-neutral and separately measures the deterministic prefilter because a prefilter can discard a relevant record before any model sees it.

## Dataset contract

The input is a `FrozenAccuracyDataset` from `accuracy-gate.types.ts`. It must contain real, PRRC-adjudicated cases and an `expected_sha256` computed by `computeDatasetSha256`. The hash covers the canonical dataset with the hash field itself omitted. Any case, label, prediction, source, category, or metadata change invalidates the dataset.

No benchmark dataset is included in the repository. Release gating must not begin until a qualified PRRC dataset owner freezes and approves one.

Every evaluated provider/model must have a decision for every case. Results include Wilson 95% confidence intervals for overall recall and strata by source and device category. A baseline can be supplied per exact `provider/model`; a recall decrease beyond the configured tolerance blocks release.

The deterministic prefilter has its own recall target. A production model cannot compensate for relevant records that the prefilter failed to surface.

## Provider authority

Provider comparisons are observational. A result marked `shadow` always has `production_authority: false`, even if its recall is better. Promoting a shadow provider requires a separate, reviewed configuration change and a new gate run in production-candidate mode; benchmark code never changes routing automatically.

Temperature zero is not treated as reproducibility. Dataset hash, exact provider/model identity, and measured outputs are the evidence retained for comparison.

## Running the gate

```sh
npm run verify:accuracy -- --dataset /path/to/frozen-dataset.json --policy /path/to/approved-policy.json
```

Both files are required. Invalid JSON, unknown fields, a changed dataset hash,
incomplete provider predictions, missing strata, or unmet thresholds exit with
status 1. A passing result exits with status 0 and prints a report containing
both the dataset hash and the policy hash. Keep that report with release evidence.

The approved policy must specify the production provider/model, overall and
prefilter recall thresholds, maximum recall regression, minimum reviewer count
(at least two), minimum relevant cases overall and per stratum, a minimum Wilson
95% recall lower bound, minimum stratum recall, required sources, and required
device categories. The exact field names are defined in `accuracy-gate.types.ts`.
Apply sample floors and bounds to both the prefilter and model results. Choose
thresholds before evaluating a candidate; do not relax them to make it pass.

Functional safety patches still use the test/build/schema gates. Any model,
prompt, or screening-policy promotion additionally requires an approved frozen
dataset and a passing accuracy report. This command does not create ground
truth, certify clinical accuracy, or automatically promote a provider. The
synthetic unit-test cases are never production validation evidence.
