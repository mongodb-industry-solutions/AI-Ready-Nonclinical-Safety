"""OpenAI-compatible model configuration for local and managed Magenta runtimes."""

from __future__ import annotations

import os
from typing import Any

from langchain_openai import ChatOpenAI


def openai_model_kwargs() -> dict[str, Any]:
    """Return provider-safe kwargs without coupling evidence resolution to the LLM."""

    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", "").strip()
    kwargs: dict[str, Any] = {
        "model": os.environ.get("OPENAI_MODEL", "gpt-5.4-mini"),
        "temperature": 0,
        "api_key": api_key,
    }
    if not base_url:
        return kwargs

    if "grove-foundry" in base_url:
        base_url = base_url.split("/v1", maxsplit=1)[0] + "/v1"
    else:
        base_url = base_url.rstrip("/")
    kwargs["base_url"] = base_url

    if "grove-foundry" in base_url or ".openai.azure.com" in base_url:
        kwargs["default_headers"] = {"api-key": api_key}
    if ".openai.azure.com" in base_url:
        kwargs["default_query"] = {
            "api-version": os.environ.get(
                "AZURE_OPENAI_API_VERSION", "2024-12-01-preview"
            )
        }
    return kwargs


def build_llm() -> ChatOpenAI:
    """Build the configured chat model for the Magenta graph."""

    return ChatOpenAI(**openai_model_kwargs())
