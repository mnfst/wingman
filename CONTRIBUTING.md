# Contributing

Wingman is deliberately small. Most changes are quick to review as long as they stay focused.

## Running it

```bash
npm install
npm run dev     # http://localhost:3002
```

Set `WINGMAN_PORT` if 3002 is taken.

## Before you open a PR

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs those four on every pull request, so a red one won't get merged.

## Ground rules

- One thing per PR. A fix and a refactor in the same diff take three times as long to review.
- Open an issue first for anything large, so you don't spend a weekend on something we would turn down.
- No backend, ever. Wingman is a static SPA and every request goes browser to provider. Anything needing a server of ours belongs elsewhere.
- API keys stay in `sessionStorage`. That is on purpose, so contributors don't leave a live token on disk. Don't move them to `localStorage`.
- Adding a wire format is one file in `src/formats/` listed in its `index.ts`. Adding a client to impersonate is one entry in `src/profiles.ts`.
- Logic in `src/services/` should come with tests. They sit next to the code as `*.test.ts` and run under Vitest.
- Prettier owns formatting. Run `npm run format` and don't argue with it.

## Commit messages

Something like `fix: stop the health badge going green on a host that isn't a gateway`. Present tense, and say what actually changed.

## Reporting bugs

Tell us the wire format, the client profile, and what the Response body tab showed. A screenshot of the request and response tabs usually explains the problem faster than a paragraph. Redact your key first.
