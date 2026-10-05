---
name: prefetch-neighbour-windows
description: Fetch the windows a shift left or right would land on in the background, so the shift skips the fetch; the redraw still re-lays out from scratch.
---

# Prefetch the neighbouring windows

Shift left/right (`shiftRegion` in `src/components/HeaderForm.tsx`, half a
window per step) is a full fetch and a full redraw. Fetching the window that a
shift would land on, in the background once the current one has arrived, makes
the shift itself instant without touching layout.

## Shape

- After a successful fetch of `region`, compute the two shifted windows the
  buttons would produce and `mutate`/`preload` them into the SWR cache under the
  same `FetchKey` shape (`src/components/tubeMapData.ts`).
- `fetchTubeMapData` allows one in-flight fetch and aborts the rest, on purpose:
  the view a fetch was for is gone. A prefetch has to run outside that rule, and
  be the first thing a new foreground fetch aborts, so it never delays the view
  the user asked for.
- Prefetch only under the width notice's line (`LARGE_REGION_BP`) and only when
  the current window drew without the render cap firing; a neighbour of a window
  that was already too wide is not worth a second fetch.
- Skip it for read tracks, where the GAM query is the expensive part and a shift
  rarely follows.

## What it does not fix

The arrival still re-runs `layoutTubeMap` from scratch and resets the viewport.
See [tiled-tubemap-layout.md](../waiting-on-a-call/tiled-tubemap-layout.md) for that.
