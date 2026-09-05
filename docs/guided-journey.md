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

Open the study workspace and locate four SEND domains:

- `DM` identifies animals and treatment groups.
- `TX` describes the dose and vehicle definitions.
- `MI` contains microscopic tissue findings and severity.
- `LB` contains longitudinal laboratory measurements.

The canonical rows remain the interoperability boundary. The visual study model
is a deterministic, rebuildable projection over those rows.

### 4. Triage

Start with the dose-by-organ matrix. Select the thymus lymphocyte finding and ask:

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

- exact MI, DM, TX, and LB citations;
- a dose-response visualization;
- a laboratory trajectory when one is governed;
- semantic candidates and value-set clarification;
- the evidence topology;
- the resolver contract and measured execution trace.

Read the contract and execution separately. The contract says what was authorized
and could run. The trace says what actually ran, what returned, how long it took,
and what was skipped or fell back.

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
