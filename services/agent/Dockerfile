FROM python:3.11-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY vendor ./vendor
COPY src ./src
RUN pip install --no-cache-dir "uv==0.11.8"
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.11-slim AS runner
RUN groupadd --gid 1001 appuser && useradd --uid 1001 --gid 1001 --create-home appuser
WORKDIR /app
COPY --from=builder /app/.venv .venv
COPY --from=builder /app/src src
ENV PATH="/app/.venv/bin:$PATH"
USER appuser
EXPOSE 8082
CMD ["safety-agent"]
