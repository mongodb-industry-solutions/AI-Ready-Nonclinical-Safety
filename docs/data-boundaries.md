# Data Creation and Runtime Boundaries

## Principle

Create test data where the model and constraints are defined; consume it where the business workflow is demonstrated.

## Healthcare Data Lab

Healthcare Data Lab is the operator-facing laboratory. It selects public examples, defines synthetic recipes, launches Kehrnel generation, validates and publishes snapshots, and lets builders prototype governed queries. It stores workspace configuration, not a parallel CDISC repository.

## Kehrnel

Kehrnel owns the versioned CDISC metamodel and deterministic generator. A recipe records its seed, scenario, generator version, model digest, intended signal, expected anomalies, and watermark. Generated studies pass through the same ingest, validation, publication, projection, and query path as external studies.

The `safety-signal` SEND scenario exists to test cross-domain questions rather than create random rows. It should generate coherent dose groups, animal assignments, pathology incidence, severity, longitudinal laboratories, and explicit expected evidence patterns.

## Solution application

The application receives a stable `StudyEvidence` presentation contract. In fixture mode it reads a small attributed snapshot. In connected mode it obtains the same shape through governed Kehrnel operations. It may persist investigation sessions, reviewer annotations, saved views, and telemetry in a solution database, but not canonical SEND records.

## Magenta

Magenta owns the investigation graph and its operational concerns: tool registration, model access, traces, checkpointing, memory, approval interrupts, and evaluation. Tools accept study and snapshot identifiers and call governed Kehrnel operations. They do not receive an unrestricted MongoDB handle.

## Promotion rule

New functionality belongs in Kehrnel only when it is reusable across solutions and expressible as a domain-neutral or CDISC-domain contract. Business-specific ranking, language, layout, and reviewer workflow stay in this repository.
