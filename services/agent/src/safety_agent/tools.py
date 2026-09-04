"""Magenta tools over solution-owned, snapshot-scoped MongoDB collections."""

from __future__ import annotations

from typing import Any

from .repository import SafetyRepository


def register_safety_tools(app: Any, repository: SafetyRepository) -> None:
    network = [repository.hostname]

    @app.tool(is_local=False, network=network)
    def get_study_summary(study_id: str, snapshot_id: str) -> str:
        """Return the study, dose groups, record counts, and source provenance."""
        return repository.summary(study_id, snapshot_id)

    @app.tool(is_local=False, network=network)
    def analyze_safety_signal(study_id: str, snapshot_id: str, signal_id: str) -> str:
        """Return exact incidence, severity, dose, and correlated laboratory evidence."""
        return repository.signal(study_id, snapshot_id, signal_id)

    @app.tool(is_local=False, network=network)
    def search_safety_evidence(study_id: str, snapshot_id: str, query: str, limit: int = 8) -> str:
        """Search bounded evidence chunks using Atlas Search with a lexical fallback."""
        return repository.search(study_id, snapshot_id, query, limit)

    @app.tool(is_local=False, network=network)
    def trace_source_lineage(study_id: str, snapshot_id: str) -> str:
        """Return the immutable public source revision and artifact checksums."""
        return repository.lineage(study_id, snapshot_id)
