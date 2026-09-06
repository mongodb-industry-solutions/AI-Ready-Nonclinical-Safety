# 02 · Authorization-first index prefixes

## Problem

A polymorphic collection ([pattern 01](01-polymorphic-canonical-records.md)) is
only workable if access stays selective. The failure mode is subtle: an index
designed around the *query* rather than the *authorization boundary* lets a
mistyped or malicious filter scan across studies, snapshots, or tenants before
the predicate narrows it.

In a regulated workload that is not merely slow — it is a data-segregation
incident.

## Pattern

Every principal index begins with the authorization and immutability scope, and
only then adds the workload discriminator:

```javascript
// Domain browse: "show me the MI rows for this snapshot, in source order"
{ "_control.tenantId": 1, "_control.studyId": 1, "_control.snapshotId": 1,
  "canonical.domain": 1, "canonical.rowOrdinal": 1 }

// Subject hydration: "everything about animal 5004, across domains, over time"
{ "_control.tenantId": 1, "_control.studyId": 1, "_control.snapshotId": 1,
  "_index.facets.subjectId": 1, "canonical.domain": 1, "_index.facets.studyDay": 1 }

// Finding lookup: "which animals show this organ/morphology pair"
{ "_control.tenantId": 1, "_control.studyId": 1, "_control.snapshotId": 1,
  "_index.facets.organ": 1, "_index.facets.finding": 1 }
```

Three rules:

1. **Prefix order is scope → discriminator → sort/range.** Never the reverse.
2. **Domain-specific indexes are partial and workload-led.** Do not create an
   index per CDISC variable; create one when a query pattern earns it.
3. **Shard on tenant and study identity** when a deployment outgrows one replica
   set — the same prefix that enforces authorization also gives a good shard key.

Because the prefix is mandatory, a query that forgets the scope does not quietly
fall back to a collection scan with a late filter — it is visibly unindexed in
`explain()`, which makes the mistake findable in review and in CI.

## Why

- The narrowest, most security-relevant predicate is always used first.
- One index family serves browse, hydrate, and lookup, instead of one index per
  screen.
- Snapshot-bound reads are free: `snapshotId` in the prefix is what makes
  "this answer came from exactly this published snapshot" cheap to guarantee.

## When *not* to use it

- **Single-tenant, single-study tools.** The tenant prefix is dead weight; start
  at `studyId`.
- **Cross-study analytics** — portfolio comparison, historical controls. Those
  legitimately need to read across the scope boundary, and they should run
  against a purpose-built projection ([pattern 03](03-bounded-retrieval-projections.md)),
  not against `cdisc_records` with the prefix dropped.
- **Very low-cardinality leading fields.** If you have one tenant and one study,
  a three-field constant prefix just inflates the index.

## In this repository

The live index set is created at import time in
[`scripts/import-study.mjs`](../scripts/import-study.mjs):

```javascript
await database.collection('cdisc_records').createIndexes([
  { key: { studyId: 1, snapshotId: 1, domain: 1, rowOrdinal: 1 }, name: 'record_domain_order' },
  { key: { studyId: 1, snapshotId: 1, 'facets.subjectId': 1, domain: 1 }, name: 'subject_evidence' },
  { key: { studyId: 1, snapshotId: 1, 'facets.organ': 1, 'facets.finding': 1 }, name: 'finding_evidence' },
  { key: { studyId: 1, snapshotId: 1, 'facets.testCode': 1, 'facets.studyDay': 1 }, name: 'laboratory_evidence' },
]);
```

> **Note on the current implementation.** The shipped v1 shape keeps control,
> identity and derived fields at the document root (`studyId`, `facets.organ`),
> so the index keys above omit the `_control` / `_index` prefixes shown in
> pattern 01. The namespaced v2 envelope is the target shape; the prefix
> *ordering* rule is identical either way.
