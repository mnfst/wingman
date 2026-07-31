// Background lookups against the endpoint the URL bar points at: is it up, and
// what models does it serve? Both are debounced past typing and both fail
// quietly. Neither is allowed to block sending a request.
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { ApiFormat } from '../formats';
import type { Provider } from '../providers';
import { DEFAULT_PROVIDER_ID } from '../providers';
import { checkHealth, type HealthStatus } from '../services/healthCheck';
import { fetchModels } from '../services/models';
import type { NormalizedBaseUrl } from '../services/baseUrl';

interface Deps {
  baseUrl: Accessor<string>;
  apiKey: Accessor<string>;
  format: Accessor<ApiFormat>;
  provider: Accessor<Provider>;
  normalized: Accessor<NormalizedBaseUrl>;
}

export function createProbes(d: Deps) {
  const [healthStatus, setHealthStatus] = createSignal<HealthStatus>({ kind: 'idle' });
  const [modelList, setModelList] = createSignal<string[]>([]);

  // Only formats that expose a health path (the Manifest gateway's
  // `/api/v1/health`) get probed. Public provider APIs have no such endpoint,
  // so probing one would 404 and show a "unreachable" that isn't true.
  createEffect(() => {
    const url = d.baseUrl().trim();
    const path = d.format().healthPath;
    if (d.provider().id !== DEFAULT_PROVIDER_ID || !url || !path) {
      setHealthStatus({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const formatPath = d.format().path;
    const timer = window.setTimeout(() => {
      setHealthStatus({ kind: 'checking' });
      // Guard on the signal for the same reason the model lookup does: an
      // aborted probe still settles, and its stale verdict would otherwise
      // land on top of the badge the newer target already produced.
      checkHealth(url, path, formatPath, controller.signal).then((status) => {
        if (!controller.signal.aborted) setHealthStatus(status);
      });
    }, 400);
    onCleanup(() => {
      window.clearTimeout(timer);
      controller.abort();
    });
  });

  // Fill the model dropdown from the endpoint's own catalog whenever the target
  // changes. A failure just leaves the field free-text, which is the common
  // case: plenty of providers don't allow a browser GET on /v1/models.
  createEffect(() => {
    const n = d.normalized();
    const key = d.apiKey();
    const fmt = d.format();
    if (!n.valid || !n.base) {
      setModelList([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchModels(n.base, key, fmt, controller.signal).then((models) => {
        if (!controller.signal.aborted) setModelList(models);
      });
    }, 500);
    onCleanup(() => {
      window.clearTimeout(timer);
      controller.abort();
    });
  });

  return { healthStatus, modelList };
}
