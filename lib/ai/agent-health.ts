export type AgentStatus = 'ready' | 'not-configured' | 'unreachable' | 'degraded';

export interface AgentHealth {
  status: AgentStatus;
  /** Present when the bundled agent answered its own health probe. */
  agent?: string;
  /** Human-readable reason, shown in the UI when the agent is not answering. */
  detail: string;
  checkedAt: string;
}

const CACHE_MS = 10_000;
let cached: { at: number; value: AgentHealth } | null = null;

/**
 * Probes the bundled Magenta gateway rather than inferring liveness from the
 * presence of an environment variable. `INTERNAL_AGENT_URL` being set only means
 * someone intended to run the agent; it says nothing about whether the service
 * is up or whether it has an LLM key.
 */
export async function agentHealth(force = false): Promise<AgentHealth> {
  const url = process.env.INTERNAL_AGENT_URL?.replace(/\/$/, '');
  const checkedAt = new Date().toISOString();

  if (!url) {
    return { status: 'not-configured', detail: 'INTERNAL_AGENT_URL is not set; the deterministic investigator answers instead.', checkedAt };
  }
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  let value: AgentHealth;
  try {
    const response = await fetch(`${url}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(Number(process.env.AGENT_HEALTH_TIMEOUT_MS || 2500)),
    });
    if (!response.ok) {
      value = { status: 'unreachable', detail: `Agent health check returned HTTP ${response.status}.`, checkedAt };
    } else {
      const body = await response.json() as { status?: string; agent?: string };
      value = body.status === 'ready'
        ? { status: 'ready', agent: body.agent, detail: 'The bundled Magenta runtime is answering investigations.', checkedAt }
        : { status: 'degraded', agent: body.agent, detail: 'The agent is running without an LLM key (OPENAI_API_KEY); it reports deterministic-fallback.', checkedAt };
    }
  } catch (error) {
    value = {
      status: 'unreachable',
      detail: `Agent did not respond at ${url}: ${error instanceof Error ? error.message : 'unknown error'}.`,
      checkedAt,
    };
  }

  cached = { at: Date.now(), value };
  return value;
}
