---
'wingman': minor
---

Wingman installs as an app. It ships a web app manifest with proper name, icons and screenshots, a service worker that caches its own shell so a cold launch is instant and survives a dead connection, and an Install entry in the status bar that appears when the browser offers one. Requests to your gateway are untouched by the worker. They were never Wingman's to cache.
