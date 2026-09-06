# Bundled Magenta Agent

This service is part of the solution deployment. It reads the solution's own `study_evidence` and `evidence_chunks` collections through bounded, snapshot-scoped tools. It never calls Kehrnel.

The graph has two intentionally different forms of context. Its MongoDB-backed checkpoint stores conversational continuity. Registered evidence tools re-resolve factual data for the immutable study/snapshot/signal/profile scope on every relevant turn. After retrieval, Magenta may call `present_evidence_widget`; the tool returns a typed receipt, never chart values. The application validates that receipt and hydrates the visual from deterministic resolver output.

The Magenta runtime wheels are checked into `vendor/`, following the same self-contained packaging pattern as `patient-access-coordination-advisor`. Building and running the solution therefore requires no GitHub token and no external Magenta service URL.
