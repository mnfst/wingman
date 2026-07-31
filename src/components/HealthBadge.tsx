import { Show, type Component } from 'solid-js';
import type { HealthStatus } from '../services/healthCheck';

/** Every status that puts something on screen, which is all but `idle`. */
type ShownHealth = Exclude<HealthStatus, { kind: 'idle' }>;

// The outer span stays mounted so the live region exists before the status
// flips. Screen readers only announce changes inside an already-present
// aria-live node.
const HealthBadge: Component<{ status: HealthStatus }> = (p) => {
  // Narrowing here rather than inside the label helpers: they then cover the
  // union exhaustively and need no unreachable fallback arm.
  const shown = (): ShownHealth | null => (p.status.kind === 'idle' ? null : p.status);
  const isError = (s: ShownHealth) => s.kind !== 'ok' && s.kind !== 'checking';
  return (
    <span role="status" aria-live="polite" aria-label="Gateway health">
      <Show when={shown()}>
        {(s) => (
          <span
            class="health-badge"
            classList={{
              'health-badge--ok': s().kind === 'ok',
              'health-badge--warn': s().kind === 'checking',
              'health-badge--err': isError(s()),
            }}
            title={healthTitle(s())}
          >
            {healthLabel(s())}
          </span>
        )}
      </Show>
    </span>
  );
};

// A bare "119ms" in the address field reads as the latency of something the
// user did, which it never is. Nobody asked for it and no send has happened
// yet. Say what the badge actually means and leave the number to the tooltip.
function healthLabel(s: ShownHealth): string {
  switch (s.kind) {
    case 'ok':
      return 'healthy';
    case 'checking':
      return '…';
    case 'invalid':
      return 'invalid URL';
    case 'failed':
      return s.label;
    case 'not-a-gateway':
      return 'not a gateway';
    case 'http-error':
      return `HTTP ${s.status}`;
  }
}

// The badge only ever proves the health endpoint answered. It says nothing
// about the endpoint a send targets. Naming the probed URL keeps a green badge
// from being read as "your request will work".
function healthTitle(s: ShownHealth): string {
  switch (s.kind) {
    case 'ok':
      return `Health check succeeded in ${s.latencyMs} ms. Probed ${s.probedUrl}`;
    case 'checking':
      return 'Checking the gateway health endpoint…';
    case 'invalid':
    case 'failed':
    case 'not-a-gateway':
      return s.message;
    case 'http-error':
      return `${s.probedUrl} returned ${s.status} ${s.statusText}`;
  }
}

export default HealthBadge;
