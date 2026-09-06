"""Internal HTTP boundary between the Next.js application and Magenta graph."""

from __future__ import annotations

import os
import uuid
from typing import Any

from fastapi import FastAPI
from magenta_sdk_core import AgentInput, RequestContext
from pydantic import BaseModel, Field

from . import main as agent_main
from .prompt import investigation_context
from .widgets import extract_latest_tool_executions, extract_latest_widget_receipts

agent = agent_main.app.get_agent() if os.environ.get("OPENAI_API_KEY") else None
app = FastAPI(title="Bundled Nonclinical Safety Agent", version="1.0.0")


class EvidenceContext(BaseModel):
    studyId: str
    snapshotId: str
    signalId: str
    profileId: str
    canonicalEvidence: dict[str, Any] | None = None
    biologicalCoherence: dict[str, Any] | None = None
    semanticGrounding: dict[str, Any] | None = None
    literatureEvidence: dict[str, Any] | None = None
    portfolioContext: dict[str, Any] | None = None
    deterministicContract: dict[str, Any]


class AskRequest(BaseModel):
    text: str = Field(min_length=3, max_length=2000)
    context: EvidenceContext
    userId: str = "safety-solution-user"
    sessionId: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ready" if agent else "deterministic-fallback",
        "agent": "nonclinical-safety-agent",
    }


@app.post("/ask")
async def ask(request: AskRequest) -> dict[str, Any]:
    if agent is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    session_id = request.sessionId or f"safety-{uuid.uuid4().hex[:12]}"
    context = RequestContext(execution_id=session_id, session_id=session_id, user_id=request.userId)
    prompt = investigation_context(
        request.text,
        request.context.studyId,
        request.context.snapshotId,
        request.context.signalId,
        request.context.profileId,
        request.context.deterministicContract,
        request.context.model_dump(
            exclude={
                "studyId",
                "snapshotId",
                "signalId",
                "profileId",
                "deterministicContract",
            },
            exclude_none=True,
        ),
    )
    output = await agent.invoke(context, AgentInput(payload={"message": prompt}))
    response = dict(output.response or {})
    widgets: list[dict[str, Any]] = []
    steps: list[dict[str, Any]] = []
    graph = getattr(agent, "_graph", None)
    if graph is not None:
        state = await graph.aget_state({"configurable": {"thread_id": session_id}})
        messages = list(state.values.get("messages", []))
        widgets = extract_latest_widget_receipts(messages)
        steps = extract_latest_tool_executions(messages)
    steps.append(
        {
            "id": "synthesize",
            "label": "Compose cited review hypothesis",
            "engine": "synthesis",
            "status": "complete",
            "detail": "Read-only Magenta response over deterministic tool results",
        }
    )
    return {
        "sessionId": session_id,
        "answer": response.get("response", ""),
        "messageCount": response.get("message_count", 0),
        "widgets": widgets,
        "confidence": "review",
        "citations": response.get("citations")
        or [
            {
                "domain": "MI",
                "label": "Signal evidence",
                "detail": request.context.signalId,
                "sourceRef": f"{request.context.snapshotId}:MI:{request.context.signalId}",
            },
            {
                "domain": "LINEAGE",
                "label": "Snapshot provenance",
                "detail": request.context.studyId,
                "sourceRef": request.context.snapshotId,
            },
        ],
        "steps": steps,
        "guardrails": {"readOnly": True, "snapshotBound": True, "regulatoryConclusion": False},
        "provider": "magenta",
    }


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("GATEWAY_PORT", "8082")))


if __name__ == "__main__":
    main()
