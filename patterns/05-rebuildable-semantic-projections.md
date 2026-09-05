# 05 · Rebuildable semantic projections

## Problem

Teams that build a semantic layer usually persist it as *the* model — a set of
collections that applications read and, eventually, write. Two failures follow:

- The serving shape becomes the authority, so governance moves from the
  authoring tool into whatever the application happened to store.
- Every consumer needs a different traversal (filtered lists, graph walks, text
  search), and one collection cannot serve all three well.

## Pattern

Distinguish three representations and let only the middle one be authoritative:

1. **Authoring store** — partitioned objects, edges, terminology and governance
   resources, optimised for editing and review. Lives in the authoring tool.
2. **Portable runtime artifact** — a content-addressed `SemanticRuntimeBundle`:
   one immutable, versioned, signed release. **This is the authority.**
3. **Serving projections** — MongoDB shapes rebuilt from exactly one release.
   Disposable by construction.

The serving footprint:

| Collection | Role |
|---|---|
| `semantic_releases` | Immutable imported bundles and their digests |
| `semantic_runtime_pointer` | The atomic active-release pointer |
| `semantic_resources` | Polymorphic resource plane for filtering and inspection |
| `semantic_edges` | Definition relationships, for `$graphLookup` traversal |
| `semantic_search_documents` | Profile-scoped text projection with Automated Embedding |
| `semantic_change_events` | Proposals, compilation and activation events |

Resources and edges are split because their workloads differ: resource lookup is
a filtered fetch, whereas definition traversal needs forward and reverse graph
walks. Retrieval text is separate again because it is profile-scoped and
auto-embedded.

Activation is a pointer swap. A new release is imported, all three projections
are materialised, and only then does `semantic_runtime_pointer` move — so readers
never observe a half-built release.

**Name operational graphs honestly.** `Finding → Publication → DocumentChunk` is
an *evidence* graph. It is traversed with `$graphLookup`, but it does not become
part of the semantic map's definitions merely because it is traversable.

## Why

- One governed artifact, many disposable serving shapes.
- Each projection is optimised for its own access pattern without competing for
  authority.
- Rollback is a pointer move, not a migration.
- The application imports a release; it never imports authoring-tool internals.

## When *not* to use it

- **Small, stable vocabularies.** A fixed enum does not need a release pipeline.
- **When the semantic model must be edited in production by end users.** Then
  authoring *is* the runtime, and this separation fights you.
- **When you have one consumer and one traversal.** The three-projection split is
  justified by having genuinely different workloads, not by tidiness.

## Release promotion must be atomic across dependents

A caveat this repository currently demonstrates the hard way: the active release
is `0.3.0`, but literature graph relationships are still stamped `0.2.0`, so the
literature graph stage falls back even though lexical and vector lanes execute.

Promoting a release must rebuild or rebind **every dependent projection** in the
same operation. A pointer swap that leaves stale edges behind is a partial
activation wearing the costume of a complete one.

## In this repository

- Compiled release: [`semantic/nonclinical-safety-runtime.json`](../semantic/nonclinical-safety-runtime.json)
- Import and materialisation: [`scripts/import-semantics.mjs`](../scripts/import-semantics.mjs), [`lib/semantics/materialization.ts`](../lib/semantics/materialization.ts)
- Profile projection and resolution: [`lib/semantics/runtime.ts`](../lib/semantics/runtime.ts), [`lib/semantics/repository.ts`](../lib/semantics/repository.ts)
- Change-stream driven refresh: [`app/api/semantics/stream/route.ts`](../app/api/semantics/stream/route.ts)
