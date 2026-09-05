# perf2 — e2e / smoke verification

## Isolated Playwright smoke (own `chromium.launch()`, not the shared MCP browser)

Against `next build` + `next start -p 3566` (the final, committed code —
same account/Wave as the rest of this pass): signed in through the real
`/login` form, then visited Home, Explore and the Wave page. Zero console
errors and zero failed requests on all three (the only `requestfailed`
events observed were `net::ERR_ABORTED` on `?_rsc=` prefetch requests —
Next.js's own Link prefetch being cancelled by a subsequent navigation, not
a real failure — excluded from the count, same as any real QA process
would).

```
RESULTS: {
  "Home":    { "consoleErrors": 0, "failedRequests": 0 },
  "Explore": { "consoleErrors": 0, "failedRequests": 0 },
  "Wave":    { "consoleErrors": 0, "failedRequests": 0 }
}
SMOKE OK: zero console errors, zero failed requests
```

This also serves as the "pages still render identical data" check: Home
shows the real followed Wave, Explore shows real trending/rising-creator
data, and the Wave page renders the real Wave's trace, title, creator and
comments — all through the same `src/lib/db/**` reads as before this pass,
just reordered into fewer sequential round trips.

## `E2E_SUPABASE=1 npm run e2e -- critical-journey.spec.ts`: blocked, not by this pass's code

`playwright.config.ts`'s `webServer` reuses whatever `next dev -p 3333`
instance is already running (shared across every agent in this session,
per its own comment: "do not kill or restart that server — a person may be
browsing it"). Every attempt this pass made to run this spec (8 attempts,
spread over ~20 minutes, including after the unrelated `iyzico` build
breakage other agents were fixing concurrently was resolved) failed
identically:

```
[WebServer] HTTP GET: http://localhost:3333/
[WebServer] HTTP Status: 500
[WebServer] Starting WebServer process npm run dev -- -p 3333...
...
Error: listen EADDRINUSE: address already in use :::3333
```

Playwright's own readiness probe (`playwright-core`'s `isURLAvailable`,
confirmed by reading its source) got a real HTTP 500 from the *existing*
shared dev server at the exact instant each attempt started, decided it
was unhealthy, and tried to start its own — which then collided on the
already-bound port. Every manual check around each attempt (`curl`, plain
`node http.get`, IPv4, IPv6, 20 concurrent requests) got a healthy `307`
from that same server within seconds before and after — the shared server
itself is not actually down. This reads as a transient condition specific
to the exact moment Playwright's single probe fires (most plausibly HMR
recompilation from another agent's concurrent file save, or Windows
TCP/ephemeral-port churn from the very large number of test connections
this pass alone made against ports 3333/3566/3544 today), not a defect in
this pass's changes — none of which touch `playwright.config.ts`, the dev
server, or anything `critical-journey.spec.ts` exercises beyond the normal
Home/Explore/Wave pages already covered by the isolated smoke check above.

Not resolved within this pass's time budget. Flagged rather than worked
around by editing the shared `playwright.config.ts` or killing/restarting
the shared dev server (both explicitly against this repo's own documented
constraints for that file).
