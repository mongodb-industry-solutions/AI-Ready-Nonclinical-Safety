"""Magenta tools over solution-owned, snapshot-scoped MongoDB collections."""

from __future__ import annotations

from typing import Any

from .repository import SafetyRepository
from .widgets import WidgetKind


def register_safety_tools(app: Any, repository: SafetyRepository) -> None:
    network = [repository.hostname]

    @app.tool(is_local=False, network=network)
    def get_study_summary(study_id: str, snapshot_id: str, profile_id: str) -> str:
        """Return the study, dose groups, record counts, and source provenance."""
        return repository.summary(study_id, snapshot_id, profile_id)

    @app.tool(is_local=False, network=network)
    def analyze_safety_signal(
        study_id: str, snapshot_id: str, signal_id: str, profile_id: str
    ) -> str:
        """Return exact incidence, severity, dose, and correlated laboratory evidence."""
        return repository.signal(study_id, snapshot_id, signal_id, profile_id)

    @app.tool(is_local=False, network=network)
    def search_safety_evidence(
        study_id: str,
        snapshot_id: str,
        query: str,
        profile_id: str,
        limit: int = 8,
    ) -> str:
        """Search bounded evidence chunks using Atlas Search with a lexical fallback."""
        return repository.search(study_id, snapshot_id, query, profile_id, limit)

    @app.tool(is_local=False, network=network)
    def search_literature_evidence(
        study_id: str,
        snapshot_id: str,
        signal_id: str,
        query: str,
        profile_id: str,
        limit: int = 8,
    ) -> str:
        """Retrieve attributed literature context through governed hybrid search."""
        return repository.literature(
            study_id, snapshot_id, signal_id, query, profile_id, limit
        )

    @app.tool(is_local=False, network=network)
    def trace_source_lineage(study_id: str, snapshot_id: str, profile_id: str) -> str:
        """Return the immutable public source revision and artifact checksums."""
        return repository.lineage(study_id, snapshot_id, profile_id)

    @app.tool(is_local=False, network=network)
    def present_evidence_widget(
        widget_kind: WidgetKind,
        study_id: str,
        snapshot_id: str,
        signal_id: str,
        profile_id: str,
    ) -> str:
        """Request one useful visual widget after evidence retrieval.

        Call this only after the factual resolver tools needed for the answer.
        The receipt selects a renderer; chart values are hydrated from the
        deterministic, snapshot-bound resolver output and never from prose.
        Request at most three focused widgets per answer. Use execution-plan
        when the user asks how a result was obtained.
        """
        return repository.present_widget(
            widget_kind, study_id, snapshot_id, signal_id, profile_id
        )
