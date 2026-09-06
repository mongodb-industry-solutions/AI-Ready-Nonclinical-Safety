# 06 · Immutable evidence vs. solution state

## Problem

Once an agent is answering questions over evidence, there is enormous pressure to
write its output back next to that evidence — "just add a `summary` field to the
finding." It makes the next read cheaper and the UI simpler.

It also destroys the property the whole system exists to provide. A regulator, an
auditor, or a toxicologist six months later cannot distinguish what the study
observed from what a model asserted about it.

## Pattern

Three separate classes of data, with different write rules:

| Class | Mutability | Examples |
|---|---|---|
| **Published evidence** | Immutable. Checksum-verified. Never updated in place. | `cdisc_records`, `source_artifacts`, `study_snapshots`, `dataset_definitions` |
| **Derived projections** | Disposable. Rebuilt from evidence. | `study_evidence`, `evidence_chunks`, `portfolio_findings`, `semantic_*` |
| **Solution state** | Append-only. Attributed and timestamped. | `investigations`, `review_actions` |

The rule that matters:

> An LLM hypothesis is not an enrichment of immutable source evidence. It is a
> versioned assertion that **cites** evidence and belongs in solution state.

So agent output is stored as its own record, referencing evidence by ID and hash,
never merged into it:

```typescript
const inserted = await collection.insertOne({ ...record, createdAt: new Date() });
```

Investigations are inserted, never updated. The collection carries a history
index and an explicit retention TTL, because agent traces are operational
records with a lifecycle — unlike the evidence they cite, which has none:

```javascript
await collection.createIndexes([
  { key: { studyId: 1, snapshotId: 1, createdAt: -1 }, name: 'study_snapshot_history' },
  { key: { createdAt: 1 }, name: 'retention_ttl', expireAfterSeconds: 60 * 60 * 24 * 90 },
]);
```

The agent is **read-only over evidence** by construction. It cannot publish
snapshots, create validation waivers, supersede evidence, or assert a regulatory
conclusion. Expert review actions are likewise appended to their own collection,
attributed, and never written onto the finding.

## Why

- Provenance survives. "What did the study observe" and "what did a model say"
  are answerable independently, forever.
- Retention policy can differ per class — evidence is retained indefinitely,
  agent traces expire.
- Replaying a study snapshot cannot be contaminated by prior agent output.
- Prompt-injection blast radius is bounded: the worst case is a bad *assertion*
  in solution state, not corrupted source evidence.

## When *not* to use it

- **When the model output *is* the product** — a drafting tool where generated
  text is the artifact being edited. Then it is authored content, not an assertion
  about evidence.
- **When there is no external accountability** and provenance genuinely does not
  matter. Rare in regulated domains; common in internal tooling.
- Note the cost: every read that wants evidence *and* commentary does a second
  lookup. That is the price of the guarantee, and in this domain it is cheap.

## Where this repository is honest and where it is not

**Honest:** evidence is immutable and checksum-verified; investigations and review
actions are append-only; the agent's declared vs. executed stages are reported
separately; the investigator badge reports the real provider rather than claiming
a live agent.

**Not yet production-ready**, and deliberately so for a demonstrator:

- The active profile is supplied by the client through a profile picker. A
  production identity provider must supply it — authorization currently
  *demonstrates* projection rather than enforcing it.
- There is no tenant isolation; the `_control.tenantId` prefix in
  [pattern 02](02-authorization-first-index-prefixes.md) is designed for it but
  the demonstrator runs single-tenant.
- Review actions record a decision but not an authenticated reviewer identity.
- Unknown study and signal identifiers fall back to the first available record
  rather than failing closed.

## In this repository

- Append-only writes: [`lib/data/review-store.ts`](../lib/data/review-store.ts)
- Read-only agent tools: [`services/agent/src/safety_agent/tools.py`](../services/agent/src/safety_agent/tools.py)
- Guardrail contract and execution envelope: [`app/api/investigations/route.ts`](../app/api/investigations/route.ts)
- Boundary documentation: [`docs/data-boundaries.md`](../docs/data-boundaries.md)
