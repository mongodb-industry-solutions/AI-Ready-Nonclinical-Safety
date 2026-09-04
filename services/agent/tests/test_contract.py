from safety_agent.prompt import investigation_context
from safety_agent.repository import SafetyRepository, reciprocal_rank_fusion


def test_investigation_context_binds_the_immutable_scope():
    prompt = investigation_context("Explain the pattern", "STUDY-1", "snapshot-2", "signal-3")

    assert "studyId=STUDY-1" in prompt
    assert "snapshotId=snapshot-2" in prompt
    assert "signalId=signal-3" in prompt


def test_repository_exposes_its_mongodb_network_host():
    repository = SafetyRepository("mongodb://localhost:27017", "safety")

    assert repository.hostname == "localhost"


def test_reciprocal_rank_fusion_rewards_evidence_found_by_both_lanes():
    lexical = [{"sourceRef": "MI:1"}, {"sourceRef": "MI:2"}]
    vector = [{"sourceRef": "MI:2"}, {"sourceRef": "LB:1"}]

    fused = reciprocal_rank_fusion([lexical, vector])

    assert fused[0]["sourceRef"] == "MI:2"
