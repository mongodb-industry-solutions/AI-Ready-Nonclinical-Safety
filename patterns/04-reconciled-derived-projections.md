# 04 · Reconciled derived projections

## Problem

Every dashboard over regulated data is a derived read model, and derived read
models drift. The usual answer — "we recompute nightly" — does not survive the
question a reviewer actually asks:

> This chart says 7 of 10 animals. Prove that came from the source rows, and
> tell me which version of the rule produced it.

Worse is the common shortcut: hand-authoring a second, "presentation" dataset
alongside the canonical import. Now there are two sources of truth and no way to
tell which is wrong.

## Pattern

Derive the read model **deterministically from canonical rows**, and make the
derivation self-describing. Every projection carries:

1. **Exact source record IDs and hashes** for the rows it consumed.
2. **A digest of its own content**, so tampering is detectable.
3. **Versioned projection rule IDs** — which rule turned rows into a business signal.
4. **A reconciliation receipt** against the source package's declared counts.

```typescript
provenance: {
  derivedAt: string;
  method: string;
  evidencePackageId?: string;
  evidencePackageDigest?: { algorithm: 'sha256'; value: string };
  projectionVersion?: string;
  projectionDigest?: { algorithm: 'sha256'; value: string };
  projectionRuleIds?: string[];
  reconciliation?: {
    status: 'reconciled';
    canonicalRecordCount: number;
    projectedDomainCounts: Record<string, number>;
    animalCount: number;
    checks: {
      domainCountsMatch: boolean;
      recordCountMatches: boolean;
      subjectCountMatches: boolean;
    };
  };
}
```

The importer recomputes the package SHA-256, verifies every manifest count, and
only then derives the projection. **There is no manually supplied second data
model in connected mode.**

The same honesty rule extends to query execution. A pipeline that was *declared*
is never presented as one that *executed* — each stage reports
`executed` / `fallback` / `skipped` with the collection, predicate, result count
and duration that actually occurred:

```typescript
interface DataQueryTrace {
  id: string;
  source: 'mongodb' | 'portable-bundle';
  collection: string;
  operation: 'find' | 'findOne' | 'fixture-read';
  predicate: Record<string, unknown>;
  status: 'executed' | 'fallback' | 'skipped';
  resultCount: number;
  durationMs: number;
}
```

## Why

- A number on screen can be walked back to the rows that produced it *and* to
  the rule version that shaped it.
- Rebuilds are safe: the projection is disposable because canonical rows are
  authoritative.
- Changing a business rule is a versioned event, not a silent recalculation.
- Degraded retrieval is visible instead of being disguised as a successful answer.

## When *not* to use it

- **Cheap, non-decision-bearing aggregates** — a homepage counter does not need a
  reconciliation receipt.
- **When the projection is the source of truth** (user-authored content). Then it
  is not derived, and this pattern does not apply.
- **When rules change faster than they can be versioned.** Exploratory analytics
  should live in a notebook against canonical rows, not in a governed projection.

## A scaling caveat this repository has not yet addressed

`study_evidence` is currently one document per study, holding signals, dose
groups and laboratory series as embedded arrays. That is fine as a bounded UI
cache at demonstration scale, and wrong at production scale.

For a large programme, signals, subject timelines and measurement series should
become independently pageable projections rather than unbounded arrays inside a
single document. The 16 MB document limit is the hard stop; working-set pressure
arrives well before it.

## In this repository

- Projector: [`scripts/lib/study-evidence-projector.mjs`](../scripts/lib/study-evidence-projector.mjs) with tests in [`tests/study-evidence-projector.test.mjs`](../tests/study-evidence-projector.test.mjs)
- Verification and reconciliation: [`scripts/import-study.mjs`](../scripts/import-study.mjs)
- Contracts: [`lib/contracts.ts`](../lib/contracts.ts)
- Execution telemetry: [`lib/data/evidence-repository.ts`](../lib/data/evidence-repository.ts) (`tracedRead`)
