# MongoDB data-architecture patterns for CDISC evidence

These are the reusable decisions behind this solution, extracted so they can be
copied into another project without reading the application.

Each pattern is written to the same shape:

1. **Problem** — the workload situation that makes the decision necessary.
2. **Pattern** — the document shape, index set, or query contract.
3. **Why** — the specific property being bought.
4. **When *not* to use it** — the conditions that invalidate the pattern.
5. **In this repository** — where the working implementation lives.

The patterns assume CDISC SEND, but only [01](01-polymorphic-canonical-records.md)
and [06](06-immutable-evidence-and-solution-state.md) are standard-specific. The
rest apply to any regulated evidence workload that has an immutable source of
record and derived read models over it.

| # | Pattern | Buys you |
|---|---|---|
| 01 | [Polymorphic canonical records](01-polymorphic-canonical-records.md) | Additive domains, stable query contract, lossless source rows |
| 02 | [Authorization-first index prefixes](02-authorization-first-index-prefixes.md) | Selective access that cannot accidentally cross a tenant or snapshot |
| 03 | [Bounded retrieval projections](03-bounded-retrieval-projections.md) | Useful vector search without embedding every row |
| 04 | [Reconciled derived projections](04-reconciled-derived-projections.md) | A read model you can prove matches its source |
| 05 | [Rebuildable semantic projections](05-rebuildable-semantic-projections.md) | One governed release, many disposable serving shapes |
| 06 | [Immutable evidence vs. solution state](06-immutable-evidence-and-solution-state.md) | Agent output that can never contaminate source evidence |

## The single idea underneath all six

> Keep one canonical, losslessly recoverable representation of the source
> record. Derive every other shape from it, version the derivation, and treat
> the derived shapes as disposable.

The corollary that most implementations get wrong: **an LLM hypothesis is not an
enrichment of source evidence.** It is a versioned assertion that cites evidence
and belongs in separate, append-only solution state. See
[pattern 06](06-immutable-evidence-and-solution-state.md).

## Related design records

- [`docs/cdisc-document-model-decision.md`](../docs/cdisc-document-model-decision.md) — the full architecture review this was extracted from, including the comparison against openEHR RPS Dual and FHIR Clinical CDR.
- [`docs/atlas-indexes.md`](../docs/atlas-indexes.md) — the concrete Atlas Search and Vector Search definitions.
- [`docs/data-boundaries.md`](../docs/data-boundaries.md) — what is a runtime dependency and what is build-time enablement.
