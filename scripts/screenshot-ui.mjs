#!/usr/bin/env node
// Recapture the UI screenshots the docs embed, so a figure of the interface
// can be regenerated the way `pnpm tubemap-cli` regenerates a figure of a tube
// map. Drives headless Chrome over the DevTools protocol: no Puppeteer, no
// Playwright, just Node's own fetch and WebSocket.
//
// Each shot names the element it is about and is cropped to that element's
// bounding box, so a layout change moves the crop instead of ruining it.
//
// Usage — three terminals, or three backgrounded commands:
//
//   pnpm serve                                   # the express backend
//   pnpm vite --port 5200                        # the frontend
//   google-chrome --headless=new --remote-debugging-port=9222 about:blank
//   node scripts/screenshot-ui.mjs               # writes into doc/images/
//
// The backend only has to answer `getFilenames` — it is up so the Examples
// menu has a server group to show, not to serve any graph. `magick`
// (ImageMagick) does the cropping. Override the ports with APP_PORT and
// CDP_PORT.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const APP = `http://localhost:${process.env.APP_PORT ?? 5200}`
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? 9222}`
const OUT = 'doc/images'
const TMP = 'tmp/screenshot-ui'
// 2× so the figures stay sharp where they are rendered scaled down.
const SCALE = 2

const V21 = encodeURIComponent('HPRC v2.1 whole genome (gbz-base, URL-hosted)')
const KIV2 = 'GRCh38%23chr6:160620000-160620500'
const MHC10KB = 'GRCh38%23chr6:31500000-31510000'

const shots = [
  {
    // The render cap. A 10 kb MHC window on the hosted HPRC v2.1 graph is
    // 73,282 node visits, so the app refuses it rather than freezing the tab.
    out: 'graph-render-cap.png',
    query: `?name=${V21}&region=${MHC10KB}`,
    until: text('node visits across'),
    // The legend is in the way of the notice's own button in a window this
    // short; it is not what the figure is about.
    then: [closeLegend()],
    element: '#tubeMapContainer .MuiAlert-root',
    pad: 14,
  },
  {
    // The paths panel over the same graph: 292 indexed paths under 219 names,
    // so several rows share one and only the offset separates them.
    out: 'paths-panel-fragments.png',
    query: `?name=${V21}&region=${KIV2}`,
    until: text('from '),
    element: '.MuiCard-root',
    pad: 8,
    height: 1100,
  },
  {
    // The Examples menu, grouped by which backend reads each entry. Needs the
    // backend up, or the server group is filtered out of the menu.
    out: 'examples-menu-grouped.png',
    query: `?name=${V21}&region=${KIV2}`,
    local: false,
    until: `document.querySelector('[data-testid="examplesMenuButton"]')`,
    then: [`document.querySelector('[data-testid="examplesMenuButton"]').click()`],
    element: '.MuiMenu-paper, .MuiPopover-paper',
    pad: 10,
    height: 1400,
  },
]

// An element whose own text contains this, ignoring the elements that only
// contain it through a child.
function text(needle) {
  return `[...document.querySelectorAll('*')].some(
    el => el.children.length === 0 && el.textContent.includes(${JSON.stringify(needle)}))`
}

function closeLegend() {
  return `[...document.querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === 'close' || b.textContent === '×')?.click()`
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const targets = await (await fetch(`${CDP}/json/list`)).json()
const page = targets.find(t => t.type === 'page')
if (!page) {
  throw new Error(`no page target at ${CDP} — is headless Chrome running?`)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(resolve => { ws.onopen = resolve })

let nextId = 1
const pending = new Map()
ws.onmessage = event => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined) {
    pending.get(message.id)?.(message)
    pending.delete(message.id)
  }
}

function send(method, params = {}) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    pending.set(id, message => {
      if (message.error) {
        reject(new Error(`${method}: ${message.error.message}`))
      } else {
        resolve(message.result)
      }
    })
  })
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (exceptionDetails) {
    throw new Error(`${exceptionDetails.text}: ${expression}`)
  }
  return result.value
}

// The HPRC shots wait on two hosted files over range requests, so the budget
// is generous rather than tight.
async function waitFor(expression, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (!(await evaluate(`!!(${expression})`))) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${expression}`)
    }
    await sleep(250)
  }
}

mkdirSync(TMP, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')

for (const shot of shots) {
  const { out, query, until, element, pad = 10, height = 900, local = true } = shot
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1700,
    height,
    deviceScaleFactor: SCALE,
    mobile: false,
  })
  // `#local` is what keeps config-client from pointing the app at the express
  // backend in dev (see doc/development.md); the menu shot wants it pointed
  // there, and nothing else does.
  await send('Page.navigate', { url: `${APP}/${query}${local ? '#local' : ''}` })
  await sleep(2000)
  await waitFor(until)
  for (const action of shot.then ?? []) {
    await evaluate(action)
    await sleep(800)
  }

  const rect = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(element)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  if (!rect) {
    throw new Error(`${out}: nothing matched ${element}`)
  }

  const full = `${TMP}/${out}`
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(full, Buffer.from(data, 'base64'))
  const crop = [
    Math.round((rect.width + pad * 2) * SCALE),
    Math.round((rect.height + pad * 2) * SCALE),
    Math.max(0, Math.round((rect.x - pad) * SCALE)),
    Math.max(0, Math.round((rect.y - pad) * SCALE)),
  ]
  execFileSync('magick', [
    full,
    '-crop',
    `${crop[0]}x${crop[1]}+${crop[2]}+${crop[3]}`,
    '+repage',
    `${OUT}/${out}`,
  ])
  console.error(`${OUT}/${out}  ${crop[0]}x${crop[1]}`)
}

rmSync(TMP, { recursive: true, force: true })
ws.close()
