# 0001 — Drop react-router

Status: Accepted (2026-05-20)

## Context

The app rendered everything under a single route:

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/">
      <Route index element={<App />} />
      <Route path="*" element={<p>No route found for current path</p>} />
    </Route>
  </Routes>
</BrowserRouter>
```

There are no subroutes — the app is one screen and uses query parameters
(`?tracks[0]=...&region=...`) to share state, not paths. The `Routes` wrapper
was effectively just providing context for `SafeLink`'s `useInRouterContext()`
branch, which itself was a fallback for "if a router exists, use `<Link>`,
otherwise render an `<a>`."

When the app was deployed to GitHub Pages at
`cmdcolin.github.io/sequenceTubeMap/`, the `Route path="/"` no longer matched
(path is `/sequenceTubeMap/`), so the catch-all rendered "No route found for
current path" and the app was blank.

Adding a `basename` to `BrowserRouter` had its own problems — the value depends
on where the bundle is served from, which means the build artifact is tied to
its deploy URL.

## Decision

Remove `react-router-dom` entirely:

- `index.tsx` mounts `<App />` directly with no router.
- `SafeLink` becomes a plain `<a>` (all call sites pass `href` for external
  URLs, never `to`).
- The `react-router-dom` dependency is removed.

## Consequences

Good:

- The same build runs at `/`, `/sequenceTubeMap/`, or any other subpath without
  config or rebuild.
- One fewer dependency (~50 KB) and one fewer concept readers have to track.
- No basename ↔ asset-path coupling to maintain.

Bad / future caveats:

- If we ever want real client-side routing (e.g. `/help`, `/about`, sharable
  region URLs as paths instead of query params), we have to re-introduce a
  router. Plan for that: prefer query params, or use a HashRouter so the
  basename problem doesn't come back.
- `SafeLink` is now just a renamed `<a>`. Worth inlining if it accrues no other
  responsibilities.
