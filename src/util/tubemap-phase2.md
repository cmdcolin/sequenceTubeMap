# tubemap.ts Phase 2 handoff (in progress)

This document supersedes the earlier phase 1 handoff. Read this *first*.

## Current state

- `src/util/tubemap.ts`: ~5700 lines, body still suppressed by `// @ts-nocheck`
  at line 1. Many exported function signatures are now properly typed; the
  internal body still has the original loose JS.
- `pnpm vitest run src/util/tubemap.test.ts` → 20/20 pass.
- `pnpm vitest run` → 79/80 pass. The one failure (`App.test.tsx > renders
  without crashing when sent bad fetch data from server`) is **pre-existing**,
  not caused by phase-2 work.
- `pnpm build` succeeds.
- `pnpm tsc --noEmit` → 24 errors. **0 in tubemap.ts**, 0 in tubemap.test.ts.
  Remaining errors are pre-existing in unrelated files (HeaderForm.tsx,
  headerFormUtils.ts, BedFileDropdown.tsx, RegionInput.tsx, TrackList.tsx,
  TrackFilePicker.tsx, App.tsx, PathsPanel.tsx, CustomizationAccordion.tsx).
  None of these block phase 2.

## What's been typed (this pass)

1. **Domain types restructured.** `Node` and `Track` now have a clean
   layered shape:
   - `InputNode` — minimal shape accepted by `create()` (name, seq,
     optional sequenceLength).
   - `Node extends InputNode` — layout-complete shape with width, pixelWidth,
     order, x, y, predecessors, etc. all required.
   - Same split for `InputTrack` → `Track`.
   - This avoids the all-optional-fields code smell. Consumers use the
     `Input*` shapes; layout/drawing code uses the full shapes.
2. **vg-json shapes.** `VgJson`, `VgPath`, `VgMapping`, `VgPosition`,
   `VgEdit`, `VgNode`, `VgRead` are exported and typed. `VgMapping.position`
   is optional (cigar_string only reads `edit`; vgExtractReads narrows).
3. **Tested exports** (used in `tubemap.test.ts`): `cigar_string`,
   `coverage`, `numReadsVisitNode`, `axisIntervals` are fully typed.
   `cigar_string` uses a `CigarToken = number | CigarOp` token list.
   `coverage` uses minimal `NodeCoverageInfo` / `ReadCoverageInfo`
   interfaces — not the full `Node`/`Track` — so tests can pass partial
   fixtures.
4. **vg extractors**: `vgExtractNodes`, `vgExtractTracks`, `vgExtractReads`
   return typed `ExtractedVgNode[]` / `ExtractedVgTrack[]` /
   `ExtractedVgRead[]`. The Read shape includes id, sourceTrackID, type,
   firstNodeOffset, finalNodeCoverLength, mapping_quality, etc.
5. **Setters and trivial helpers**: `setMergeNodesFlag`, `setColorSet`,
   `setReadGroups`, `setFocusReadNames`, `setColoredNodes`,
   `setNodeWidthOption`, etc. — all typed.
6. **`create(params: CreateParams)`** typed; CreateParams uses
   `InputNode[]` / `InputTrack[]`.
7. **Test file updated** (`tubemap.test.ts`):
   - `NodeLike` / `ReadLike` widened to include the extra fields the test
     fixtures actually have (id, type, sourceTrackID, sequence,
     mismatches).
   - All `const node = { ... }` annotated `: NodeLike`.
   - All `const reads = [...]` annotated `: ReadLike[]`.
   - All `const nodePixelCoordinates = [...]` annotated
     `: [number, number][]`.
   - Renamed test data `nodename: '3'` typo → `name: '3'`.
8. **Consumer files updated to use the new types:**
   - `src/components/TubeMap.tsx` — props now `InputNode[]` / `InputTrack[]`,
     not `unknown`.
   - `src/components/TubeMapContainer.tsx` — state typed, `unknown[]` casts
     removed. Helper `paletteForIndex` instead of bare indexing.
   - `src/components/tubeMapData.ts` — `DemoData`, `computeExampleData`
     typed against InputNode/InputTrack/VgJson/VgRead. STATIC_EXAMPLE_TRACKS
     / READ_EXAMPLES narrowed to `TrackKey` / `GraphKey` / `ReadsKey`
     subsets of `keyof DemoData` so the indexed access returns the right
     type without unions.
   - `src/api/APIInterface.ts` — `ChunkedDataResponse` uses VgJson / VgRead[][]
     / InputRegion / string[] instead of `unknown` everywhere.

## What remains

The body of `tubemap.ts` (under `@ts-nocheck`) still contains:

- **Layout algorithms**: `generateNodeOrder`, `switchNodeOrientation`,
  `generateLaneAssignment`, `mergeNodes`, `generateNodeXCoords`,
  `generateNodeWidth`, etc. These mutate `nodes` and `tracks` (the
  module-level state) heavily and use indexed access like
  `nodes[Math.abs(seq[i])]`. With `noUncheckedIndexedAccess` you'll get
  many `T | undefined` results. Suggested helper:
  ```ts
  function nodeAt(idx: number): Node {
    const n = nodes[idx]
    if (n === undefined) throw new Error(`nodes[${idx}] missing`)
    return n
  }
  ```
- **d3 drawing**: `drawNodes`, `drawTrackRectangles`, `drawTrackCurves`,
  `drawTrackCorners`, `drawMismatches`, `drawRuler`, `defineSVGPatterns`,
  `drawLegend`. Type the Selection chains. `SvgGroupSelection` alias is
  already defined; you may need more (e.g. for `<pattern>` selections).
- **Mismatch / ruler overlays** — last, since they touch most internals.

## Hard constraints (re-iterated from user CLAUDE.md)

- **No `any`. No typecasts** — `as`, `!`, `as unknown as X` are all out.
  Type predicates (`x is T`) are the escape hatch. The original phase 1
  cast `(d3.selection.prototype as { attrs: unknown }).attrs = ...` at the
  top of the file is the ONLY one in the current source — replace with a
  proper module augmentation if you find a clean way.
- **Avoid optionals where possible.** Prefer separate input/layout types
  (see the InputNode/Node split done in this pass) over blanket
  optional fields.
- **Avoid early returns** — nest if statements or use ternaries.
- **`||` / `??` are code smells** — eliminate the undefined state at the
  type level instead.
- **No `git stash`** — multiple agents share this working tree.
- **Package manager**: `pnpm`.
- React Compiler is enabled — skip manual `useMemo` / `useCallback` /
  `React.memo` (CLAUDE.md project rule).

## Approach for the remaining sections

The plan from phase 1 still applies:

- Work in a scratch worktree or `cp tubemap.ts /tmp/scratch.ts && sed -i
  '1s|^// @ts-nocheck.*|//|' /tmp/scratch.ts && pnpm tsc /tmp/scratch.ts`
  to see the errors for one section without removing the pragma in master.
  (The current run with `@ts-nocheck` stripped reports ~1200 errors;
  most are `noUncheckedIndexedAccess` warnings on `nodes[i]` and
  `tracks[i]`.)
- Type one function at a time. Run `pnpm vitest run src/util/tubemap.test.ts`
  after each, must stay 20/20. Run `pnpm build` after the drawing sections
  to catch d3 runtime mismatches the type checker can't.
- Only drop `// @ts-nocheck` in the final commit once every function is
  clean.

## Gotchas encountered

- The vg-json fixtures from `demo-data.js` carry an `edge` field that
  isn't declared on `VgJson`. Structural typing means that's fine — the
  excess-property check only kicks in for fresh object literals.
- `inputNodes` is 1-indexed (a hole at index 0 lets us use signed
  indices for orientation). I typed the internal `inputNodes` as
  `(Node | undefined)[]` to reflect the hole, but it's still under
  `@ts-nocheck` so the layout code doesn't yet narrow.
- Test fixtures use `[number, number][]` tuples; TS infers `number[][]`
  from array literals so each test fixture needs an explicit annotation
  (already done for the existing tests). Future test additions need the
  same.
- Demo-data `inputNodes` lack `sequenceLength` (auto-derived from
  `seq.length` by `generateNodeWidth`), so `InputNode.sequenceLength` is
  optional.
- The control characters `\x01`, `\x02` in `readGroupsKey`'s join
  separators are intentional. Edits via Edit tool can fail to match when
  these bytes are in `old_string`; use Read and an exact string with
  surrounding context, or `awk`/`sed` patches.

## Verification before each commit

```
pnpm vitest run src/util/tubemap.test.ts  # must stay 20/20
pnpm tsc --noEmit 2>&1 | grep -c "error TS"  # should monotonically decrease
pnpm build  # after layout/drawing sections
```

The full test suite has one pre-existing failure (`App.test.tsx`) — not
caused by phase 2.

## Definition of done

- `// @ts-nocheck` removed from line 1.
- `pnpm tsc --noEmit` reports 0 errors in `tubemap.ts`.
- No `any`, no `as`/`!`/`as unknown as X` casts (excluding the polyfill
  if you can't avoid it — flag any new ones to the user).
- All 20 tubemap tests still pass; full suite still passes (modulo the
  pre-existing App.test.tsx failure).
- The d3 polyfill at the top stays functional (run the app manually to
  confirm `.attrs()`/`.styles()` calls still resolve).
