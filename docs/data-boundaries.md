# Data Creation and Runtime Boundaries

## Principle

Create test data where the model and constraints are defined; consume it where the business workflow is demonstrated.

## Healthcare Data Lab

Healthcare Data Lab is the operator-facing laboratory. It selects public examples, defines synthetic recipes, launches Kehrnel generation, validates snapshots, and lets builders prototype queries. It exports a versioned solution input; it is not required by the deployed application.

## Kehrnel

Kehrnel owns the reusable CDISC metamodel, deterministic generator, and enablement-time query learning. A recipe records its seed, scenario, generator version, model digest, intended signal, expected anomalies, and watermark. Its `cdisc_export_solution_evidence` operation emits a published, checksum-protected `kehrnel.dev/cdisc-solution-evidence/v2` package containing the snapshot, dataset metamodels, canonical records, entity projections, artifacts, validation evidence, and transformation lineage. The internal `/v2` marker versions the evidence envelope; the public CDISC solution library launches at `1.0.0`. Kehrnel is upstream tooling, not a runtime service dependency of this solution.

The `safety-signal` SEND scenario exists to test cross-domain questions rather than create random rows. It should generate coherent dose groups, animal assignments, pathology incidence, severity, longitudinal laboratories, and explicit expected evidence patterns.

## Solution application

The application owns the strict package importer, the business-specific `StudyEvidence` projection, and its MongoDB deployment. In fixture mode it reads a small attributed snapshot. In connected mode it retains canonical `cdisc_records`, `subjects`, `source_artifacts`, validation evidence and lineage beside the optimized `study_evidence` and `evidence_chunks` read models. The Investigation Room can resolve a signal back to contributing rows and hashes. It persists investigation sessions, reviewer annotations, saved views, and telemetry without calling Kehrnel.

## Magenta

Magenta owns the investigation graph and its operational concerns: tool registration, model access, traces, checkpointing, memory, approval interrupts, and evaluation. Its service and bounded MongoDB tools are packaged inside this repository and deployed with the application. The browser never needs a Magenta URL.

## Promotion rule

New functionality belongs in Kehrnel only when it is reusable across solutions and expressible as a domain-neutral or CDISC-domain contract. Business-specific ranking, language, layout, and reviewer workflow stay in this repository.
