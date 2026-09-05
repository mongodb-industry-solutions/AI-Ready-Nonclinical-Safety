"""Bounded MongoDB access for the solution-owned evidence model."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from bson import json_util
from pymongo import MongoClient
from pymongo.errors import PyMongoError


def reciprocal_rank_fusion(
    result_sets: list[list[dict[str, Any]]], constant: int = 60
) -> list[dict[str, Any]]:
    fused: dict[str, dict[str, Any]] = {}
    for rows in result_sets:
        for rank, row in enumerate(rows, start=1):
            identity = str(row["sourceRef"])
            current = fused.setdefault(identity, {**row, "rrfScore": 0.0})
            current["rrfScore"] += 1 / (constant + rank)
    return sorted(fused.values(), key=lambda row: row["rrfScore"], reverse=True)


@dataclass
class SafetyRepository:
    uri: str
    database_name: str

    def __post_init__(self) -> None:
        self.database = MongoClient(self.uri)[self.database_name]

    @property
    def hostname(self) -> str:
        return urlparse(self.uri).hostname or "localhost"

    def _authorize(self, profile_id: str, capability_id: str) -> None:
        pointer = self.database.semantic_runtime_pointer.find_one({"id": "active"})
        query = (
            {"releaseId": pointer["releaseId"]}
            if pointer and pointer.get("releaseId")
            else {"active": True}
        )
        release = self.database.semantic_releases.find_one(query, {"_id": 0, "bundle": 1})
        capabilities = (release or {}).get("bundle", {}).get("capabilities", [])
        capability = next(
            (item for item in capabilities if item.get("id") == capability_id), None
        )
        if not capability or profile_id not in capability.get("allowedProfiles", []):
            raise ValueError(
                f"Profile {profile_id!r} is not authorized for capability {capability_id!r}"
            )

    def _study(self, study_id: str, snapshot_id: str) -> dict[str, Any]:
        document = self.database.study_evidence.find_one(
            {"study.id": study_id, "study.snapshotId": snapshot_id},
            {"_id": 0, "importedAt": 0, "importSource": 0},
        )
        if not document:
            raise ValueError("The requested study snapshot is not available")
        return document

    def summary(self, study_id: str, snapshot_id: str, profile_id: str) -> str:
        self._authorize(profile_id, "rank-findings")
        document = self._study(study_id, snapshot_id)
        return json_util.dumps(
            {
                "study": document["study"],
                "doseGroups": document["doseGroups"],
                "provenance": document["provenance"],
            }
        )

    def signal(
        self, study_id: str, snapshot_id: str, signal_id: str, profile_id: str
    ) -> str:
        self._authorize(profile_id, "rank-findings")
        document = self._study(study_id, snapshot_id)
        signal = next((item for item in document["signals"] if item["id"] == signal_id), None)
        if not signal:
            raise ValueError("The requested signal is not available in this snapshot")
        correlated = signal.get("correlatedLab")
        return json_util.dumps(
            {
                "signal": signal,
                "doseGroups": document["doseGroups"],
                "laboratorySeries": document.get("labSeries", {}).get(correlated),
            }
        )

    def search(
        self,
        study_id: str,
        snapshot_id: str,
        query: str,
        profile_id: str,
        limit: int = 8,
    ) -> str:
        self._authorize(profile_id, "retrieve-similar-findings")
        safe_limit = min(max(limit, 1), 20)
        scope = {"studyId": study_id, "snapshotId": snapshot_id}
        search_index = os.environ.get("ATLAS_SEARCH_INDEX")
        lexical_rows: list[dict[str, Any]] = []
        used_atlas_search = False
        if search_index:
            try:
                lexical_rows = list(
                    self.database.evidence_chunks.aggregate(
                        [
                            {
                                "$search": {
                                    "index": search_index,
                                    "text": {
                                        "query": query,
                                        "path": ["text", "metadata.finding", "metadata.organ"],
                                    },
                                }
                            },
                            {"$match": scope},
                            {"$limit": safe_limit},
                            {
                                "$project": {
                                    "_id": 0,
                                    "score": {"$meta": "searchScore"},
                                    "chunkId": 1,
                                    "domain": 1,
                                    "text": 1,
                                    "sourceRef": 1,
                                    "metadata": 1,
                                }
                            },
                        ]
                    )
                )
                used_atlas_search = bool(lexical_rows)
            except PyMongoError:
                lexical_rows = []
        if not lexical_rows:
            terms = [re.escape(term) for term in query.split() if len(term) > 2][:8]
            lexical = re.compile("|".join(terms), re.IGNORECASE) if terms else re.compile(".*")
            lexical_rows = list(
                self.database.evidence_chunks.find(
                    {**scope, "text": lexical},
                    {"_id": 0},
                ).limit(safe_limit)
            )

        vector_rows = self._vector_search(scope, query, safe_limit)
        rows = reciprocal_rank_fusion([lexical_rows, vector_rows])[:safe_limit]
        mode = (
            "hybrid-rrf"
            if vector_rows
            else "atlas-search"
            if used_atlas_search
            else "bounded-lexical"
        )
        return json_util.dumps({"mode": mode, "rows": rows})

    def _vector_search(self, scope: dict[str, str], query: str, limit: int) -> list[dict[str, Any]]:
        vector_index = os.environ.get("ATLAS_VECTOR_INDEX")
        if not vector_index or not os.environ.get("OPENAI_API_KEY"):
            return []
        try:
            from langchain_openai import OpenAIEmbeddings
            from openai import OpenAIError

            embeddings = OpenAIEmbeddings(
                model=os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
            )
            missing = list(
                self.database.evidence_chunks.find(
                    {**scope, "embedding": {"$exists": False}}, {"_id": 1, "text": 1}
                ).limit(100)
            )
            if missing:
                vectors = embeddings.embed_documents([row["text"] for row in missing])
                for row, vector in zip(missing, vectors, strict=True):
                    self.database.evidence_chunks.update_one(
                        {"_id": row["_id"]}, {"$set": {"embedding": vector}}
                    )
            query_vector = embeddings.embed_query(query)
            return list(
                self.database.evidence_chunks.aggregate(
                    [
                        {
                            "$vectorSearch": {
                                "index": vector_index,
                                "path": "embedding",
                                "queryVector": query_vector,
                                "filter": scope,
                                "numCandidates": max(50, limit * 10),
                                "limit": limit,
                            }
                        },
                        {
                            "$project": {
                                "_id": 0,
                                "score": {"$meta": "vectorSearchScore"},
                                "chunkId": 1,
                                "domain": 1,
                                "text": 1,
                                "sourceRef": 1,
                                "metadata": 1,
                            }
                        },
                    ]
                )
            )
        except (OpenAIError, PyMongoError, ValueError):
            return []

    def literature(
        self,
        study_id: str,
        snapshot_id: str,
        signal_id: str,
        query: str,
        profile_id: str,
        limit: int = 8,
    ) -> str:
        """Retrieve governed external context without treating it as study evidence."""

        self._authorize(profile_id, "retrieve-literature-evidence")
        self._study(study_id, snapshot_id)
        safe_limit = min(max(limit, 1), 20)
        scope = {"matchedSignalIds": signal_id}
        exact_documents = list(
            self.database.literature_documents.find(scope, {"_id": 0}).limit(safe_limit)
        )
        if not exact_documents:
            return json_util.dumps(
                {"mode": "empty", "rows": [], "boundary": "context-not-causality"}
            )

        lexical_rows: list[dict[str, Any]] = []
        used_atlas_search = False
        search_index = os.environ.get("ATLAS_LITERATURE_SEARCH_INDEX", "safety_literature_search")
        try:
            lexical_rows = list(
                self.database.literature_chunks.aggregate(
                    [
                        {
                            "$search": {
                                "index": search_index,
                                "compound": {
                                    "filter": [
                                        {
                                            "text": {
                                                "query": signal_id,
                                                "path": "matchedSignalIds",
                                            }
                                        }
                                    ],
                                    "should": [
                                        {
                                            "text": {
                                                "query": query,
                                                "path": "text",
                                                "fuzzy": {"maxEdits": 1},
                                            }
                                        },
                                        {"text": {"query": query, "path": "concepts"}},
                                    ],
                                    "minimumShouldMatch": 1,
                                },
                            }
                        },
                        {"$limit": safe_limit},
                        {
                            "$project": {
                                "_id": 0,
                                "publicationId": 1,
                                "score": {"$meta": "searchScore"},
                            }
                        },
                    ]
                )
            )
            used_atlas_search = bool(lexical_rows)
        except PyMongoError:
            terms = [re.escape(term) for term in query.split() if len(term) > 2][:8]
            lexical = re.compile("|".join(terms), re.IGNORECASE) if terms else re.compile(".*")
            lexical_rows = list(
                self.database.literature_chunks.find(
                    {**scope, "text": lexical}, {"_id": 0, "publicationId": 1}
                ).limit(safe_limit)
            )

        vector_rows = self._literature_vector_search(scope, query, safe_limit)
        graph_rows: list[dict[str, Any]] = []
        try:
            semantic_release_id = os.environ.get(
                "SEMANTIC_RELEASE_ID", "org.contextobjects.nonclinical-safety@0.1.0"
            )
            graph_paths = self.database.semantic_evidence_edges.aggregate(
                [
                    {
                        "$match": {
                            "releaseId": semantic_release_id,
                            "from": f"Finding:{signal_id}",
                        }
                    },
                    {
                        "$graphLookup": {
                            "from": "semantic_evidence_edges",
                            "startWith": "$to",
                            "connectFromField": "to",
                            "connectToField": "from",
                            "as": "descendants",
                            "maxDepth": 1,
                            "restrictSearchWithMatch": {"releaseId": semantic_release_id},
                        }
                    },
                ]
            )
            graph_rows = [
                {"publicationId": row["to"].removeprefix("Publication:")}
                for row in graph_paths
                if str(row.get("to", "")).startswith("Publication:")
            ]
        except PyMongoError:
            graph_rows = []

        lanes = []
        for rows in (lexical_rows, vector_rows, graph_rows):
            for row in rows:
                row["sourceRef"] = row.get("publicationId", row.get("sourceRef"))
            if rows:
                lanes.append(rows)
        fused = reciprocal_rank_fusion(lanes) if lanes else []
        score_by_id = {str(row["sourceRef"]): row["rrfScore"] for row in fused}
        role_weight = {
            "pathology-reference": 3,
            "analogous-pattern": 2,
            "alternative-explanation": 1,
        }
        exact_documents.sort(
            key=lambda row: (
                score_by_id.get(str(row["id"]), 0),
                role_weight.get(str(row.get("evidenceRole")), 0),
            ),
            reverse=True,
        )
        for row in exact_documents:
            row["retrieval"] = {
                "rrfScore": score_by_id.get(str(row["id"]), 0),
                "source": "mongodb",
            }
        mode = "atlas-hybrid" if vector_rows else "atlas-search" if used_atlas_search else "mongodb-exact"
        return json_util.dumps(
            {
                "mode": mode,
                "rows": exact_documents[:safe_limit],
                "boundary": "context-not-causality",
                "queryScope": {
                    "studyId": study_id,
                    "snapshotId": snapshot_id,
                    "signalId": signal_id,
                },
            }
        )

    def _literature_vector_search(
        self, scope: dict[str, str], query: str, limit: int
    ) -> list[dict[str, Any]]:
        vector_index = os.environ.get(
            "ATLAS_LITERATURE_VECTOR_INDEX", "safety_literature_vector"
        )
        if not os.environ.get("OPENAI_API_KEY"):
            return []
        try:
            from langchain_openai import OpenAIEmbeddings
            from openai import OpenAIError

            embeddings = OpenAIEmbeddings(
                model=os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
            )
            query_vector = embeddings.embed_query(query)
            return list(
                self.database.literature_chunks.aggregate(
                    [
                        {
                            "$vectorSearch": {
                                "index": vector_index,
                                "path": "embedding",
                                "queryVector": query_vector,
                                "filter": scope,
                                "numCandidates": max(50, limit * 10),
                                "limit": limit,
                            }
                        },
                        {
                            "$project": {
                                "_id": 0,
                                "publicationId": 1,
                                "score": {"$meta": "vectorSearchScore"},
                            }
                        },
                    ]
                )
            )
        except (OpenAIError, PyMongoError, ValueError):
            return []

    def lineage(self, study_id: str, snapshot_id: str, profile_id: str) -> str:
        self._authorize(profile_id, "expand-evidence-neighborhood")
        document = self._study(study_id, snapshot_id)
        return json_util.dumps(
            {
                "studyId": study_id,
                "snapshotId": snapshot_id,
                "source": document["study"]["source"],
                "sourceRevision": document["study"]["sourceRevision"],
                "sourceArtifacts": document["provenance"].get("sourceArtifacts", {}),
            }
        )
