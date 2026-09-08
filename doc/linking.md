# Deep-linking to a view

URLs encode a full view state as query parameters, so you can share or bookmark
any visualization. The app also has a **Copy link** button that hands you the
URL for whatever is on screen.

Every parameter works in the query string or in the fragment — `?region=…` or
`#?region=…` — for hosts and embedders that drop or rewrite query strings. The
two are merged, and the query wins where both name the same parameter, so a
mailer that appends `?utm_source=…` to a fragment-encoded link does not destroy
the view it carries. In development the fragment doubles as the backend switch:
`#local&region=…`.

## The short way

Name a configured data source and a region:

```
?name=snp1kg-BRCA1%20(WASM-compatible)&region=17:1-1000&vis=compressedView
```

Spell out your own files:

```
?region=chr1:0-1000&tracks=graph:https://example.com/graph.gbz.db,read:https://example.com/reads.gam
```

## Parameters

### `region`

Coordinate string, `path:start-end`. See
[region format](data.md#finding-contig-names).

A PanSN path name contains a `#`, which has to stay percent-encoded as `%23` in
a URL or it starts the fragment: `region=GRCh38%23chr20:48000600-48001000`.

### `name`

Labels the view. When a link carries **no** tracks and this matches a
`DATA_SOURCES` entry in `config.json`, the view is that data source — its
tracks, palettes and BED — with any parameters beside it layered on top. That
is what makes `?name=…&region=…` a complete link.

A name matching nothing in the config does not resolve, and the app falls back
to its default view rather than showing different data under the requested
name. This means a `name=`-only link is tied to a deployment whose config
defines that source; a link that spells out its `tracks` works anywhere.

### `tracks`

Comma-separated, one entry per track, in the order they are drawn:

```
tracks=graph:path/to/graph.gbz.db,read:path/to/reads.gam
```

Each entry is `type:path`, where `path` is relative to the server root or any
`http(s)://` URL. Always include a `graph` track.

The `type:` prefix is optional — omit it and the extension decides:

| Type          | Extensions                            |
| ------------- | ------------------------------------- |
| `graph`       | `.xg` `.vg` `.hg` `.pg` `.gbz` `.gbz.db` `.db` |
| `read`        | `.gam` `.gaf` `.gaf.gz`               |
| `haplotype`   | `.gbwt`                               |
| `translation` | `.tsv` `.trans`                       |

A `.gbz` carries a graph and maybe haplotypes, so it reads as a `graph` unless
the link says `haplotype:` outright. Only a known type counts as a prefix, so
`https://host/g.gbz.db` stays one path rather than being read as type `https`.
Generated links always write the prefix; inference is for links you type.

A comma inside a filename must be percent-encoded as `%2C`.

### `colors`

Comma-separated palettes, one entry per track, positionally. Leave an entry
empty for a track that takes its type's default, and leave the whole parameter
out when they all do.

```
colors=greys/ygreys,,plainColors/lightColors
```

Each entry is `mainPalette/auxPalette`, drawn from `greys` `ygreys` `blues`
`reds` `plainColors` `lightColors`, or a hex code written `%23ff0000`.

### `tracksJson`

The full track array as JSON, for the views the short form cannot express: a
track resolved from a BED rather than a path, an uploaded track with a display
name, or a per-track mapping-quality color flag. Copy link falls back to this
by itself when it has to.

```
tracksJson=[{"trackType":"graph","trackColorSettings":{"mainPalette":"blues","auxPalette":"reds"}}]
```

It replaces `tracks=` and `colors=` rather than adding to them.

### `bedFile`

Path or URL to a BED file, or `none`.

### `vis`

The View menu's settings, comma-separated. Name a flag to turn it on, prefix it
with `-` to turn it off:

```
vis=compressedView,coarsenedReadView,-showReads
```

| Flag                                                      | Default |
| --------------------------------------------------------- | ------- |
| `removeRedundantNodes` `showReads` `showSoftClips`        | on      |
| `compressedView` `coarsenedReadView` `ignoreStrand`       | off     |
| `transparentNodes` `showNodeLabels`                       | off     |
| `colorReadsByMappingQuality` `alphaReadsByMappingQuality` | off     |

Only the settings that differ from the defaults go in a generated link, and any
the URL leaves out fall back to the setting remembered from last time. A later
entry wins over an earlier one, so naming a flag twice is not an error.

The read subsample limit is not part of the URL; it stays a per-browser
preference, adjustable from the banner above the map.

### `mapq`

The mapping quality cutoff, a number. `mapq=20`.

### `dataType`

`built-in` | `mounted files` | `examples`. Tags the view with how it was built.

### `simplify`

`true` removes small snarls, via `vg simplify`. Server backend only — the
in-browser backend ignores it. Omitted means false.

### `removeSequences`

`true` strips node sequences server-side, which also locks compressed view.
Omitted means false.

---

## Examples

**Built-in dataset:**

```
http://localhost:3000?name=snp1kg-BRCA1%20(WASM-compatible)&region=17:1-1000
```

The README's figures link into the live demo this way; `src/urlViewTarget.test.ts`
resolves those links against the real config, so renaming a data source fails a
test rather than quietly breaking four links.

**Custom files by URL:**

```
http://localhost:3000?
  region=chr1:0-1000&
  tracks=graph:https://example.com/graph.gbz.db,read:https://example.com/reads.gam&
  dataType=mounted%20files
```
