---
name: view-spec-url
description:
  Write the view into the URL as one spec naming layers, stats and encodings, in
  place of the vis=, mapq= and facet= parameters. Waits until a new option would
  add yet another parameter.
---

# One view spec in the URL

`src/urlViewTarget.ts` writes the view as separate parameters: `vis=` for on/off
flags, `mapq=` for the mapping-quality cutoff, `facet=` for the facet, and
`colors=` for palettes. The sketch in
[todo/encodings-as-layers.md](../../todo/encodings-as-layers.md) has one spec
naming layers, stats and encodings, which could replace those parameters.

## The call

Defer until a fourth encoding or layer option would add yet another parameter.
Saved links hold the separate parameters, so the app would have to keep reading
them.
