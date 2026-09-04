# Bundled Magenta Agent

This service is part of the solution deployment. It reads the solution's own `study_evidence` and `evidence_chunks` collections through bounded, snapshot-scoped tools. It never calls Kehrnel.

The Magenta client libraries currently live in MongoDB's internal `10gen/magenta-client-libraries` repository. Internal builders must authenticate Git access until those packages are published to an installable registry. This affects building the agent image, not the browser application's runtime configuration.
