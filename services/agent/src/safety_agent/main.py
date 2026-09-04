"""Magenta/LangGraph runtime packaged with the solution."""

from __future__ import annotations

import os
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode
from magenta_sdklanggraph import App

from .prompt import SYSTEM_PROMPT
from .repository import SafetyRepository
from .tools import register_safety_tools


class SafetyAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


mongodb_uri = os.environ.get("MONGODB_URI", "")
database_name = os.environ.get("MONGODB_DATABASE", "nonclinical_safety_solution")
if not mongodb_uri:
    raise RuntimeError("MONGODB_URI is required by the bundled Magenta service")
os.environ.setdefault("RUNNER_MODE", "aer")
app = App(app_name="nonclinical-safety-agent", mongodb_uri=mongodb_uri, database_name=database_name)
register_safety_tools(app, SafetyRepository(mongodb_uri, database_name))


def _next(state: SafetyAgentState) -> Literal["tools", "end"]:
    return "tools" if getattr(state["messages"][-1], "tool_calls", None) else "end"


@app.entrypoint
def build_agent() -> CompiledStateGraph:
    model = app.llm(
        ChatOpenAI(
            model=os.environ.get("OPENAI_MODEL", "gpt-5.4-mini"),
            temperature=0,
            api_key=os.environ.get("OPENAI_API_KEY"),
        )
    ).bind_tools(app.get_tool_schemas())

    def investigate(state: SafetyAgentState):
        messages = list(state["messages"])
        if not messages or not isinstance(messages[0], SystemMessage):
            messages.insert(0, SystemMessage(content=SYSTEM_PROMPT))
        return {"messages": [app.validate_llm_response(model.invoke(messages))]}

    graph = StateGraph(SafetyAgentState)
    graph.add_node("investigate", investigate)
    graph.add_node("tools", ToolNode(app.get_tools()))
    graph.add_edge(START, "investigate")
    graph.add_conditional_edges("investigate", _next, {"tools": "tools", "end": END})
    graph.add_edge("tools", "investigate")
    checkpointer = app.checkpointer() if mongodb_uri else MemorySaver()
    return graph.compile(checkpointer=checkpointer)
