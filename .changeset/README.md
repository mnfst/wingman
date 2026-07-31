# Changesets

The version in the status bar comes from `package.json`, and nobody edits it by hand.

A PR that changes anything a user would notice adds a changeset, a small markdown file in
this folder saying how big the change is and what it did:

```bash
npm run changeset
```

Pick `patch` for a fix, `minor` for a feature, `major` for a break, write one line in the
present tense, and commit the file it creates alongside your code.

When that PR lands on `main`, the release workflow opens (or updates) a **Version Packages**
PR that bumps `package.json`, folds every pending changeset into `CHANGELOG.md`, and deletes
them. Merging that PR is the release: Vercel redeploys, and the new number shows up in the
status bar.

No changeset is needed for something invisible: CI tweaks, refactors, README edits.

Full docs: [changesets](https://github.com/changesets/changesets).
