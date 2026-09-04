# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir "uv==0.11.8"
RUN --mount=type=secret,id=github_token,required=true \
    token="$(cat /run/secrets/github_token)" && \
    git config --global url."https://x-access-token:${token}@github.com/".insteadOf "https://github.com/" && \
    uv sync --no-dev --no-editable && \
    rm -f /root/.gitconfig

FROM python:3.11-slim AS runner
RUN groupadd --gid 1001 appuser && useradd --uid 1001 --gid 1001 --create-home appuser
WORKDIR /app
COPY --from=builder /app/.venv .venv
COPY --from=builder /app/src src
ENV PATH="/app/.venv/bin:$PATH"
USER appuser
EXPOSE 8082
CMD ["safety-agent"]
