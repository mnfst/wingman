# Wingman

Hosted single-page playground for testing LLM APIs straight from the browser. Pick a **wire format** — OpenAI **Chat Completions**, OpenAI **Responses**, or **Anthropic Messages** — paste a base URL + key, and call any provider that speaks it (Manifest, OpenAI, Anthropic, Together, Fireworks, Groq, DeepSeek, Z.AI, MiniMax, …). Stream the reply token by token or fetch it whole, and inspect the exact request / response on the wire.

It started as a [Manifest](https://manifest.build) gateway tester, so it also impersonates the agents Manifest tracks — **OpenClaw**, **Hermes**, **OpenAI SDK**, **Vercel AI SDK**, **LangChain**, plain **cURL**, or a raw fetch — to show how the proxy classifies each client.

Live at **<https://wingman.manifest.build>**.

## What it's for

- Calling any LLM provider by URL + key + format — no SDK install, no terminal.
- Comparing the same prompt across formats (Chat Completions vs Responses) or across providers.
- Watching a streamed response arrive token by token, with time-to-first-token.
- Verifying Manifest routing decisions (which tier did it pick for this prompt?).
- Inspecting how a proxy classifies different SDKs from their User-Agent / `X-Stainless-*` headers.
- Reproducing a customer report end-to-end without touching the real CLI.

## How it works (and what it doesn't do)

Wingman is a **static SPA**. It has no backend of its own — every request goes straight from your browser to whatever endpoint you configure in the connection bar. There is no telemetry, no server-side logging, no proxy in between. Streaming responses are read directly from the `fetch` body as Server-Sent Events.

Your API key is held in `sessionStorage` (cleared when you close the tab). Everything else — base URL, model, history, system prompts — is in `localStorage` and never leaves the browser. The full source is in this repo if you want to audit it.

## Connecting to a gateway

Open <https://wingman.manifest.build>, then:

- **Provider preset** — pick a provider (OpenAI, Anthropic, Mistral, Groq, …) to auto-fill its base URL and wire format. The default, **Custom / Manifest**, pre-fills the Manifest Cloud gateway (`https://app.manifest.build`) — edit the Base URL by hand to point at your own gateway (which switches the pill back to Custom).
- **Format** — the wire protocol: OpenAI Chat Completions (`/v1/chat/completions`), OpenAI Responses (`/v1/responses`), or Anthropic Messages (`/v1/messages`). This sets the endpoint path, auth scheme, body shape, and how the response is parsed.
- **Base URL** — e.g. `https://your-manifest.example.com`, `https://api.openai.com`, `https://api.anthropic.com`, or `http://localhost:3001` (more on cross-origin below). Wingman appends the format's path.
- **API key** — `Authorization: Bearer` for OpenAI-style formats, `x-api-key` for Anthropic (attached automatically per format).
- **Model** — `auto` or a specific model id.
- **Stream** — toggle in the composer toolbar to read the reply as it's generated (Server-Sent Events).

You can pre-fill via query string: `?baseUrl=https://your.gateway&apiKey=mnfst_...`. The Manifest dashboard's Wingman drawer does this automatically.

### Cross-origin requirements

Wingman runs at `wingman.manifest.build` and your gateway runs elsewhere, so the gateway must allow the Wingman origin via CORS. The Manifest backend allows it **in dev mode** (`NODE_ENV !== 'production'`), which covers local and self-hosted-dev gateways. Production builds keep CORS off — the dashboard is same-origin there — so pointing Wingman at a production gateway means opting into CORS for the Wingman origin yourself.

Whatever the backend, it must answer the preflight with at least:

```
Access-Control-Allow-Origin: https://wingman.manifest.build
Access-Control-Allow-Headers: Authorization, Content-Type, X-API-Key, X-Stainless-Lang, X-Stainless-Package-Version, X-Stainless-OS, X-Stainless-Arch, X-Stainless-Runtime, X-Stainless-Runtime-Version, X-Stainless-Retry-Count
```

The `X-Stainless-*` headers matter: the OpenClaw, Hermes, and OpenAI SDK profiles replay them to mimic the real SDK fingerprint, so an allow-list that omits them fails the preflight and the request never leaves the browser. Hermes sends a couple more (`X-Stainless-Async`, `X-Stainless-Read-Timeout`), so the robust option is to reflect the request's `Access-Control-Request-Headers` instead of hard-coding a list.

If the gateway is on a loopback address (`localhost` / `127.0.0.1`) and you load Wingman over HTTPS, Chrome's Private Network Access also wants `Access-Control-Allow-Private-Network: true` on the preflight.

Calling **Anthropic** directly: its API blocks browser origins by default, so Wingman sends the `anthropic-dangerous-direct-browser-access: true` header (alongside `anthropic-version`) automatically when you pick the Anthropic Messages format.

`Access-Control-Allow-Credentials` can stay **false** — Wingman uses bearer keys, never cookies.

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

- **`src/formats/`** — one module per wire format (`openai-chat`, `openai-responses`, `anthropic-messages`). Each owns its endpoint path, auth scheme, body builder, response parsers, and streaming parser. Adding a provider format means adding one file and listing it in `index.ts`.
- **`src/profiles.ts`** — catalog of agent/SDK fingerprints layered on a format: headers, system prompt, optional body extras, code snippet. Each profile declares which formats it's compatible with; the UI filters the list to the selected format.
- **`src/snippets.ts`** — format-aware SDK / cURL code-snippet builders for the preview panel.
- **`src/send.ts`** — fetch wrapper that captures status, latency, request/response headers, and parses JSON. `sendRequestStreaming` reads the SSE body and assembles the text via the format's stream parser. Filters out forbidden headers (`User-Agent`, `Sec-*`, `Cookie`, …) that browsers refuse to set on fetch and surfaces them in the UI.
- **`src/services/sse.ts`** — generic Server-Sent Events reader (decodes the stream, splits events).
- **`src/App.tsx`** — composes the layout: format + client pickers → connection bar → form → header editor → SDK code preview → response panel.

## Caveats

Browsers don't let JavaScript override `User-Agent`, `Cookie`, or any `Sec-*` header on `fetch`. That means impersonating SDK fingerprints from the browser is partial — Manifest will still see the browser's real User-Agent. The header editor flags which entries got dropped so you know.

For a full-fidelity impersonation, copy the `curl` snippet shown in the SDK preview panel and run it from your terminal.

## License

MIT — see [LICENSE](./LICENSE).
