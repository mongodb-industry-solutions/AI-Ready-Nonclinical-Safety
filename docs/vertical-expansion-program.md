# Nonclinical safety vertical expansion program

## Decision

Deepen one retrospective target-organ safety assessment before adding more product
surfaces. The first vertical must connect pathology, organ weight, body weight,
clinical pathology, clinical observations, exposure, study phase, recovery,
literature, and governed expert interpretation. A NOAEL workbench follows only
after those evidence relationships are reproducible and visible.

This is a post-study evidence investigation product. It is not a laboratory
acquisition system, pathology image-analysis system, SEND authoring tool, or
autonomous toxicology decision maker.

## Evidence already available

The pinned `phuse-org/SENDConform` revision contains substantially more data than
the current examples ingest:

| Study | XPT domains at the pinned revision | Current Kehrnel example |
|---|---:|---:|
| FFU Contribution to FDA | 25 | 4 |
| Nimble | 18 | 5 |
| Instem | 25 | 5 |
| PointCross | 28 | 5 |
| PDS | 25 | not catalogued |

The Kehrnel solution-evidence exporter is already domain-neutral: it exports every
dataset and record present in a published snapshot. The current restriction is
primarily the curated example catalog, followed by this solution's projector,
which derives business views only from DM, TX, MI, LB, and limited TS metadata.

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
