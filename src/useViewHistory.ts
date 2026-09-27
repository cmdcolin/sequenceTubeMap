import { useEffect, useState } from 'react'

import './config-client.js'
import { config } from './config-global.mjs'
import { isRecord } from './components/persistedState.ts'
import {
  fragmentWithoutView,
  queryWithoutView,
  urlParamsToViewTarget,
  urlParamsToVisOptions,
  viewTargetToUrlParams,
} from './urlViewTarget.ts'
import type { StoredVisOptions } from './util/visOptions.ts'
import type { ViewTarget, VisOptions } from './Types.ts'

// No view: nothing to fetch, nothing to draw, and nothing to put in a link.
export const EMPTY_VIEW_TARGET: ViewTarget = { tracks: [], region: '' }

// Where the entry on screen sits among the entries this app added: `index` of
// them lie behind it and `last - index` ahead. The entry the app loaded into
// is index 0, so Back from there would leave the app. Kept in each entry's
// history.state, which is what survives a reload.
interface HistoryPosition {
  index: number
  last: number
}

function positionFrom(state: unknown): HistoryPosition {
  const index =
    isRecord(state) && typeof state.index === 'number' ? state.index : 0
  const last =
    isRecord(state) && typeof state.last === 'number' ? state.last : index
  return { index, last: Math.max(index, last) }
}

// Rewrite the entry on screen to describe the view on screen. Adding an entry
// is the job of whoever navigates (see `pushEntry`), which happens before the
// render this runs after.
//
// A view with no tracks -- what a completed upload leaves behind while the
// user picks a region, and what a backend with nothing mounted starts at -- is
// nothing a link can restore, so it clears the view out of the URL rather than
// writing `region=&tracks=` over it.
function writeViewToUrl(
  target: ViewTarget,
  visOptions: StoredVisOptions,
  position: HistoryPosition,
) {
  const url = new URL(window.location.href)
  const view =
    target.tracks.length === 0 ? '' : viewTargetToUrlParams(target, visOptions)
  // Params the app does not own (analytics, an embedder's own) came with the
  // link and stay with it.
  url.search = [view, queryWithoutView(url.search)].filter(Boolean).join('&')
  // The query now describes the view, so a view left in the fragment is stale.
  // It stays invisible here (the query wins) but is all an embedder that keeps
  // only the fragment would see.
  url.hash = fragmentWithoutView(url.hash)
  window.history.replaceState(position, '', url.toString())
}

interface ViewHistoryOptions {
  viewTarget: ViewTarget
  // The whole thing, colorSchemes and all: stripping them out here rather
  // than at the call site keeps the object identity that decides when this
  // rewrites the address bar.
  visOptions: VisOptions
  // Back or Forward moved to another entry. The view it describes is parsed
  // out of the params the same way the initial one is, along with the View
  // menu settings it names: every one that differs from the defaults, since
  // the address bar is rewritten whenever a setting changes.
  onRestore: (target: ViewTarget, visOptions: Partial<StoredVisOptions>) => void
}

// Keep the address bar describing the view on screen, and follow it back when
// the browser navigates. The address bar is where a view lives: it is what a
// reload returns to, what "copy link" copies, and what Back and Forward walk --
// the browser's buttons and the app's own alike.
export function useViewHistory({
  viewTarget,
  visOptions,
  onRestore,
}: ViewHistoryOptions) {
  const [position, setPosition] = useState(() =>
    positionFrom(window.history.state),
  )

  // The address bar is an external system, and it has to describe the initial
  // view as well as every later one, so this belongs in an effect rather than
  // in the commit path.
  useEffect(() => {
    const { colorSchemes, ...stored } = visOptions
    writeViewToUrl(viewTarget, stored, position)
  }, [viewTarget, visOptions, position])

  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const { index } = positionFrom(event.state)
      setPosition(p => ({ index, last: Math.max(p.last, index) }))
      onRestore(
        urlParamsToViewTarget(window.location, config.DATA_SOURCES) ??
          EMPTY_VIEW_TARGET,
        urlParamsToVisOptions(window.location),
      )
    }
    window.addEventListener('popstate', restore)
    return () => {
      window.removeEventListener('popstate', restore)
    }
  }, [onRestore])

  return {
    // Duplicate the entry on screen, so the view about to replace it lands on
    // a new one and Back returns to the view being left. Call it just before
    // committing a new view: the sync effect cannot tell a navigation from a
    // re-render, and the caller always can.
    pushEntry: () => {
      const index = positionFrom(window.history.state).index + 1
      const next = { index, last: index }
      window.history.pushState(next, '', window.location.href)
      setPosition(next)
    },
    back:
      position.index > 0
        ? () => {
            window.history.back()
          }
        : undefined,
    forward:
      position.index < position.last
        ? () => {
            window.history.forward()
          }
        : undefined,
  }
}
