"""Typed presentation receipts emitted only by registered Magenta tools."""

from __future__ import annotations

import json
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

WidgetKind = Literal[
    "dose-response",
    "laboratory-trajectory",
    "biological-coherence",
    "portfolio-context",
    "semantic-grounding",
    "literature-evidence",
    "execution-plan",
    "evidence-topology",
]

WIDGET_RECEIPT_TYPE = "nonclinical-safety.widget-receipt"
WIDGET_RECEIPT_SCHEMA_VERSION = "1.0.0"


def widget_receipt(
    widget_kind: WidgetKind,
    study_id: str,
    snapshot_id: str,
    signal_id: str,
    profile_id: str,
) -> str:
    """Create a portable receipt. It contains no model-generated chart data."""

    return json.dumps(
        {
            "type": WIDGET_RECEIPT_TYPE,
            "schemaVersion": WIDGET_RECEIPT_SCHEMA_VERSION,
            "widgetKind": widget_kind,
            "scope": {
                "studyId": study_id,
                "snapshotId": snapshot_id,
                "signalId": signal_id,
                "profileId": profile_id,
            },
            "hydration": "deterministic-resolver-output",
        },
        separators=(",", ":"),
    )


def _text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(block.get("text", "")) if isinstance(block, dict) else str(block)
            for block in content
        )
    return str(content or "")


def extract_latest_widget_receipts(messages: list[Any]) -> list[dict[str, Any]]:
    """Extract only receipts produced after the latest user turn."""

    last_human_index = max(
        (index for index, message in enumerate(messages) if isinstance(message, HumanMessage)),
        default=-1,
    )
    receipts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for message in messages[last_human_index + 1 :]:
        if not isinstance(message, ToolMessage) or message.name != "present_evidence_widget":
            continue
        try:
            receipt = json.loads(_text_content(message.content))
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if (
            not isinstance(receipt, dict)
            or receipt.get("type") != WIDGET_RECEIPT_TYPE
            or receipt.get("schemaVersion") != WIDGET_RECEIPT_SCHEMA_VERSION
        ):
            continue
        kind = str(receipt.get("widgetKind", ""))
        if kind in seen:
            continue
        seen.add(kind)
        receipt["toolCallId"] = message.tool_call_id
        receipts.append(receipt)
    return receipts


def extract_latest_tool_executions(messages: list[Any]) -> list[dict[str, Any]]:
    """Return an inspectable trace of tools that actually completed this turn."""

    last_human_index = max(
        (index for index, message in enumerate(messages) if isinstance(message, HumanMessage)),
        default=-1,
    )
    calls: dict[str, dict[str, Any]] = {}
    for message in messages[last_human_index + 1 :]:
        if not isinstance(message, AIMessage):
            continue
        for call in message.tool_calls:
            calls[str(call.get("id", ""))] = {
                "name": str(call.get("name", "registered-tool")),
                "args": call.get("args") if isinstance(call.get("args"), dict) else {},
            }

    engine_by_tool = {
        "get_study_summary": "structured",
        "analyze_safety_signal": "structured",
        "search_safety_evidence": "rerank",
        "search_literature_evidence": "rerank",
        "trace_source_lineage": "graph",
        "present_evidence_widget": "synthesis",
    }
    executions: list[dict[str, Any]] = []
    for message in messages[last_human_index + 1 :]:
        if not isinstance(message, ToolMessage):
            continue
        call = calls.get(str(message.tool_call_id), {})
        name = str(message.name or call.get("name") or "registered-tool")
        args = call.get("args") if isinstance(call.get("args"), dict) else {}
        scope = " / ".join(
            str(args[key])
            for key in ("study_id", "snapshot_id", "signal_id")
            if args.get(key)
        )
        detail_parts = ["registered Magenta tool"]
        if scope:
            detail_parts.append(scope)
        if args.get("query"):
            detail_parts.append(f"query={str(args['query'])[:120]}")
        if args.get("widget_kind"):
            detail_parts.append(f"widget={args['widget_kind']}")
        executions.append(
            {
                "id": f"tool-{len(executions) + 1}-{name}",
                "label": name.replace("_", " "),
                "engine": engine_by_tool.get(name, "structured"),
                "status": "complete",
                "detail": " · ".join(detail_parts),
            }
        )
    return executions
