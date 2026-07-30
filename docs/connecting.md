# Connecting Wingman to a gateway

## The connection bar

- **Provider preset** picks a provider (OpenAI, Anthropic, Mistral, Groq, …) and auto-fills its base URL and wire format. The default, **Custom / Manifest**, pre-fills the Manifest Cloud gateway (`https://app.manifest.build`). Editing the Base URL by hand switches the pill back to Custom.
- **Format** is the wire protocol: OpenAI Chat Completions (`/v1/chat/completions`), OpenAI Responses (`/v1/responses`), or Anthropic Messages (`/v1/messages`). It decides the endpoint path, auth scheme, body shape, and how the response is parsed.
- **Base URL**, e.g. `https://your-manifest.example.com`, `https://api.openai.com`, or `http://localhost:3001`. Wingman appends the format's path and shows the resolved endpoint under the bar whenever normalisation changed what you typed. Pasting a full endpoint or a base ending in `/v1` is fine: the duplicate is stripped rather than producing `/v1/v1/chat/completions`. A missing scheme is filled in (`http://` for loopback hosts, `https://` otherwise).
- **API key** becomes `Authorization: Bearer` for OpenAI-style formats and `x-api-key` for Anthropic. Keys are kept per provider, so switching preset shows that provider's own key and switching back restores it.
- **Model** is `auto` or a specific model id. When the endpoint answers `GET /v1/models`, the field becomes a dropdown of that catalog; otherwise it stays free text.
- **Stream** reads the reply as it is generated over Server-Sent Events.

You can pre-fill from the query string: `?baseUrl=https://your.gateway&apiKey=mnfst_...`. The Manifest dashboard's Wingman drawer does this automatically.

## CORS

Wingman runs at `wingman.manifest.build` and your gateway runs elsewhere, so the gateway has to allow the Wingman origin. The Manifest backend allows it in dev mode (`NODE_ENV !== 'production'`), which covers local and self-hosted-dev gateways. Production builds keep CORS off, since the dashboard is same-origin there, so pointing Wingman at a production gateway means opting into CORS for the Wingman origin yourself.

Whatever the backend, the preflight needs at least:

```
Access-Control-Allow-Origin: https://wingman.manifest.build
Access-Control-Allow-Headers: Authorization, Content-Type, X-API-Key, X-Stainless-Lang, X-Stainless-Package-Version, X-Stainless-OS, X-Stainless-Arch, X-Stainless-Runtime, X-Stainless-Runtime-Version, X-Stainless-Retry-Count
```

The `X-Stainless-*` headers matter. The OpenClaw, Hermes, and OpenAI SDK profiles replay them to mimic the real SDK fingerprint, so an allow-list that omits them fails the preflight and the request never leaves the browser. Hermes sends a couple more (`X-Stainless-Async`, `X-Stainless-Read-Timeout`), so the robust option is to reflect the request's `Access-Control-Request-Headers` instead of hard-coding a list.

`Access-Control-Allow-Credentials` can stay false. Wingman uses bearer keys, never cookies.

Calling Anthropic directly is a special case: its API blocks browser origins by default, so Wingman sends `anthropic-dangerous-direct-browser-access: true` (alongside `anthropic-version`) automatically when you pick the Anthropic Messages format.

## Gateways on localhost

CORS is not the obstacle here, and the distinction is worth being precise about because the symptom looks identical.

If your gateway is on a loopback or private address (`localhost`, `127.0.0.1`, `192.168.x.x`) and you load Wingman over HTTPS, the browser blocks the request before CORS is even consulted. Chrome 138 and later gate public-page to local-network requests behind the Local Network Access permission, which replaced Private Network Access, so the `Access-Control-Allow-Private-Network: true` preflight header that used to satisfy it no longer does anything. Safari refuses the call outright as mixed content. In a cross-origin iframe the permission is denied by permissions policy unless the embedder adds `allow="local-network-access"`, which means no prompt ever appears.

No change to the gateway can lift this. It is a property of the two origins. To test a local gateway, serve Wingman from the local network too:

```bash
git clone https://github.com/mnfst/wingman && cd wingman
npm install && npm run dev
# http://localhost:3002, same address space as your gateway
```

Wingman reports this case as **local network blocked** rather than "CORS blocked", so you don't go editing an allow-list that was already correct.

The same clone-and-run answer applies behind a corporate firewall or against a fully air-gapped Manifest.

## Local development

```bash
npm install
npm run dev
# http://localhost:3002
```

| Variable       | Default | Purpose               |
| -------------- | ------- | --------------------- |
| `WINGMAN_PORT` | `3002`  | Vite dev server port. |

Scripts: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`, `npm run format`, `npm run typecheck`, `npm test`.

## How the code is laid out

- **`src/formats/`** has one module per wire format (`openai-chat`, `openai-responses`, `anthropic-messages`). Each owns its endpoint path, auth scheme, body builder, response parsers, and streaming parser. Adding a format means adding one file and listing it in `index.ts`.
- **`src/profiles.ts`** is the catalog of agent and SDK fingerprints layered on a format: headers, system prompt, optional body extras, code snippet. Each profile declares which formats it is compatible with, and the UI filters the list to the selected format.
- **`src/snippets.ts`** builds the format-aware SDK and cURL snippets shown under the Client tab.
- **`src/send.ts`** is the fetch wrapper that captures status, latency, request and response headers, and parses JSON. `sendRequestStreaming` reads the SSE body and assembles the text via the format's stream parser. It filters out forbidden headers (`User-Agent`, `Sec-*`, `Cookie`, …) that browsers refuse to set on fetch and surfaces them in the UI.
- **`src/services/sse.ts`** is a generic Server-Sent Events reader.
- **`src/App.tsx`** composes the layout: Postman-style config on top (request tabs, URL bar, then Client / Headers / System Prompt) with the chat thread and message box below. It is wiring only.
- **`src/state/`** holds everything else: `appState.ts` the signals and derived values, `appActions.ts` the tab, history and sharing actions, `sendAction.ts` the request itself, `requestForm.ts` the snippet and header overrides (keyed per format, client and language), `probes.ts` the health and model lookups, `drafts.ts` the open draft tabs.
