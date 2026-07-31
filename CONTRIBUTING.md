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

## Versioning

The version in the status bar comes from `package.json` and nobody edits it by hand. If your
change is one a user would notice, add a changeset:

```bash
npm run changeset
```

Pick `patch`, `minor` or `major`, write one line about what changed, and commit the file it
drops in `.changeset/`. When the PR lands, the release workflow opens a "Version Packages" PR
that does the bump and the changelog; merging it is the release. Invisible changes — CI, docs,
refactors — don't need one. More in [.changeset/README.md](.changeset/README.md).

## Ground rules

- One thing per PR. A fix and a refactor in the same diff take three times as long to review.
- Open an issue first for anything large, so you don't spend a weekend on something we would turn down.
- No backend, ever. Wingman is a static SPA and every request goes browser to provider. Anything needing a server of ours belongs elsewhere.
- Everything stays in `sessionStorage` — keys, base URL, model, prompts, history. That is on purpose: nothing Wingman holds should outlive the tab. Don't move any of it to `localStorage`.
- Adding a wire format is one file in `src/formats/` listed in its `index.ts`. Adding a client to impersonate is one entry in `src/profiles.ts` plus its snippet in `src/snippets/`.
- The Code panel and the request bars are two views of the same request. A new snippet has to round-trip: `src/snippets/parse.ts` reads it back, and `snippets.test.ts` checks every client in every language. Print the key with `keyExpr`/`keyInline` so it stays out of a shared screenshot.
- Logic in `src/services/` should come with tests. They sit next to the code as `*.test.ts` and run under Vitest.
- Prettier owns formatting. Run `npm run format` and don't argue with it.
- The social card at `public/og.png` is generated, not hand-drawn. Edit `scripts/og-image.html` and re-render with the command in its header comment.

## Commit messages

Something like `fix: stop the health badge going green on a host that isn't a gateway`. Present tense, and say what actually changed.

## Reporting bugs

Tell us the wire format, the client profile, and what the Response body tab showed. A screenshot of the request and response tabs usually explains the problem faster than a paragraph. Redact your key first.
