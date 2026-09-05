# CDISC document model and semantic-map foundation

Status: accepted architecture review  
Scope: Kehrnel evidence packages and the deployed nonclinical-safety solution

## Decision

Use one polymorphic `cdisc_records` collection for row-level CDISC evidence. Each
MongoDB document is one self-contained evidence object with five explicit
namespaces:

```javascript
{
  _id: "<stable study/snapshot/dataset/row identity>",
  canonical: {
    standard: { family: "SEND", implementationGuide: "SENDIG", version: "3.0" },
    domain: "MI",
    rowOrdinal: 42,
    recordKey: { STUDYID: "...", USUBJID: "...", MITESTCD: "..." },
    data: { STUDYID: "...", USUBJID: "...", MITESTCD: "...", MISTRESC: "..." }
  },
  _control: {
    tenantId: "...",
    studyId: "...",
    snapshotId: "...",
    publicationState: "published",
    modelSchemaVersion: "2.0.0",
    evidencePackageId: "..."
  },
  _index: {
    facets: { subjectId: "...", organ: "...", finding: "...", studyDay: 29 },
    entityRefs: [{ type: "animalSubject", id: "..." }],
    semanticText: "MI | organ THYMUS | finding ...",
    projectionVersion: "..."
  },
  _enrichment: {
    terminologyBindings: [],
    reviewedAssertions: []
  },
  _provenance: {
    sourceArtifactId: "...",
    sourceDatasetId: "...",
    sourceRow: 42,
    recordHash: "sha256:..."
  }
}
```

`canonical` is the lossless operational representation of a CDISC row. The
checksum-pinned XPT and Define-XML artifacts remain the byte-level source evidence.
Underscore namespaces are application concerns and must never leak into a CDISC
export. This is one logical evidence object, but it does not mean every object type
or lifecycle belongs in one collection.

## Why one record collection

CDISC workloads commonly move across domains inside one study and subject scope.
A polymorphic collection makes new domains additive and keeps the physical query
contract stable. The domain discriminator plus compound indexes provide selective
access without creating and operating dozens of collections.

The principal indexes should begin with the authorization and immutable evidence
scope, followed by the workload discriminator:

- `_control.tenantId`, `_control.studyId`, `_control.snapshotId`,
  `canonical.domain`, `canonical.rowOrdinal`;
- `_control.tenantId`, `_control.studyId`, `_control.snapshotId`,
  `_index.facets.subjectId`, `canonical.domain`, `_index.facets.studyDay`;
- `_control.tenantId`, `_control.studyId`, `_control.snapshotId`,
  `_index.facets.organ`, `_index.facets.finding`.

Large deployments can shard by tenant and study identity. Domain-specific indexes
should be partial and workload-led rather than created for every possible variable.

## What belongs beside the record

Embed data when it has the same identity, authorization boundary and practical
lifecycle as the row:

- deterministic search facets;
- entity references;
- terminology bindings used to interpret the row;
- compact, reviewed enrichments;
- lineage and model/projection versions.

Keep data separate when it has a different cardinality, authority or update rate:

- study snapshots, dataset definitions and source-artifact manifests;
- validation runs and append-only transformation events;
- business aggregates such as safety signals and portfolio findings;
- document chunks and literature records;
- investigation sessions, reviewer actions and agent traces;
- semantic releases and semantic graph partitions.

An LLM hypothesis is not an enrichment of immutable source evidence. It is a
versioned assertion that cites evidence and belongs in solution state.

## Comparison with the established strategies

The model applies the same principle, not the same physical shape, everywhere:

| Strategy | Canonical unit | Workload consequence | Physical choice |
|---|---|---|---|
| openEHR RPS Dual | composition | patient hydration and population path search have very different document shapes | canonical composition plus a synchronized slim search collection |
| FHIR Clinical CDR | resource | queries normally begin with resource type and FHIR serialization should be direct | one collection per resource type; canonical fields at root with `_search`, `_compartments`, `_kehrnel`, `_custom`, and `_enrichments` |
| CDISC SDR | dataset row inside an immutable study snapshot | queries cross domains but share study, snapshot, subject and domain anchors | one polymorphic row collection; canonical row and operational namespaces in the same document |

The common abstraction is a canonical payload with versioned operational
projections and a serializer that can always recover the canonical representation.
It is not a universal requirement to use one collection.

## Vector and search projections

Do not embed every CDISC row by default. Exact dose, incidence, severity, subject,
test and time predicates are cheaper and more reliable through `_index.facets`.
Generate semantic candidates from coherent, bounded text projections:

- `evidence_chunks` for finding and laboratory context;
- `portfolio_findings` for cross-study signal similarity;
- `literature_chunks` for permitted external evidence passages.

These collections retain text, filter fields, source references and projection
lineage. Atlas Automated Embedding indexes the `text` field using `autoEmbed` and
stores vectors in the reserved `__mdb_internal_search` database. Therefore vectors
are intentionally absent from the application documents shown in Compass. Query
text is embedded by Atlas at query time with the same compatible model.

Automated Embedding is currently an Atlas Preview feature. This blueprint uses it
for the solution-library experience. Exact and lexical lanes remain available if
the automated vector lane is unavailable; the application does not retain a
second manual-embedding path.

## The semantic-map foundation

The semantic map is the immutable governed release, not a collection name and not
the operational CDISC data. Context Studio owns the authoring model and compiles a
release containing meaning, taxonomy, value sets, archetypes, profiles,
capabilities, resolvers and physical storage bindings.

There are three distinct representations:

1. **Context Studio authoring store** — partitioned objects, edges, terminology and
   governance resources optimized for compilation and review.
2. **Portable runtime artifact** — a signed/content-addressed
   `SemanticRuntimeBundle`, or a manifest plus partitions when the map is large.
3. **Solution serving projections** — optional MongoDB nodes, edges, search
   documents and caches rebuilt from exactly one runtime release.

In the current solution the active pointer selects `semantic_releases.bundle`; this
is the only representation read to construct the runtime. The separate
`semantic_objects`, `semantic_profiles`, `semantic_value_sets`, and similar
collections are exploded inspection/change-stream projections. They are not a
second semantic authority. Their current number makes that boundary harder to see
and they can drift because the runtime does not read them.

The target solution footprint is therefore:

- `semantic_releases`: immutable imported runtime artifacts and digests;
- `semantic_runtime_pointer`: the atomic active-release pointer;
- optional `semantic_nodes` and `semantic_edges`: rebuildable graph/query
  projections when the UI or resolver needs database-native traversal;
- `semantic_change_events`: proposals, compilation and activation events.

Operational `Finding → Publication → DocumentChunk` relationships are an evidence
graph and should be named accordingly; they do not become definitions in the
semantic map merely because they are traversed with `$graphLookup`.

## Current-state findings

The connected demonstration currently contains 34,843 canonical CDISC records
across five SEND domains. Every record has deterministic semantic text and none has
a stored vector. That is the desired source-document shape for Automated
Embedding. The application also has 76 evidence chunks, 75 portfolio-finding
projections and three literature chunks. All three retrieval projections now use
Atlas Automated Embedding over their governed `text` field.

The current `cdisc_records` v1 shape is sound in substance: `data` is canonical,
`facets` and `semantic` are derived, and `lineage` is explicit. Its weakness is that
control, identity and derived namespaces are mixed at the root. A v2 envelope should
make the boundary unambiguous. It should be introduced through a versioned Kehrnel
export and a deterministic full rebuild. This blueprint deliberately has no dual-read,
legacy-field, or manual-embedding compatibility path.

The obsolete manual-vector indexes have been removed. The active indexes use
`autoEmbed`, and the corresponding vectors exist only in Atlas's internal search
collections. Optional operational properties are omitted rather than persisted as
`null`, empty arrays, or empty objects. The canonical MongoDB rows follow the same
sparse rule for blank/null cells. Column definitions and order live in the dataset
metamodel, while immutable Dataset-JSON/XPT/Define-XML artifacts and row hashes
preserve exact replay and direct interoperability. Explicit values such as zero,
`false`, `UNK`, and `NA` remain present.

## Delivery sequence

1. Use Atlas Automated Embedding on the three bounded retrieval projections and
   query them with text directly.
2. Specify and validate the CDISC evidence-envelope v2 contract in Kehrnel.
3. Cut the solution importer to v2 and rebuild all projections from the canonical
   namespace; do not keep a v1 compatibility branch.
4. Benchmark explain plans, index size, import throughput and study/subject/domain
   query latency before making v2 the default.
5. Make semantic serving authority explicit and consolidate unused exploded
   semantic collections behind rebuildable `semantic_nodes`/`semantic_edges` views.

This keeps the blueprint ambitious where it creates durable value: traceable CDISC
evidence, workload-shaped MongoDB documents, invisible managed embeddings, and a
portable semantic release that deterministically compiles intent into operational
queries.
