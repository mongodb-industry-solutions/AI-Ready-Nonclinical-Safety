# CDISC document model and semantic-map foundation

Status: implemented
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
  _enrichment: { // optional; omitted when empty
    terminologyBindings: [{ system: "CDISC CT", code: "THYMUS" }]
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

In the solution the active pointer selects `semantic_releases.bundle`; this is the
only representation read to construct the runtime. Small, same-lifecycle map
resources are materialized into one polymorphic `semantic_resources` collection.
Definition relationships remain in `semantic_edges`, because their forward and
reverse traversal workload differs. These are inspection/query projections, not a
second semantic authority, and are rebuilt from the selected release.

The openEHR RPS-dual lesson applies as an architectural principle, not as a forced
clinical schema: preserve the governed semantic artifact, then compile
workload-specific projections and paths from it. The map therefore does not need
one collection per semantic product. Objects, concepts, value sets, archetypes,
capabilities, resolvers, profiles, and adapters share the polymorphic resource
plane; traversable definitions use the edge plane; retrieval text uses the
profile-scoped auto-embedding plane. Each projection remains disposable because
the immutable release is authoritative.

Resolvers have three layers. Generic Context Studio primitives validate profile,
containment, terminology, and placement. Industry packages add typed contracts
such as `resolver.investigate-safety-signal.v1`. The deployed solution binds those
contracts to concrete MongoDB, Atlas Search, graph, document, and agent adapters.
The execution response is emitted from those adapters after they run: it records
the exact operation, collection, predicate, result count, duration, and
executed/fallback/skipped state. A declared pipeline is never presented as an
executed one.

The target solution footprint is therefore:

- `semantic_releases`: immutable imported runtime artifacts and digests;
- `semantic_runtime_pointer`: the atomic active-release pointer;
- `semantic_resources` and `semantic_edges`: rebuildable polymorphic and graph
  projections for inspection, filtering and database-native traversal;
- `semantic_search_documents`: profile- and release-scoped text projection with
  Atlas Automated Embedding; vectors live only in `__mdb_internal_search`;
- `semantic_change_events`: proposals, compilation and activation events.

Operational `Finding → Publication → DocumentChunk` relationships are an evidence
graph and should be named accordingly; they do not become definitions in the
semantic map merely because they are traversed with `$graphLookup`.

## Current-state findings

The connected demonstration currently contains 63,836 canonical CDISC records
across three complete public studies. PDS2014 contributes 42,041 records across 25
SEND datasets; Nimort-01 and PC201708 also retain every published domain in their
active immutable snapshots. Every record has deterministic semantic text and none has
a stored vector. That is the desired source-document shape for Automated
Embedding. The operational layer contains 6,673 endpoint summaries, 786
measurement series, 374 subject timelines, and 60,045 relationships. Evidence,
portfolio, literature, and semantic retrieval projections use Atlas Automated
Embedding over their governed `text` fields.

Semantic release 1.0.0 materializes 124 polymorphic resources, 24 definition edges,
and 644 profile-scoped auto-embedding source documents. The resource plane now
includes the nonclinical-safety investigator resolver as a first-class semantic
product rather than hiding its contract in application code.

The connected `cdisc_records` collection now uses the separated envelope shown
above. The previous root-level shape was rebuilt rather than dual-read: all 63,836
record hashes reconciled, all operational projections were regenerated, and the
superseded collection was removed. MongoDB collection validation requires
`_control.modelSchemaVersion`, and the active semantic release requires the same
data-contract version before activation.

The obsolete manual-vector indexes have been removed. The active indexes use
`autoEmbed`, and the corresponding vectors exist only in Atlas's internal search
collections. Optional operational properties are omitted rather than persisted as
`null`, empty arrays, or empty objects. The canonical MongoDB rows follow the same
sparse rule for blank/null cells. Column definitions and order live in the dataset
metamodel, while immutable Dataset-JSON/XPT/Define-XML artifacts and row hashes
preserve exact replay and direct interoperability. Explicit values such as zero,
`false`, `UNK`, and `NA` remain present.

## Delivery sequence

1. Publish the matching internal evidence-envelope contract from Kehrnel.
2. Run the golden operational, semantic, and research query suite against the
   public `1.0.0` packages before the solution-library release.
3. Retain semantic serving authority through rebuildable `semantic_resources`,
   `semantic_edges`, and auto-embedded `semantic_search_documents` projections.

This keeps the blueprint ambitious where it creates durable value: traceable CDISC
evidence, workload-shaped MongoDB documents, invisible managed embeddings, and a
portable semantic release that deterministically compiles intent into operational
queries.
