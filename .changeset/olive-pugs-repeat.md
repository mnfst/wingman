---
'wingman': patch
---

Repeat visits load faster and unknown URLs return a real 404. Every path on the domain used to answer 200 with the full app, and nothing was cached, not even the content-hashed bundle, so each visit revalidated the JS, the CSS and three preloaded fonts before anything rendered. The title bar wordmark is now the page heading, the phoenix mark is fetched once instead of twice, and other sites can no longer embed Wingman in an iframe.
