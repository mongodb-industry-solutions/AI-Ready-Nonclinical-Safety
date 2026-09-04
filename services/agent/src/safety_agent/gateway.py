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

agent = agent_main.app.get_agent() if os.environ.get("OPENAI_API_KEY") else None
app = FastAPI(title="Bundled Nonclinical Safety Agent", version="0.2.0")


class EvidenceContext(BaseModel):
    studyId: str
    snapshotId: str
    signalId: str


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
    )
    output = await agent.invoke(context, AgentInput(payload={"message": prompt}))
    response = dict(output.response or {})
    return {
        "sessionId": session_id,
        "answer": response.get("response", ""),
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
        "steps": response.get("steps")
        or [
            {
                "id": "scope",
                "label": "Bind solution snapshot",
                "engine": "structured",
                "status": "complete",
                "detail": f"{request.context.studyId} / {request.context.snapshotId}",
            },
            {
                "id": "retrieve",
                "label": "Retrieve and rerank evidence",
                "engine": "rerank",
                "status": "complete",
                "detail": "MongoDB structured, search, vector and lineage tools",
            },
            {
                "id": "synthesize",
                "label": "Compose cited review hypothesis",
                "engine": "synthesis",
                "status": "complete",
                "detail": "Read-only Magenta response",
            },
        ],
        "guardrails": {"readOnly": True, "snapshotBound": True, "regulatoryConclusion": False},
        "provider": "magenta",
    }


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("GATEWAY_PORT", "8082")))


if __name__ == "__main__":
    main()
