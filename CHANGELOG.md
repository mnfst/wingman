# wingman

## 0.2.0

### Minor Changes

- 5fd0a78: Wingman installs as an app. It ships a web app manifest with proper name, icons and screenshots, a service worker that caches its own shell so a cold launch is instant and survives a dead connection, and an Install entry in the status bar that appears when the browser offers one. Requests to your gateway are untouched by the worker. They were never Wingman's to cache.

### Patch Changes

- 1b20739: The installed app is called "Wingman - LLM API testing". Em dashes are gone from the rest of the writing too, in the UI, the About copy and the gist report.
- a58ff94: Repeat visits load faster and unknown URLs return a real 404. Every path on the domain used to answer 200 with the full app, and nothing was cached, not even the content-hashed bundle, so each visit revalidated the JS, the CSS and three preloaded fonts before anything rendered. The title bar wordmark is now the page heading, the phoenix mark is fetched once instead of twice, and other sites can no longer embed Wingman in an iframe.
- 5fd0a78: The About modal links where people actually need to go: report an issue and start a discussion sit next to the star button, the ecosystem entry for Manifest points at its repository like every other entry, and the Manifest site is linked from the sentence that names it.
- 5fd0a78: The health badge says `healthy` instead of a bare millisecond count that read like the latency of a request nobody had sent yet; the probe time moved to its tooltip. The wand on the empty pane is half again as large.
- f18e193: The client menu opens on the OpenAI SDK, with the other SDKs behind it, then the agent clients, then Default. Snippet scrollbars are slim and dark instead of the system bar the browser painted across the bottom of any snippet that overflowed, and the highlighted layer no longer slips half a line out of register when a snippet is scrolled to the end.
