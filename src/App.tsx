import { useState } from 'react'
import useSWR, { SWRConfig, type SWRConfiguration } from 'swr'

import './App.css'
import HeaderForm from './components/HeaderForm.tsx'
import TubeMapContainer, {
  DEFAULT_READ_RENDER_LIMIT,
} from './components/TubeMapContainer.tsx'
import {
  urlParamsToViewTarget,
  urlParamsToVisOptions,
} from './urlViewTarget.ts'
import { EMPTY_VIEW_TARGET, useViewHistory } from './useViewHistory.ts'
import BackendSelector from './components/BackendSelector.tsx'
import Footer from './components/Footer.tsx'
import { ViewMenu } from './components/ViewMenu.tsx'
import { viewTargetsEqual } from './components/headerFormUtils.ts'
import {
  exampleTracks,
  fetchTubeMapData,
  type FetchKey,
  type TubeMapData,
} from './components/tubeMapData.ts'
import {
  isRecord,
  readStored,
  writeStored,
} from './components/persistedState.ts'
import { dataOriginTypes } from './enums.ts'
import './config-client.js'
import { config } from './config-global.mjs'
import ServerAPI from './api/ServerAPI.ts'
import { LocalAPI } from './api/LocalAPI.ts'
import type { APIInterface } from './api/APIInterface.ts'
import { defaultTrackColors, isLocalCompatibleDataSource } from './common.ts'
import {
  DEFAULT_VIS_OPTIONS,
  exampleColorSchemes,
  mappingQualityCutoffFrom,
  VIS_OPTION_FLAGS,
  type StoredVisOptions,
} from './util/visOptions.ts'
import type {
  ColorScheme,
  Tracks,
  ViewTarget,
  VisOptionFlag,
  VisOptions,
} from './Types.ts'

type APIMode = APIInterface['mode']

const VIS_OPTIONS_KEY = 'visOptions'
const LEGEND_VISIBLE_KEY = 'legendVisible'
const READ_RENDER_LIMIT_KEY = 'readRenderLimit'

// A stored preference comes from an older build or a hand-edited value, so
// keep only the fields that still have the expected type and default the rest.
function validateVisOptions(value: unknown): StoredVisOptions | undefined {
  if (isRecord(value)) {
    const flags: Partial<Record<VisOptionFlag, boolean>> = {}
    for (const flag of VIS_OPTION_FLAGS) {
      const stored = value[flag]
      if (typeof stored === 'boolean') {
        flags[flag] = stored
      }
    }
    const cutoff = mappingQualityCutoffFrom(value.mappingQualityCutoff)
    return {
      ...DEFAULT_VIS_OPTIONS,
      ...flags,
      ...(cutoff !== undefined && { mappingQualityCutoff: cutoff }),
    }
  }
  return undefined
}

function validateBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function validateReadRenderLimit(value: unknown): number | null | undefined {
  return value === null
    ? null
    : typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : undefined
}

function getColorSchemesFromTracks(tracks: Tracks): ColorScheme[] {
  return tracks.map(
    t => t.trackColorSettings ?? defaultTrackColors(t.trackType),
  )
}

// Every view App holds passes through here. A link or config entry leaves out
// a flag that is off, where the form writes false, so spell both flags out:
// otherwise the same view compares unequal and hashes to a new SWR key. SWR
// also hashes an explicitly-undefined field differently from a missing one,
// so drop those.
function normalizeViewTarget(target: ViewTarget): ViewTarget {
  return {
    region: target.region,
    tracks: target.tracks,
    ...(target.bedFile !== undefined && { bedFile: target.bedFile }),
    ...(target.name !== undefined && { name: target.name }),
    ...(target.dataType !== undefined && { dataType: target.dataType }),
    simplify: target.simplify ?? false,
    removeSequences: target.removeSequences ?? false,
    ...(target.skipAutoLoad !== undefined && {
      skipAutoLoad: target.skipAutoLoad,
    }),
  }
}

// BACKEND_URL semantics: literal `false` selects the in-browser LocalAPI; any string
// (possibly empty for same-origin via the dev-server proxy) means ServerAPI.
const isLocalMode = config.BACKEND_URL === false

const defaultApiUrl = isLocalMode ? '' : `${config.BACKEND_URL}/api/v0`

const UPSTREAM_API_URL = 'https://api.tubemap.graphs.vg/api/v0'

const localDefaultViewTarget: ViewTarget = normalizeViewTarget(
  config.DATA_SOURCES.find(isLocalCompatibleDataSource) ?? EMPTY_VIEW_TARGET,
)

// Passing the configured sources lets `?name=<data source>` stand in for the
// tracks, colors and BED that source already spells out.
const defaultViewTarget: ViewTarget = normalizeViewTarget(
  urlParamsToViewTarget(document.location, config.DATA_SOURCES) ??
    (isLocalMode
      ? localDefaultViewTarget
      : (config.DATA_SOURCES[0] ?? EMPTY_VIEW_TARGET)),
)

// View menu settings named by the URL win over the stored preference, so a
// shared link shows the view its author was looking at.
const urlVisOptions = urlParamsToVisOptions(document.location)

interface AppProps {
  apiUrl?: string
  // Lets tests drive the app with a stub backend instead of the real APIs.
  api?: APIInterface
}

function App({ apiUrl = defaultApiUrl, api }: AppProps) {
  const [dataOrigin, setDataOrigin] = useState<string>(dataOriginTypes.API)
  const [viewTarget, setViewTarget] = useState<ViewTarget>(defaultViewTarget)
  const [legendVisible, setLegendVisible] = useState(
    () => readStored(LEGEND_VISIBLE_KEY, validateBoolean) ?? true,
  )
  const [readRenderLimit, setStoredReadRenderLimit] = useState<number | null>(
    () => {
      // `null` is a meaningful stored value ("render every read"), so a missing
      // preference has to be told apart from a stored null.
      const stored = readStored<number | null>(
        READ_RENDER_LIMIT_KEY,
        validateReadRenderLimit,
      )
      return stored === undefined ? DEFAULT_READ_RENDER_LIMIT : stored
    },
  )
  const [visOptions, setVisOptions] = useState<VisOptions>(() => ({
    ...(readStored(VIS_OPTIONS_KEY, validateVisOptions) ?? DEFAULT_VIS_OPTIONS),
    ...urlVisOptions,
    colorSchemes: getColorSchemesFromTracks(defaultViewTarget.tracks),
  }))
  const [apiInterface, setApiInterface] = useState<APIInterface>(
    () => api ?? (isLocalMode ? new LocalAPI() : new ServerAPI(apiUrl)),
  )
  // What the header form re-seeds from when the view changed from outside it
  // (Back/Forward, or a switch of backend). Identity is the signal, so one
  // change re-seeds the form once rather than on every render.
  const [seedViewTarget, setSeedViewTarget] = useState<ViewTarget | null>(null)

  // The tube map data lives here rather than in TubeMapContainer so the Go
  // button can show that a load is in flight, and so `keepPreviousData` can
  // leave the previous region on screen while the next one arrives.
  const fetchKey: FetchKey | null =
    dataOrigin === dataOriginTypes.API
      ? viewTarget.tracks.length === 0
        ? null
        : ['tubeMap.api', apiInterface.mode, viewTarget]
      : ['tubeMap.example', dataOrigin]

  const {
    data: fetched,
    error,
    isValidating,
    mutate,
  } = useSWR<TubeMapData, Error, FetchKey | null>(
    fetchKey,
    (key: FetchKey) => fetchTubeMapData(key, apiInterface),
    { keepPreviousData: true },
  )

  // `keepPreviousData` hands back the last data for a null key too, which is
  // right while the next region loads and wrong once there is no view at all:
  // "Open custom files" would leave the previous dataset's graph on screen
  // under a file picker for a different one.
  const data = fetchKey === null ? undefined : fetched

  // Which backend each mode talks to, and the view target to fall back to
  // when switching to it (the in-browser reader can only open .gbz.db).
  const apiModes: Record<
    APIMode,
    { create: () => APIInterface; viewTarget: ViewTarget }
  > = {
    local: {
      create: () => new LocalAPI(),
      viewTarget: localDefaultViewTarget,
    },
    server: {
      create: () => new ServerAPI(apiUrl),
      viewTarget: defaultViewTarget,
    },
    upstream: {
      create: () => new ServerAPI(UPSTREAM_API_URL, 'upstream'),
      viewTarget: defaultViewTarget,
    },
  }

  const setAPIMode = (mode: string) => {
    if (mode !== 'local' && mode !== 'server' && mode !== 'upstream') {
      throw new Error('Unimplemented API mode: ' + mode)
    }
    if (mode !== apiInterface.mode) {
      const { create, viewTarget: modeViewTarget } = apiModes[mode]
      // A copy, so the form sees a new seed even when switching back to a
      // backend whose view it was seeded from before.
      const target = { ...modeViewTarget }
      setApiInterface(create())
      setDataOrigin(dataOriginTypes.API)
      setViewTarget(target)
      setVisOptions(v => ({
        ...v,
        colorSchemes: getColorSchemesFromTracks(target.tracks),
      }))
      // The previous backend's files mean nothing to this one.
      setSeedViewTarget(target)
    }
  }

  const viewHistory = useViewHistory({
    viewTarget,
    visOptions,
    onRestore: (restored, restoredVisOptions) => {
      const target = normalizeViewTarget(restored)
      setViewTarget(target)
      setDataOrigin(dataOriginTypes.API)
      // An entry that holds a view names every setting that differs from the
      // defaults, so a setting it leaves out is a default. One with no view
      // names none, and the settings on screen stay.
      setVisOptions(v => ({
        ...(target.tracks.length > 0
          ? { ...DEFAULT_VIS_OPTIONS, ...restoredVisOptions }
          : v),
        colorSchemes: getColorSchemesFromTracks(target.tracks),
      }))
      setSeedViewTarget(target)
    },
  })

  const setCurrentViewTarget = (newTarget: ViewTarget) => {
    const newViewTarget = normalizeViewTarget(newTarget)
    if (
      !viewTargetsEqual(viewTarget, newViewTarget) ||
      dataOrigin !== dataOriginTypes.API
    ) {
      // Looking at a different view is a navigation, so Back returns to this
      // one. The view being left behind is still in the address bar here; the
      // sync effect writes the new one over the entry this creates.
      viewHistory.pushEntry()
      setViewTarget(newViewTarget)
      setDataOrigin(dataOriginTypes.API)
      setVisOptions(v => ({
        ...v,
        colorSchemes: getColorSchemesFromTracks(newViewTarget.tracks),
      }))
    }
  }

  const updateVisOptions = (next: VisOptions) => {
    setVisOptions(next)
    const { colorSchemes, ...stored } = next
    writeStored(VIS_OPTIONS_KEY, stored)
  }

  const toggleVisOptionFlag = (flagName: VisOptionFlag) => {
    updateVisOptions({ ...visOptions, [flagName]: !visOptions[flagName] })
  }

  const handleMappingQualityCutoffChange = (value: number) => {
    updateVisOptions({ ...visOptions, mappingQualityCutoff: value })
  }

  const setLegend = (visible: boolean) => {
    setLegendVisible(visible)
    writeStored(LEGEND_VISIBLE_KEY, visible)
  }

  const setReadRenderLimit = (limit: number | null) => {
    setStoredReadRenderLimit(limit)
    writeStored(READ_RENDER_LIMIT_KEY, limit)
  }

  // The demo datasets carry no tracks to take colors from, so they name their
  // own rather than inherit whatever the last loaded data source left behind.
  const showExample = (origin: string) => {
    setDataOrigin(origin)
    setVisOptions(v => ({ ...v, colorSchemes: exampleColorSchemes(origin) }))
  }

  // What the color key describes: the loaded tracks, or the stand-ins a demo
  // dataset gets. Both the panel on screen and a saved figure take it from
  // here, so they cannot disagree.
  const legendTracks =
    dataOrigin === dataOriginTypes.API
      ? viewTarget.tracks
      : exampleTracks((data?.reads.length ?? 0) > 0)

  return (
    <div>
      <HeaderForm
        setCurrentViewTarget={setCurrentViewTarget}
        showExample={showExample}
        currentViewTarget={viewTarget}
        seedViewTarget={seedViewTarget}
        goBack={viewHistory.back}
        goForward={viewHistory.forward}
        APIInterface={apiInterface}
        onAPIMode={setAPIMode}
        serverModeId={isLocalMode ? 'upstream' : 'server'}
        loading={isValidating}
        legendTracks={legendVisible ? legendTracks : undefined}
        onEscape={() => {
          setLegend(false)
        }}
        visMenus={
          <ViewMenu
            legendVisible={legendVisible}
            toggleLegend={() => {
              setLegend(!legendVisible)
            }}
            visOptions={visOptions}
            toggleVisOptionFlag={toggleVisOptionFlag}
            handleMappingQualityCutoffChange={handleMappingQualityCutoffChange}
            compressedViewLocked={viewTarget.removeSequences}
            bandageJsViewTarget={
              dataOrigin === dataOriginTypes.API ? viewTarget : undefined
            }
            trackFileBaseURI={
              apiInterface.mode === 'local' ? document.baseURI : undefined
            }
          />
        }
      />
      <div style={{ margin: '8px 0' }}>
        <TubeMapContainer
          viewTarget={viewTarget}
          dataOrigin={dataOrigin}
          visOptions={visOptions}
          data={data}
          error={error}
          isValidating={isValidating}
          onRetry={() => {
            void mutate()
          }}
          readRenderLimit={readRenderLimit}
          onReadRenderLimitChange={limit => {
            setReadRenderLimit(limit)
          }}
          legendVisible={legendVisible}
          legendTracks={legendTracks}
          onLegendClose={() => {
            setLegend(false)
          }}
          onCoarsen={() => {
            updateVisOptions({
              ...visOptions,
              showReads: true,
              coarsenedReadView: true,
            })
          }}
        />
      </div>
      <BackendSelector
        currentAPIMode={apiInterface.mode}
        setAPIMode={setAPIMode}
        showServerOption={!isLocalMode}
      />
      <Footer />
    </div>
  )
}

// SWR's defaults refetch on every window focus and retry a failed fetch
// forever, where one fetch can have the in-browser backend walk a whole graph.
// Every fetch here runs when its key changes and not otherwise. Set above App
// rather than in index.tsx so the tests that render App get it too.
const SWR_OPTIONS: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
}

function Root(props: AppProps) {
  return (
    <SWRConfig value={SWR_OPTIONS}>
      <App {...props} />
    </SWRConfig>
  )
}

export default Root
