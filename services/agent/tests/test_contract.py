from safety_agent.prompt import SYSTEM_PROMPT, investigation_context
from safety_agent.repository import SafetyRepository, reciprocal_rank_fusion


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
    prompt = investigation_context("Explain the pattern", "STUDY-1", "snapshot-2", "signal-3")

    assert "studyId=STUDY-1" in prompt
    assert "snapshotId=snapshot-2" in prompt
    assert "signalId=signal-3" in prompt
    assert "profileId=toxicologist" in prompt


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
