Big-impact, contained

- tubemap.js is 5,200 lines of module-level mutable state (let tracks, let
  reads, let svg, a global config) with React reaching in via setInfoCallback /
  setReadContextMenuCallback / setMappingQualityCutoff / etc. Every new option
  needs a setter and a corresponding tubeMap.setXxx(...) in TubeMap.js. Turning
  create() into a factory that returns an instance and accepts a single options
  object would let TubeMap.js shrink to one call, allow multiple tube maps on a
  page, and kill the imperative-mirror layer.
- d3 is pinned at v5 (current is v7). The big v6 break is that event handlers
  receive the event as a parameter instead of d3.event (which we just used in
  trackRightClick). The upgrade is mostly mechanical and removes a recurring
  footgun.
- React 17 + class components everywhere (TubeMapContainer, TubeMap, App). React
  17 is EOL; class components add a lot of componentDidUpdate boilerplate that
  hooks collapse. The Container's "register callbacks every update" dance is a
  good example — useEffect once would do it.

UI/dependency cleanup

- Deps include @material-ui/core v4, @mui/material v5, react-bootstrap,
  reactstrap, and bootstrap 5 — four overlapping UI kits. Standardizing on one
  (MUI v5 is the most alive) would shrink the bundle and remove visual
  inconsistency. Our context-menu styles are inline because none of the four
  felt right; that's a tell.
- Types.ts exists but almost everything else is .js with PropTypes. The TS
  migration is half-started. Picking it up incrementally — at least for new
  files and the React layer around tubemap.js — would compound well with the
  refactor above.

Smaller wins

- A lot of console.log left in hot paths (e.g. TubeMap.js logs node/read counts
  on every update; tubemap.js has many if (DEBUG)-less logs). A debug flag or
  just deletion.
- nodeDoubleClick in tubemap.js:4390 does
  document.getElementById("hgvmPostButton").click() to drive a React component —
  last holdover of d3→React-via-DOM. A callback like the new
  readContextMenuCallback fits the same shape.
- deepCopy = JSON.parse(JSON.stringify(...)) with a hand-rolled patch to
  preserve array holes (tubemap.js:204). Removing the "hole at index 0" trick in
  inputNodes would let you delete that helper.

Natural extensions to the feature we just added (not refactors, but cheap):

- The same context menu can offer "Filter by sample", "Filter by read group",
  "Hide this read" — the menu structure is already there.

If you want to actually move on one of these, my pick is rewrite TubeMap.js +
the top of tubemap.js so create() is instance-based and props flow in one
direction. It's the prerequisite that makes most of the others easier — and it's
the one we'll keep paying for every new option we add.
