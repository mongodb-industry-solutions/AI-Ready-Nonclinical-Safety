import json

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from safety_agent.llm import openai_model_kwargs
from safety_agent.prompt import SYSTEM_PROMPT, investigation_context
from safety_agent.repository import SafetyRepository, reciprocal_rank_fusion
from safety_agent.widgets import (
    extract_latest_tool_executions,
    extract_latest_widget_receipts,
    widget_receipt,
)


class _Collection:
    def __init__(self, value):
        self.value = value

    def find_one(self, *_args, **_kwargs):
        return self.value


class _SemanticDatabase:
    semantic_runtime_pointer = _Collection({"id": "active", "releaseId": "safety@1"})
    semantic_releases = _Collection(
        {
            "bundle": {
                "capabilities": [
                    {"id": "retrieve-literature-evidence", "allowedProfiles": ["toxicologist"]}
                ]
            }
        }
    )


def test_investigation_context_binds_the_immutable_scope():
    prompt = investigation_context(
        "Explain the pattern",
        "STUDY-1",
        "snapshot-2",
        "signal-3",
        deterministic_contract={
            "resolverId": "resolver.investigate-safety-signal.v1",
            "semanticReleaseId": "safety@1",
            "availableWidgets": ["dose-response"],
        },
    )

    assert "studyId=STUDY-1" in prompt
    assert "snapshotId=snapshot-2" in prompt
    assert "signalId=signal-3" in prompt
    assert "profileId=toxicologist" in prompt
    assert "resolver.investigate-safety-signal.v1" in prompt
    assert "dose-response" in prompt


def test_repository_exposes_its_mongodb_network_host():
    repository = SafetyRepository("mongodb://localhost:27017", "safety")

    assert repository.hostname == "localhost"


def test_reciprocal_rank_fusion_rewards_evidence_found_by_both_lanes():
    lexical = [{"sourceRef": "MI:1"}, {"sourceRef": "MI:2"}]
    vector = [{"sourceRef": "MI:2"}, {"sourceRef": "LB:1"}]

    fused = reciprocal_rank_fusion([lexical, vector])

    assert fused[0]["sourceRef"] == "MI:2"


def test_agent_keeps_literature_context_separate_from_study_observations():
    assert "external context" in SYSTEM_PROMPT
    assert "never establishes compound-specific causality" in SYSTEM_PROMPT
    assert "Conversation memory provides continuity, not factual authority" in SYSTEM_PROMPT


def test_widget_receipts_are_extracted_from_registered_tool_messages_for_latest_turn():
    old = widget_receipt(
        "evidence-topology", "STUDY-1", "snapshot-2", "signal-3", "toxicologist"
    )
    current = widget_receipt(
        "dose-response", "STUDY-1", "snapshot-2", "signal-3", "toxicologist"
    )
    messages = [
        HumanMessage(content="old question"),
        ToolMessage(content=old, tool_call_id="old", name="present_evidence_widget"),
        HumanMessage(content="current question"),
        ToolMessage(content=current, tool_call_id="current", name="present_evidence_widget"),
        ToolMessage(content=current, tool_call_id="duplicate", name="present_evidence_widget"),
    ]

    receipts = extract_latest_widget_receipts(messages)

    assert len(receipts) == 1
    assert receipts[0]["widgetKind"] == "dose-response"
    assert receipts[0]["toolCallId"] == "current"
    assert json.loads(current)["hydration"] == "deterministic-resolver-output"


def test_repository_enforces_compiled_profile_capabilities():
    repository = SafetyRepository("mongodb://localhost:27017", "safety")
    repository.database = _SemanticDatabase()

    repository._authorize("toxicologist", "retrieve-literature-evidence")
    try:
        repository._authorize("external-reviewer", "retrieve-literature-evidence")
    except ValueError as error:
        assert "not authorized" in str(error)
    else:
        raise AssertionError("an unauthorized profile reached the agent tool")


def test_openai_model_kwargs_supports_grove_gateway(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "not-a-real-key")
    monkeypatch.setenv(
        "OPENAI_BASE_URL",
        "https://grove.example.test/grove-foundry-prod/openai/v1/chat/completions",
    )

    kwargs = openai_model_kwargs()

    assert kwargs["base_url"] == "https://grove.example.test/grove-foundry-prod/openai/v1"
    assert kwargs["default_headers"] == {"api-key": "not-a-real-key"}


def test_latest_tool_execution_trace_comes_from_actual_tool_messages():
    messages = [
        HumanMessage(content="first"),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "id": "call-1",
                    "name": "analyze_safety_signal",
                    "args": {
                        "study_id": "STUDY-1",
                        "snapshot_id": "snapshot-2",
                        "signal_id": "signal-3",
                    },
                }
            ],
        ),
        ToolMessage(content="{}", tool_call_id="call-1", name="analyze_safety_signal"),
    ]

    steps = extract_latest_tool_executions(messages)

    assert steps == [
        {
            "id": "tool-1-analyze_safety_signal",
            "label": "analyze safety signal",
            "engine": "structured",
            "status": "complete",
            "detail": (
                "registered Magenta tool · STUDY-1 / snapshot-2 / signal-3"
            ),
        }
    ]
