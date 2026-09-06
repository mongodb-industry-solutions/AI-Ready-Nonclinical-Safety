# Nonclinical safety vertical expansion program

## Decision

Deepen one retrospective target-organ safety assessment before adding more product
surfaces. The first vertical connects pathology, organ weight, body weight,
clinical pathology, clinical observations, exposure, study phase, recovery,
literature, and governed expert interpretation. A NOAEL workbench follows only
after those evidence relationships are reproducible and visible.

This is a post-study evidence investigation product. It is not a laboratory
acquisition system, pathology image-analysis system, SEND authoring tool, or
autonomous toxicology decision maker.

## Implemented vertical baseline

The connected runtime now activates three deliberately differentiated complete
public SEND snapshots through an immutable pointer model. Their aggregate active
corpus is 63,836 canonical records, 374 subjects, 6,673 endpoint summaries, 786
measurement series, 374 subject timelines, and 60,045 typed evidence relationships:

| Study | Canonical records | SEND domains | Endpoint summaries | Measurement series | Subjects |
|---|---:|---:|---:|---:|---:|
| PDS2014 | 42,041 | 25 | 4,584 | 532 | 124 |
| PC201708 | 18,749 | 28 | 1,711 | 238 | 150 |
| Nimort-01 | 3,046 | 18 | 378 | 16 | 100 |

The Investigation Room executes the biological-coherence resolver against those
persisted projections, shows the real MongoDB predicates, index use, counts, and
timings, and supports an append-only cited target-organ assessment. PDS2014 does
not supply laboratory reference intervals, so the UI presents that as a known
gap. Nimort-01 does supply ranges: the resolver currently hydrates 38 canonical
outside-range rows across albumin, potassium, and chloride and reports overlap
with animals in the selected pathology signal. These values remain source facts,
not solution-invented thresholds. The active Context Studio semantic release is
`org.contextobjects.nonclinical-safety@0.4.1`.

## Evidence reconnaissance

The pinned `phuse-org/SENDConform` revision contains substantially more data than
the current examples ingest:

| Study | XPT domains at the pinned revision | Current Kehrnel example |
|---|---:|---:|
| FFU Contribution to FDA | 25 | 25 |
| Nimble | 18 | 18 |
| Instem | 25 | 25 |
| PointCross | 28 | 28 |
| PDS | 25 | 25 |

The Kehrnel solution-evidence exporter is domain-neutral and exports every dataset
and record present in each published snapshot. The solution preserves all domains
canonically, then derives bounded business views across pathology, measurements,
phase, exposure, and typed relationships. PDS2014, PointCross PC201708, and
Nimort-01 form the retained active solution corpus. Instem GLP003 and FFU remain
checksum-pinned, reloadable Kehrnel examples and are not permanently materialized
on the shared demonstration cluster.

## Architectural ownership

### Healthcare Data Lab

- Discover and select versioned public examples.
- Present source terms, domain coverage, expected size, and acknowledgement before ingest.
- Launch Kehrnel operations and inspect validation, publication, and lineage.
- Never become a production dependency of the deployed solution.

### Kehrnel

- Fetch checksum-pinned XPT and Define-XML assets.
- Preserve every source value in canonical records and omit absent fields.
- Derive only reusable domain-neutral facets and entity references.
- Validate and publish immutable snapshots.
- Export every ingested domain through `kehrnel.dev/cdisc-solution-evidence/v1`.
- Never derive adverse findings, NOAEL, or business-review conclusions.

### Context Studio

- Govern concepts, value sets, terminology bindings, archetypes, storage placements,
  capabilities, profiles, actions, and resolver contracts.
- Compile immutable portable semantic releases.
- Define the meaning and permitted use of `adverse`, `target organ`, `recovery`,
  and terminology harmonization; it does not make the scientific decision.

### AI-Ready Nonclinical Safety

- Import the complete solution-evidence package and reconcile every canonical row.
- Build bounded, versioned operational projections for the safety workflow.
- Execute exact, graph, Search, Vector Search, fusion, and reranking operations.
- Render the investigation, show the real physical plan, and collect append-only
  review decisions.

### Magenta

- Orchestrate solution-owned tools under the compiled semantic profile.
- Propose cited hypotheses and draft adversity rationales.
- Preserve session, study, and programme memory as governed solution state.
- Never mutate canonical evidence or autonomously determine adversity or NOAEL.

## Target document model

Keep `cdisc_records` as the immutable interoperability boundary. Its canonical
`data`, operational `facets`, and `lineage` namespaces separate source values,
rebuildable indexing fields, and provenance. Optional values are omitted rather
than persisted as empty placeholders.

Do not grow `study_evidence` into an unbounded study document. Treat it as a
bounded summary cache and introduce workload projections with independent
lifecycle and pagination:

| Projection | Grain | Purpose |
|---|---|---|
| `study_endpoint_summaries` | study + snapshot + endpoint + sex/group | Incidence, distribution, trend, source-record set |
| `subject_timelines` | study + snapshot + subject, optionally bucketed | Dose, observations, and measurements ordered by study time |
| `measurement_series` | study + snapshot + subject/group + test | BW, FW, LB, OM, PC/PP, EG, and VS series with units and source ranges |
| `evidence_relationships` | one typed edge | RELREC-derived and explicitly governed cross-domain relationships |
| `target_organ_assessments` | study + snapshot + organ + review version | Evidence matrix and expert adversity assessment |
| `review_actions` | one action | Append-only annotation, acceptance, revision, rejection, and approval |
| `*_search_documents` | retrievable text unit | Atlas Search and Automated Embedding source text; no vector arrays |

Every derived document carries `studyId`, `snapshotId`, projection version,
source-record identities, a deterministic digest, and the semantic release used
to interpret it.

## Flagship investigation

Select one real study and finding only after profiling confirms a coherent
evidence chain. The preferred journey is:

1. Observe a microscopic target-organ finding (`MI`).
2. Compare incidence and severity by dose, sex, phase, and recovery cohort
   (`DM`, `TX`, `SE`, `DS`).
3. Inspect absolute and body-weight-relative organ weight (`OM`, `BW`).
4. Inspect laboratory measurements against source-supplied intervals or flags (`LB`).
5. Inspect clinical observations, body-weight, and food-consumption context
   (`CL`, `BW`, `FW`).
6. Confirm administered dose and systemic exposure (`EX`, `PC`, `PP`).
7. Traverse source-declared relationships where available (`RELREC`) and
   distinguish them from solution-derived links.
8. Retrieve terminology-governed literature and plausible alternatives.
9. Let the expert record an adverse, non-adverse, or equivocal assessment with rationale.
10. Assemble an evidence brief containing the answer, source citations, semantic
    bindings, executed physical plan, review history, and provenance.

## Delivery gates

Status at semantic release 0.4.1:

| Gate | Status | Evidence |
|---|---|---|
| 0 · reconnaissance | Complete | Five-study coverage measured from complete public SEND packages |
| 1 · supply path | Complete on feature branches | All-domain checksum-pinned examples and a curated 63,836-record active corpus |
| 2 · operational projections | Complete baseline | Three curated immutable active snapshots, reconciled projections, portfolio corpus, and workload indexes |
| 3 · investigation room | Complete baseline | Biological coherence, source-range abnormality resolution, cross-study widgets, source navigation, and measured query traces |
| 4 · agent and semantics | Implemented with runtime boundary | Compiled 0.4.1 resolver; exact, graph, semantic lexical/vector, literature, fusion, and rerank telemetry share one envelope; deterministic path always available; Magenta activates when configured |
| 5 · assessment and evaluation | Partial | Cited target-organ assessment implemented; expert evaluation and NOAEL remain |

### Gate 0 — data reconnaissance

Produce a machine-readable coverage report for FFU, Nimble, Instem, PointCross,
and PDS at the pinned revision. It includes row counts, variables, subject/group
keys, units, reference-range availability, sexes, study phases, recovery
indicators, RELREC links, and candidate cross-domain findings. Choose the flagship
only from observed relationships.

### Gate 1 — widen the governed supply path

- Expand the Kehrnel catalog with the required checksum-pinned assets.
- Ingest, validate, publish, and export the selected study without domain loss.
- Prove package counts and per-domain hashes.
- Add the expanded example to Healthcare Data Lab only after the Kehrnel contract passes.

### Gate 2 — operational projections

- Extend the solution contract additively; keep canonical records unchanged.
- Build endpoint summaries, subject timelines, measurement series, and typed relationships.
- Use RELREC when supplied; label inferred joins and their rules separately.
- Add indexes and query telemetry, including index name and documents examined/returned.

### Gate 3 — scientific investigation room

- Add an animal timeline and target-organ coherence panel.
- Render reference bands only when the source supplies limits or an explicitly
  versioned reference source is attached.
- Make every mark, citation, graph node, and semantic term navigate to its exact evidence.
- Compose widgets from a typed server response rather than a fixed client layout.

### Gate 4 — governed agent and semantics

- Run the real bundled Magenta path and label deterministic fallback honestly.
- Unite structured, graph, lexical, vector, literature, and rerank stages in one
  execution envelope.
- Add semantic clarification interrupts and auditable rebinding.
- Harmonize source terminology only through versioned mappings.

### Gate 5 — assessment and evaluation

- Add the endpoint-by-dose adversity assessment and expert-controlled NOAEL workbench.
- Introduce approval, reviewer identity, and signed/versioned rationale.
- Evaluate retrieval quality, citation fidelity, projection reconciliation,
  accessibility, response time, and end-to-end journey behavior.

## Current execution ownership

Codex owns the active integration work from the existing local checkout: the
cross-repository architecture, contracts, solution importer, projections,
indexes, resolver telemetry, semantic integration, Investigation Room, NOAEL
workflow, and final verification. Claude is paused and has no active write scope.
If that workstream resumes, it should begin with the isolated Gate 0 profiling
report and stop for architecture review before changing any repository.

## Acceptance rules

- Do not invent normal ranges, adverse calls, causal links, terminology mappings,
  or recovery relationships.
- Do not present synthetic data as observed or historical-control evidence.
- Do not store vector arrays in application documents; Atlas Automated Embedding
  owns vector generation and storage.
- Unknown study, snapshot, signal, subject, or source identifiers fail closed.
- Every visual assertion resolves to exact canonical rows and source artifacts.
- Declared query plans and measured execution traces are shown separately.
- Promote a semantic release atomically with compatible resource, edge, search,
  and evidence-link projections.

## Explicitly deferred

- Molecule and SMILES similarity until governed compound identities and a concrete
  structure-to-toxicity question exist.
- Pathology image inference until licensed slide images, annotations, and an image
  evidence model are available.
- Historical-control conclusions until an adequately stratified real corpus exists.
- Programme memory until repeat studies of one governed compound are available or
  a clearly labelled synthetic evaluation programme is generated.
