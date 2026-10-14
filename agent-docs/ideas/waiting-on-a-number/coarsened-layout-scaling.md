---
name: coarsened-layout-scaling
description:
  Coarsened layout runs linear at about 2.5 µs per visit; profile its three
  remaining top costs in tubemap-core once a window feels slow.
---

# Coarsened layout scaling

With placement fixed, coarsened layout is linear at about 2.5 µs per visit.
`generateNodeOrder`, `mergeNodes`' predecessor/successor sets and
`generateTrackIndexSequences` are the remaining top costs, all in
[GMOD/tubemap-core](https://github.com/GMOD/tubemap-core).

Nobody has reported a slow window. Profile the three once someone does, and
build only if they dominate it.
