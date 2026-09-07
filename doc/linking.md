# Deep-linking to a view

URLs encode a full view state as query parameters, so you can share or bookmark
any visualization.

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
`config.json`. Use `mounted files` for custom tracks.

### `simplify`

`true` | `false`. Removes small snarls, via `vg simplify`. Server backend only —
the in-browser backend ignores it.

---

## Examples

**Built-in dataset:**

```
http://localhost:3000?name=snp1kg-BRCA1&dataType=built-in&region=17%3A1000-1200
```

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
