# Headless rendering (CLI)

The same d3 layout the web UI uses can also run under Node + jsdom and emit a
static SVG — useful for scripting, headless servers, or pasting a tube map into
a paper without a browser screenshot.

```bash
# bundled demo data (1–9)
pnpm tubemap-cli --example 6 --out demo6.svg

# real data via the in-browser API (any source from src/config.json)
pnpm tubemap-cli --source 'snp1kg-BRCA1 (WASM-compatible)' \
                 --out brca1.svg --width 3000

# region override
pnpm tubemap-cli --source 'snp1kg-BRCA1 (WASM-compatible)' \
                 --region 17:1-200 --out brca1-zoom.svg
```

Sample outputs live in [tubemap-cli-samples/](tubemap-cli-samples/) — e.g. the
BRCA1 render ([SVG](tubemap-cli-samples/snp1kg-BRCA1.svg) ·
[PNG](tubemap-cli-samples/snp1kg-BRCA1.png)) and demo example 6
([SVG](tubemap-cli-samples/demo-example-6.svg) ·
[PNG](tubemap-cli-samples/demo-example-6.png)).

Caveats: interactive features (zoom, context menus) are inert in headless mode,
and content past `--width` is clipped to the viewBox — pass a larger
`--width`/`--height` to capture more of wide layouts.
