# Guided journey: nonclinical safety investigation

This journey is written for someone who understands data and software but is not
a toxicologist. It accompanies the in-product **Guided journey** workspace and
uses the public PhUSE SEND study already loaded by the application.

## What the work is trying to achieve

Before a medicine is first given to people, nonclinical studies expose animals to
defined dose levels and observe clinical, laboratory, and microscopic outcomes.
The central review question is not simply whether a finding exists. Investigators
ask whether it is related to treatment, whether it changes with dose or time,
whether other evidence supports it, whether there are credible alternatives, and
how relevant it may be to humans.

This application assists that evidence investigation. It does not diagnose,
determine causality, or replace an accountable expert.

## The people

| Role | Principal question | Product responsibility |
|---|---|---|
| Toxicologist | Is this pattern treatment-related and biologically meaningful? | Integrates dose, incidence, severity, time, organ, laboratory, and prior-knowledge evidence. |
| Study director | Is the study complete, coherent, and ready to report? | Owns study conduct, cross-domain integration, review status, and the study narrative. |
| Data steward | Can the evidence be trusted and reproduced? | Governs identifiers, terminology, validation, mappings, provenance, and discrepancies. |
| Portfolio lead | Has this pattern appeared in related studies or compounds? | Compares studies without mixing observed evidence with synthetic evaluation data. |
| External reviewer | Can I independently verify the assertion? | Receives a constrained, read-only, cited view with protected data masked. |

Changing the profile in the application changes the semantic projection,
capabilities, fields, and permitted actions. It is not a cosmetic persona switch.

## The seven-chapter walkthrough

### 1. Orientation

Read the business question and the sequence **Observe → Compare → Connect →
Interpret → Defend**. Remember that a signal is a reason to investigate, not an
adverse-effect conclusion.

### 2. People

Select each role and notice how the number of grants, masks, available actions,
and visible semantic objects changes. Return to **Toxicologist** for the primary
walkthrough.

### 3. Evidence

Open the PDS2014 study workspace and read the evidence in six connected lanes:

- `DM` and `TX` establish animal identity, cohort, dose, and vehicle.
- `MI`, `MA`, and `OM` carry microscopic findings, gross pathology, and organ measurements.
- `BW`, `BG`, and `FW` provide longitudinal systemic-tolerance context.
- `LB` and `CL` carry laboratory measurements and clinical observations.
- `EX`, `PC`, and `PP` describe administration and systemic exposure.
- `SE`, `DS`, and `RELREC` contribute phase, disposition, and source-declared relationships.

The canonical rows remain the interoperability boundary. The visual study model
is a deterministic, rebuildable projection over those rows.

This is a retrospective interpretation workflow. Laboratory instruments,
pathologists, and study systems generate and date-stamp observations upstream;
SEND standardizes their exchange. This application integrates the completed
handoff and never pretends to be the acquisition or diagnostic system.

### 4. Triage

Start with the dose-by-organ matrix. Select **PDS2014 adrenal-gland
vacuolization** and ask:

1. Is it absent or present in controls?
2. Does incidence increase across treated groups?
3. Does severity strengthen the pattern?
4. Is there a related laboratory change?
5. Could study design, background incidence, or another mechanism explain it?

The application ranks findings so experts know where to look first. That ranking
does not establish causality.

### 5. Investigation

Open the Investigation Room and expand **AI workspace**. Ask “Is this finding
plausibly treatment-related?” The answer canvas should contain:

- exact canonical citations plus reconciled pathology, organ-weight, body-weight,
  exposure, phase, and relationship projections;
- a dose-response visualization;
- a laboratory trajectory when one is governed;
- semantic candidates and value-set clarification;
- the evidence topology;
- the resolver contract and measured execution trace.

The cards are selected and ordered by the server response. Open the execution
widget to inspect the actual winning MongoDB index and the keys/documents examined,
not only the intended query shape. Semantic lexical search, Atlas-managed vector
search, fusion, and any literature reranking are part of the same investigation
response.

Read the contract and execution separately. The contract says what was authorized
and could run. The trace says what actually ran, what returned, how long it took,
and what was skipped or fell back.

Open **Biological coherence** to compare the target-organ incidence with organ
measurements, systemic context, recovery phase, and source-declared links. The
absence of laboratory reference intervals in this public package is displayed as
an evidence gap; the application does not invent normal limits. Finish by
selecting endpoint summaries and recording a human-owned target-organ,
adversity, and reversibility assessment.

### 6. Meaning

Choose a semantic candidate or value-set term in the investigator. Use **Ask using
this meaning** to rebind the question, or **Open in semantic map** to inspect it.
The map separates:

1. concepts, terminology, and hierarchy;
2. archetypes and containment;
3. physical placements;
4. capabilities and resolver contracts.

The semantic release is authoritative. `semantic_resources`, `semantic_edges`,
and `semantic_search_documents` are rebuildable serving projections. Atlas
Automated Embedding owns vectors internally; vectors are not fields on the source
documents.

### 7. Trust

Open Audit and lineage. Follow the chain from checksum-pinned source artifact to
canonical record, study projection, resolver execution, citation, and expert
review action. Finish by reviewing Solution architecture to see why Kehrnel and
Context Studio are build-time enablement systems rather than runtime dependencies.

## A useful demo narrative

> We begin with a finding, not with AI. The matrix tells the toxicologist where to
> investigate. The Investigation Room retrieves exact standardized evidence and
> composes the right visual tools. If meaning is ambiguous, the user interrogates
> the governed semantic map and explicitly rebinds the question. Every answer
> exposes both its authorization contract and the operations that truly executed.
> The expert remains responsible for the final interpretation.

## Demo Sherpa playback layer

The in-product learning journey remains the authored source for the scientific
story. Demo Sherpa adds the presenter-facing playback and editing layer around
that story. The checked-in seed covers orientation, SEND evidence, signal
triage, governed investigation, portfolio comparison, semantic resolution,
solution architecture, and audit lineage.

The seed is intentionally text-first:

- narration is stored as ordered speech segments;
- meaningful pauses are explicit silence segments;
- each screen transition uses a stable host action and a visible-state
  checkpoint;
- a missing checkpoint pauses playback for review;
- browser speech provides a no-service fallback;
- generated voices can be added per segment later from Journey Studio.

The host only owns the demo context, route guidance, initial journey, and stable
UI markers under `components/sherpa/`. Recording, playback, Studio state, voice
variants, and migration behavior remain inside the `demo-sherpa` package.

## Questions that should drive the next iteration

- Which additional study domains materially change a toxicologist's decision?
- Which semantic ambiguities occur in real reviews and require explicit rebinds?
- Which comparison cohorts and literature sources are considered acceptable?
- Which visualizations reduce review time rather than merely look impressive?
- Which resolver outcomes need benchmark datasets and expert-scored evaluations?
- Which review actions require approval, separation of duties, or regulated audit?

Those answers should determine the next vertical data expansion. Molecules,
structures, and SMILES should enter only when a concrete structure-to-toxicity or
compound-similarity workflow requires them.
