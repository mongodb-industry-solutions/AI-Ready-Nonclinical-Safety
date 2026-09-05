# AI-Ready Nonclinical Safety Intelligence

An interactive, self-contained reference application for investigating nonclinical safety signals across CDISC SEND studies with MongoDB and the MongoDB Agentic Platform (Magenta).

The application starts with the question a toxicologist actually asks:

> Is this finding treatment-related, dose-responsive, biologically coherent, and traceable to its source evidence?

It then progressively reveals the data model, governed queries, hybrid retrieval, evidence graph, and agent execution that produced the answer.

The in-product **Solution architecture** workspace and [full architecture guide](docs/solution-architecture.md) show exactly where CDISC is used, how SEND domains become traceable MongoDB documents, which APIs form the runtime boundary, and how search, embeddings, graph traversal, semantic resolution, and Magenta work together.

## What You Can Explore

- A study-wide dose-by-organ incidence matrix and organ signal landscape ranked for expert review.
- A separate portfolio similarity atlas with interactive cross-study graphs, explainable retrieval lanes, and evidence-class boundaries.
- Dose-response and longitudinal laboratory charts.
- Cross-domain links between SEND DM, TX, MI, and LB records.
- A full-width interactive evidence and lineage network with dose-specific branches, node inspection, minimap, and immersive graph mode.
- A full-screen Investigation Room where the AI investigator conducts typed graph, dose, laboratory, and resolver widgets while exposing citations.
- Record-level drilldown from a signal to the contributing MI, DM, TX, and LB rows and their checksum-verified source artifacts.
- A literature-evidence workspace that grounds SEND findings to attributed PubMed records, separates supporting context from alternative explanations, and exposes the hybrid retrieval path.
- A profile-aware semantic model explorer with synchronized business-document, semantic-graph, retrieval, and physical-MongoDB lenses.
- Governed review actions stored separately from immutable SEND evidence.
- A live semantic change lab that shows a newly observed terminology value flowing through Change Streams, validation, compilation, profile projection, and map refresh.
- A technical view explaining the boundary between the deployed solution and upstream HDL/Kehrnel enablement.

The included demonstration uses deterministic aggregates from the public [PhUSE SENDConform FFU contribution](https://github.com/phuse-org/SENDConform), pinned to revision `eb438ce3f7cbd74eea77677f43b916dd46c802cd`. No large XPT files are committed.

## Quick Start

The application runs in fixture mode without MongoDB or an LLM:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To persist the demonstration and investigation history in your own MongoDB deployment:

```bash
cp .env.example .env.local
# Set MONGODB_URI. The public demonstration is bootstrapped automatically.
npm run dev
```

The default local command uses the deterministic cited investigator. `docker compose up --build` starts the application and its bundled Magenta service together; no external Magenta URL, Kehrnel URL, or GitHub token is required. The agent vendors the approved Magenta runtime wheels in the repository, following the same deployment pattern as `patient-access-coordination-advisor`.

Set `MONGODB_URI` to persist study evidence, search chunks, and investigation sessions in the solution database. The application owns these deployed collections and APIs.

Import the checked-in Context Studio runtime release into that database with:

```bash
npm run import:semantics
```

The application remains runnable from the checked-in bundle when MongoDB is unavailable.

## Architecture

```mermaid
flowchart LR
  A[Public or sponsor SEND<br/>XPT + Define-XML] --> B[Healthcare Data Lab<br/>intake + data factory]
  B --> C[Versioned solution import<br/>CDISC-derived contract]
  C --> D[(Solution MongoDB Atlas<br/>evidence + review state)]
  L[PubMed / PMC OA / licensed PDFs<br/>metadata + permitted content] --> M[Solution document intake<br/>parse + chunk + provenance]
  M --> D
  N[(S3-compatible object storage<br/>licensed source artifacts)] --> M
  J[Context Studio<br/>author + resolve + compile] --> K[Portable semantic runtime<br/>map + resolvers + profiles]
  K --> D
  D -. Change Streams .-> K
  D --> E[Search + Vector Search<br/>hybrid retrieval]
  C --> F[Safety evidence graph]
  E --> G[Magenta<br/>investigation agent]
  F --> G
  G --> H[Nonclinical Safety<br/>Intelligence UI]
  H --> I[Expert review<br/>feedback + audit]
```

### Separation of concerns

| Component | Responsibility |
|---|---|
| Healthcare Data Lab + Kehrnel | Upstream learning and enablement: create/ingest data, validate the model, test query patterns, and export a versioned solution input. They are not runtime dependencies. |
| Context Studio | Author, resolve, test, and compile the semantic map into a portable runtime package. It is a build-time dependency, not a production service dependency. |
| MongoDB Atlas | The deployed solution database: study and literature evidence documents, search/vector projections, semantic links, investigation history, and reviewer state. |
| PubMed, PMC and object storage | PubMed contributes bibliographic identity and abstracts; PMC Open Access or sponsor-licensed storage contributes permitted full text. Source artifacts remain separately governed and attributable. |
| Bundled Magenta service | Orchestrate solution-owned read-only tools, memory, traces, reranking, and human review within the same deployment. |
| This repository | Deliver the business workflow, visual explanation, evidence assembly, and expert experience. |

The solution never makes canonical CDISC records, semantic projections, or agent memory competing sources of truth. Published evidence is immutable; semantic releases are versioned; expert decisions are append-only solution state.

## Portable Semantic Runtime

[`semantic/nonclinical-safety-runtime.json`](semantic/nonclinical-safety-runtime.json) is the deployable output of Context Studio. It contains:

- business and evidence objects plus typed relationships;
- taxonomy concepts, terminology/value-set bindings, synonyms, and broader/narrower hierarchy;
- reusable archetypes with roles and cardinalities, separate from physical persistence;
- explicit storage bindings showing every MongoDB, API, or object-store representation and its authority;
- profile-filtered visibility, field masks, capabilities, and actions;
- resolver contracts for aggregation, graph lookup, hybrid vector search, reranking, and Magenta synthesis;
- terminology value sets and four synchronized UI surface definitions;
- a snapshot + cursor + event subscription contract backed by MongoDB Change Streams.
- portable source-adapter declarations for MongoDB, PubMed, PMC Open Access, and S3-compatible document storage.

With MongoDB configured, the semantic API resolves the active release from `semantic_runtime_pointer`. The change lab creates a candidate event, compiles a new immutable bundle, activates its pointer, and lets connected clients refresh from the emitted resume-safe event. Fixture mode performs the identical visual workflow against the bundled release without pretending to persist it.

The application imports that artifact; it never imports Context Studio internals. A production identity provider must supply the profile—this demonstrator exposes a profile picker so the authorization projections are visible.

The source package also contains a portable Context Studio workspace blueprint. It defines four independent layers—semantics, archetypes, placements, and interfaces—so the same meaning can be bound to multiple physical representations without treating storage as ontology. A live Context Studio installation can install the package into a governed workspace, compile an immutable release, and export this runtime bundle; the application does not require that workspace at runtime.

## Data Modes

### Fixture fallback

Without `MONGODB_URI`, the application provides a fully interactive experience from checked-in, traceable aggregates. It is deterministic and requires no credentials. The portfolio workspace adds three compact benchmark projections generated from Kehrnel CDISC synthetic data factory `2.1.0` using the `safety-signal` recipe and seeds `42`, `117`, and `203`. Their recipe and model digests are retained, and the UI labels them as synthetic evaluation data everywhere.

### MongoDB

When `MONGODB_URI` is set, the application reads its own canonical evidence, operational read models, retrieval projections, and solution-state collections. The bundled public study summary is inserted idempotently only when no connected projection has been imported. A Kehrnel export populates `study_snapshots`, `dataset_definitions`, `cdisc_records`, `subjects`, `source_artifacts`, `validation_evidence`, and `lineage_events` without coupling the running solution to Kehrnel.

Kehrnel emits `kehrnel.dev/cdisc-solution-evidence/v1` from the `cdisc_export_solution_evidence` operation. Its checked-in contract is [`contracts/cdisc-solution-evidence-v1.schema.json`](contracts/cdisc-solution-evidence-v1.schema.json). Download the generated JSON artifact, then import it:

```bash
npm run import:study -- ./path/to/solution-evidence-package.json
# For a package intentionally generated as an evaluation benchmark:
npm run import:study -- ./path/to/synthetic-package.json --evidence-class=synthetic-benchmark
npm run import:literature
npm run rebuild:portfolio
npm run setup:indexes
```

The importer verifies API and model versions, requires a published snapshot, recomputes the package SHA-256 digest, checks every manifest count, and performs idempotent upserts. It then deterministically derives the solution-owned `StudyEvidence` read model from canonical DM, TX, MI, and LB records. The projection carries exact source-record IDs and hashes, its own digest, the versioned projection rule IDs used to form business signals, and a reconciliation receipt against the package counts. There is no manually supplied second data model in connected mode. The older one-file `StudyEvidence` import remains supported only for lightweight fixture use.

The index command creates the solution-owned Atlas Search and Vector Search definitions described in [`docs/atlas-indexes.md`](docs/atlas-indexes.md). It requires an Atlas database role permitted to manage search indexes.

## AI Retrieval Design

The investigator is deliberately hybrid:

1. Bind tenant, study, and immutable snapshot.
2. Execute exact governed aggregation for counts and measurements.
3. Retrieve semantically related findings and narratives with Atlas Search and Vector Search.
4. Expand explicit entity and lineage edges.
5. Fuse candidates using reciprocal-rank fusion.
6. Apply a second-stage reranker.
7. Generate a review hypothesis with record-level citations.

### External literature evidence

Literature is a separate contextual-evidence lane. The demonstration includes three verified PubMed records linked to the thymus finding by organ, morphology, species, study design, and explanatory role. It stores bibliographic metadata and application-authored relevance summaries only—never unlicensed article text.

For a production corpus, source PDFs live in governed S3-compatible object storage. The solution stores parsed, section-aware chunks, embeddings, semantic links, page or passage locators, content hashes, and access policy in MongoDB. Full text is ingested only from PMC Open Access or material for which the deployer has permission. PubMed identifiers and source links remain attached to every retrieved passage.

The literature resolver performs concept grounding, license filtering, lexical search, vector search, graph expansion, and domain reranking. Its output is labeled as pathology reference, analogous pattern, or alternative explanation. It cannot turn literature similarity into a compound-specific or causal conclusion.

`GET /api/literature` executes that contract rather than merely describing it. It validates the active profile and containment plan, scopes candidates to the selected finding, uses the configured Atlas Search index, optionally uses Atlas Vector Search when an embedding provider is available, expands materialized semantic evidence edges, performs reciprocal-rank fusion and domain reranking, and returns per-stage execution telemetry. If Atlas or the embedding provider is unavailable, the response identifies the skipped or fallback lane and retains the governed exact result set.

The agent is read-only. It cannot publish snapshots, create validation waivers, supersede evidence, or claim regulatory compliance.

### Portfolio similarity

`GET /api/portfolio/similarity` authorizes `retrieve-similar-findings` against the active semantic profile and compares the selected finding only with other study snapshots. The resolver executes semantic/concept, normalized dose-incidence, and severity lanes; it executes the vector lane only when both findings have governed embeddings. Candidate lists are fused with reciprocal-rank fusion and then domain-reranked. The response exposes every lane score and whether Vector Search actually ran.

The shipped benchmark corpus is for evaluating the workflow, never for historical-control or scientific inference. When real sponsor or public study packages are imported, the same resolver compares their solution-owned projections without changing the UI contract. Compound and SMILES similarity are intentionally absent until a governed compound identity and structure source are available.

## Repository Structure

```text
app/                  Next.js pages and server-side API routes
components/           Interactive safety visualizations and agent UI
data/                 Small, attributed demonstration read model
lib/analysis/         Deterministic review-priority calculations
lib/ai/               Magenta adapter and deterministic fallback
lib/data/             MongoDB repositories and fixture bootstrap
lib/data/review-store Optional solution-owned MongoDB investigation history
lib/semantics/        Portable semantic runtime loader and profile projection
semantic/             Context Studio-compiled runtime release
services/agent/       Bundled Magenta investigation service
docs/                 Architecture and delivery guidance
tests/                Contract and analysis tests
```

## Validation

```bash
npm test
npm run build
```

## Product Roadmap

1. **Single-study SEND investigation** — implemented foundation.
2. **Connected Atlas AI retrieval** — executable containment, Atlas Search, optional embeddings/Vector Search, graph expansion, fusion, reranking and visible plan telemetry are implemented; a larger evaluation corpus remains.
3. **Cross-study portfolio intelligence** — implemented explainable target-organ, species, dose-pattern, severity and vector-ready comparisons. The included synthetic corpus is explicitly segregated from observed evidence; compound/SMILES similarity remains deferred until governed compound identities are supplied.
4. **Translational safety bridge** — governed connections from nonclinical SEND to clinical SDTM and ADaM evidence.

## Safety and Scope

This project is a reference architecture and demonstration. It is not a validated toxicology system, statistical analysis package, regulatory submission authoring tool, or autonomous decision maker. All generated interpretations require qualified expert review.

## License

Apache License 2.0. The source datasets retain their original licenses and attribution requirements.
