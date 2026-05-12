# Wingman

Hosted single-page playground for testing a [Manifest](https://manifest.build) gateway. Impersonate any of the agents Manifest tracks — **OpenClaw**, **Hermes**, **OpenAI SDK**, **Vercel AI SDK**, **LangChain**, plain **cURL**, or a raw fetch — and inspect the exact request / response that lands on your backend.

Live at **<https://wingman.manifest.build>**.

## What it's for

- Verifying routing decisions (which tier did Manifest pick for this prompt?).
- Inspecting how the proxy classifies different SDKs from their User-Agent / `X-Stainless-*` headers.
- Reproducing a customer report end-to-end without touching the real CLI.
- Onboarding contributors who want to see what an OpenClaw or Hermes request actually looks like.

## How it works (and what it doesn't do)

Wingman is a **static SPA**. It has no backend of its own — every request goes straight from your browser to whatever Manifest gateway you configure in the connection bar. There is no telemetry, no server-side logging, no proxy in between.

Your API key is held in `sessionStorage` (cleared when you close the tab). Everything else — base URL, model, history, system prompts — is in `localStorage` and never leaves the browser. The full source is in this repo if you want to audit it.

## Connecting to a gateway

Open <https://wingman.manifest.build>, paste:

- **Base URL** — e.g. `https://your-manifest.example.com` or `http://localhost:3001` (more on cross-origin below).
- **API key** — your `mnfst_*` token.
- **Model** — `auto` or a specific model id.

You can pre-fill via query string: `?baseUrl=https://your.gateway&apiKey=mnfst_...`. The Manifest dashboard's Wingman drawer does this automatically.

### Cross-origin requirements

Wingman runs at `wingman.manifest.build` and your gateway runs elsewhere, so the gateway must allow the Wingman origin via CORS. The Manifest backend allows it out of the box; self-hosters running a different backend need:

```
Access-Control-Allow-Origin: https://wingman.manifest.build
Access-Control-Allow-Headers: Authorization, Content-Type, X-API-Key
```

`Access-Control-Allow-Credentials` should stay **false** — Wingman uses bearer keys, never cookies.

If you're behind a corporate firewall or running a fully air-gapped Manifest, clone this repo and `npm run dev` — Wingman runs entirely client-side.

## Local development

```bash
npm install
npm run dev
# → http://localhost:3002
```

| Variable        | Default | Purpose                |
| --------------- | ------- | ---------------------- |
| `WINGMAN_PORT`  | `3002`  | Vite dev server port.  |

Scripts:

- `npm run dev` — start Vite dev server.
- `npm run build` — production build into `dist/`.
- `npm run preview` — serve the built bundle.
- `npm run lint` — ESLint over `src/`.
- `npm run format` — Prettier across `src/`.
- `npm run typecheck` — `tsc --noEmit`.

## How it's wired

- **`src/profiles.ts`** — catalog of every supported agent/SDK shape. Adding a new one means adding one entry: headers, system prompt, body builder, code snippet builder. The UI picks up the new tile automatically.
- **`src/send.ts`** — single fetch wrapper that captures status, latency, request/response headers, and parses JSON when possible. Filters out forbidden headers (`User-Agent`, `Sec-*`, `Cookie`, etc.) that browsers refuse to set on fetch and surfaces them in the UI.
- **`src/App.tsx`** — composes the layout: connection bar → profile tiles → form → header editor → SDK code preview → response panel.

## Caveats

Browsers don't let JavaScript override `User-Agent`, `Cookie`, or any `Sec-*` header on `fetch`. That means impersonating SDK fingerprints from the browser is partial — Manifest will still see the browser's real User-Agent. The header editor flags which entries got dropped so you know.

For a full-fidelity impersonation, copy the `curl` snippet shown in the SDK preview panel and run it from your terminal.

## License

MIT — see [LICENSE](./LICENSE).
