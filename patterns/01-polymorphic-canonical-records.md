# 01 · Polymorphic canonical records

## Problem

CDISC SEND splits a study across domains — `DM` (demographics), `TX` (trial
sets), `MI` (microscopic findings), `LB` (laboratory), `BW`, `OM`, and more. Each
domain has a different column set, and new domains appear as a programme matures.

The obvious modelling choices both fail:

- **One collection per domain** gives you a dozen collections that must be joined
  for the query users actually ask ("show me everything about animal 5004"), and
  every new domain is a schema-and-code change.
- **A normalised relational shape** loses the exact source row, which is the one
  thing a regulated workload cannot lose.

## Pattern

One polymorphic collection, `cdisc_records`, holding one document per source
row, with five explicitly separated namespaces:

```javascript
{
  _id: "<tenant/study/snapshot/dataset/row identity>",

  // 1. The lossless CDISC row. Never application-modified.
  canonical: {
    standard: { family: "SEND", implementationGuide: "SENDIG", version: "3.0" },
    domain: "MI",
    rowOrdinal: 42,
    recordKey: { STUDYID: "...", USUBJID: "...", MITESTCD: "..." },
    data:      { STUDYID: "...", USUBJID: "...", MISTRESC: "...", MISEV: "..." }
  },

  // 2. Authorization and lifecycle. Drives every index prefix.
  _control: {
    tenantId: "...", studyId: "...", snapshotId: "...",
    publicationState: "published",
    modelSchemaVersion: "2.0.0",
    evidencePackageId: "..."
  },

  // 3. Derived, deterministic access paths. Rebuildable.
  _index: {
    facets: { subjectId: "...", organ: "THYMUS", finding: "...", studyDay: 29 },
    entityRefs: [{ type: "animalSubject", id: "..." }],
    semanticText: "MI | organ THYMUS | finding decreased lymphocytes",
    projectionVersion: "..."
  },

  // 4. Reviewed additions that share the row's lifecycle. Never LLM output.
  _enrichment: { terminologyBindings: [], reviewedAssertions: [] },

  // 5. Where the row came from and how to prove it.
  _provenance: {
    sourceArtifactId: "...", sourceDatasetId: "...",
    sourceRow: 42, recordHash: "sha256:..."
  }
}
```

The `domain` field is the discriminator. Underscore-prefixed namespaces are
application concerns and **must never appear in a CDISC export** — a serializer
can always recover the exact canonical row from `canonical`.

Sparse by rule: omit optional properties rather than storing `null`, `[]`, or
`{}`. Explicit values including `0`, `false`, `UNK` and `NA` are retained,
because in CDISC those *are* data. Column order and definitions live in the
dataset metamodel, not in every row.

## Why

- **New domains are additive.** Loading `BW` or `OM` requires no new collection,
  no new index family, and no application change.
- **The physical query contract is stable.** Cross-domain queries within a
  study/subject scope — which is what this workload actually does — stay in one
  collection.
- **The source row survives.** `canonical.data` plus `_provenance.recordHash`
  means any derived number can be traced back and re-verified.
- **Derived data is visibly derived.** Anyone reading a document can tell in one
  glance which fields are authoritative and which are rebuildable.

## When *not* to use it

- **When queries almost always start from the type**, and you want direct
  serialization per type. That is the FHIR Clinical CDR situation, and one
  collection per resource type is the better answer there.
- **When domains have genuinely different authorization or retention rules.**
  The shared `_control` prefix assumes one policy boundary per study snapshot.
- **When a single domain dwarfs the others by orders of magnitude** and needs its
  own sharding or tiering strategy. Split that domain out; keep the rest polymorphic.
- **Do not extend this to objects with a different lifecycle.** Study snapshots,
  validation runs, business aggregates, document chunks, agent traces and
  semantic releases are separate collections. One *record* collection, not one
  *everything* collection.

## In this repository

- Shape and rationale: [`docs/cdisc-document-model-decision.md`](../docs/cdisc-document-model-decision.md)
- Import and upsert: [`scripts/import-study.mjs`](../scripts/import-study.mjs)
- Reads: [`lib/data/evidence-repository.ts`](../lib/data/evidence-repository.ts)
- Package contract: [`contracts/cdisc-solution-evidence-v2.schema.json`](../contracts/cdisc-solution-evidence-v2.schema.json)
