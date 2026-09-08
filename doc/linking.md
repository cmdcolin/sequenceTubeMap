# Deep-linking to a view

URLs encode a full view state as query parameters, so you can share or bookmark
any visualization.

The same params are also read from the fragment — `#?region=…&tracks[0][…]=…` —
for hosts and embedders that drop or rewrite query strings. When both carry a
view, the query string wins. In development the fragment doubles as the backend
switch, and the two combine: `#local&region=…`.

## Parameters

### `region`

Coordinate string. See [region format](data.md#finding-contig-names).

```
region=chr1%3A1000-2000
```

### `tracks`

Array of track objects encoded with bracket notation.

| Field                            | Values                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `trackFile`                      | path relative to server root, or any `http(s)://` URL                                       |
| `trackType`                      | `graph` \| `read` \| `haplotype` \| `translation`                                           |
| `trackColorSettings.mainPalette` | `greys` `blues` `reds` `plainColors` `lightColors` `ygreys`, or a hex code like `%23ff0000` |
| `trackColorSettings.auxPalette`  | same options                                                                                |

Always include at least one `graph` track.

```
tracks[0][trackFile]=path/to/graph.gbz.db
tracks[0][trackType]=graph
tracks[1][trackFile]=path/to/reads.gam
tracks[1][trackType]=read
```

### `bedFile`

Path or URL to a BED file, or `none`.

```
bedFile=path/to/regions.bed
```

### `dataType`

`built-in` | `mounted files` | `examples`

Use `built-in` with a `name` field matching a `DATA_SOURCES` entry in
`config.json`. Use `mounted files` for custom tracks. `name` labels the view
rather than resolving it, so a link still has to spell out its `tracks`.

### `visOptions`

The View menu's settings, as a nested object. Only the ones that differ from the
defaults appear in a generated link, and any the URL leaves out fall back to the
setting remembered from last time.

| Field                                                     | Values         |
| --------------------------------------------------------- | -------------- |
| `compressedView`                                          | `true` `false` |
| `coarsenedReadView`                                       | `true` `false` |
| `ignoreStrand`                                            | `true` `false` |
| `removeRedundantNodes`                                    | `true` `false` |
| `showReads` `showSoftClips` `showNodeLabels`              | `true` `false` |
| `transparentNodes`                                        | `true` `false` |
| `colorReadsByMappingQuality` `alphaReadsByMappingQuality` | `true` `false` |
| `mappingQualityCutoff`                                    | a number       |

```
visOptions[compressedView]=true&visOptions[coarsenedReadView]=true
```

The read subsample limit is not part of the URL; it stays a per-browser
preference, adjustable from the banner above the map.

### `simplify`

`true` | `false`. Removes small snarls, via `vg simplify`. Server backend only —
the in-browser backend ignores it.

---

## Examples

**Built-in dataset:**

```
http://localhost:3000?
  name=snp1kg-BRCA1&
  dataType=built-in&
  tracks[0][trackFile]=exampleData/internal/snp1kg-BRCA1.vg.xg&
  tracks[0][trackType]=graph&
  region=17%3A1000-1200
```

The README's figures link into the live demo this way;
`src/urlViewTarget.test.ts` parses those links back to check they still resolve.

**Custom files by URL:**

```
http://localhost:3000?
  tracks[0][trackFile]=https://example.com/graph.gbz.db&
  tracks[0][trackType]=graph&
  tracks[1][trackFile]=https://example.com/reads.gam&
  tracks[1][trackType]=read&
  region=chr1%3A0-1000&
  dataType=mounted%20files
```

The app also has a **Copy link** button that generates the URL for the current
view.
