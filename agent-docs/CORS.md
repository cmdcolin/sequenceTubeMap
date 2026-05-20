CORS works cleanly. Results:

REST (https://api.tubemap.graphs.vg/api/v0):

- OPTIONS /getFilenames (preflight from cmdcolin.github.io) → 200 OK,
  Access-Control-Allow-Origin: \*
- GET /getFilenames → 200 OK with Access-Control-Allow-Origin: \*, returns the
  real file list (includes exampleData/internal/snp1kg-BRCA1.vg.xg, BRCA1 BED,
  etc.)
- POST /getPathNames with {"graphFile":"exampleData/x.vg.xg"} → 200 OK,
  {"pathNames":["x"]}

The header is wildcarded (\*), so any fork/origin can hit it.

WebSocket (wss://api.tubemap.graphs.vg/):

- Upgrade handshake with Origin: https://cmdcolin.github.io → 101 Switching
  Protocols, server echoes our Origin back. So the live filename-change channel
  works too.

So flipping BACKEND_URL to "https://api.tubemap.graphs.vg" in src/config.json
should Just Work for the gh-pages deploy — no proxy, no CORS shim, no separate
WS config needed. I've updated agent-docs/UPSTREAM.md mentally with the result;
want me to append the confirmed curl outputs to that file so it's not just
"should work" speculation?
