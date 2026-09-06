# Context Studio semantic-runtime export

Status: implemented reference contract

The public solution launches with semantic packages at version `1.0.0`. The
internal `runtime-bundle/v2` and `cdisc-solution-evidence/v2` identifiers are
compatibility markers for the underlying envelopes; they are not product or
library names.

## Export boundary

Context Studio authors and validates semantic modules. The deployed solution
does not call Context Studio. It imports one immutable, content-addressed runtime
bundle compiled from:

- `org.contextobjects.cdisc-core@1.0.0` — CDISC study, subject, treatment,
  observation, measurement, relationship, terminology, and artifact meaning;
- `org.contextobjects.nonclinical-safety@1.0.0` — safety archetypes, profiles,
  capabilities, resolvers, actions, and presentation contracts;
- `org.contextobjects.persistence.mongodb-cdisc@1.0.0` — logical-to-physical
  bindings, indexes, and rebuild recipes for the current CDISC record envelope.

The checked-in [`contextstudio-workspace.json`](../semantic/contextstudio-workspace.json)
is the portable workspace manifest. `npm run compile:semantics` resolves its
modules, validates object and resolver references, checks data-contract
compatibility, computes module and bundle digests, and writes the deployable
[`nonclinical-safety-runtime.json`](../semantic/nonclinical-safety-runtime.json).

## Why an envelope change does not rewrite meaning

The semantic core refers to logical properties such as `Finding`, `Subject`, and
`StudyPhase`. It contains no MongoDB paths. The persistence module binds those
objects to `canonical`, `_control`, `_index`, `_enrichment`, and `_provenance`.
Changing a physical envelope therefore requires a new persistence-module release
and recompilation, but not a new definition of the scientific concepts.

Activation fails unless the runtime requires the same `dataContract` and
`modelSchemaVersion` as the imported evidence. The solution materializes the
active bundle into `semantic_resources`, `semantic_edges`, and
`semantic_search_documents`; these are disposable serving projections. The
bundle in `semantic_releases` remains semantic authority.

## Query contracts

The release carries three inspectable contracts:

1. **Operational evidence** — exact filters and aggregations over one tenant,
   study, snapshot, domain, subject, endpoint, and time scope.
2. **Semantic context** — profile-filtered terminology and value-set resolution,
   archetype containment, graph traversal, and logical-to-physical binding.
3. **Research evidence** — lexical and Atlas Automated Embedding candidate
   retrieval, graph expansion, reciprocal-rank fusion, domain reranking, and
   deterministic evidence hydration.

Vector retrieval never defines a cohort or calculates a safety statistic. Every
answer returns the actual operations that ran, their predicates, result counts,
latency, and MongoDB explain statistics when permitted.

## Activation lifecycle

```text
author modules
  → compile and lint
  → verify data-contract compatibility
  → run golden queries
  → import immutable semantic release
  → rebuild serving projections
  → atomically move semantic_runtime_pointer
  → publish a resumable semantic change event
```

Updates create a new release. Existing releases are not modified in place. A
Change Stream event carries the new release id and digest; clients refresh the
profile-scoped map after the active pointer changes.

