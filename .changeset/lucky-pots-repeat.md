---
'wingman': patch
---

Fixes six bugs a full test pass turned up. The format, provider, client and model dropdowns each leaked a pair of document listeners every time they opened, and a click landing outside an element threw instead of closing the menu. A health probe abandoned by retargeting the Base URL could still land its verdict on the badge after a newer one had answered. A streamed response left its body, and the connection behind it, open once the format hit its terminal event. Picking a client that no longer exists left the form on a fallback and a dead id in the session. The gist dialog re-ran its setup on every unrelated render.
