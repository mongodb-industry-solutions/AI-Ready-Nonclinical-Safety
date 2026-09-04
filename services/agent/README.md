# Bundled Magenta Agent

This service is part of the solution deployment. It reads the solution's own `study_evidence` and `evidence_chunks` collections through bounded, snapshot-scoped tools. It never calls Kehrnel.

The Magenta runtime wheels are checked into `vendor/`, following the same self-contained packaging pattern as `patient-access-coordination-advisor`. Building and running the solution therefore requires no GitHub token and no external Magenta service URL.
