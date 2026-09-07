import { useEffect, useState } from 'react'
import useSWR from 'swr'

import './App.css'
import HeaderForm from './components/HeaderForm.tsx'
import TubeMapContainer, {
  DEFAULT_READ_RENDER_LIMIT,
} from './components/TubeMapContainer.tsx'
import {
  urlParamsToViewTarget,
  viewTargetToUrlParams,
} from './urlViewTarget.ts'
import BackendSelector from './components/BackendSelector.tsx'
import Footer from './components/Footer.tsx'
import { ViewMenu } from './components/ViewMenu.tsx'
import { viewTargetsEqual } from './components/headerFormUtils.ts'
import {
  fetchTubeMapData,
  type FetchKey,
  type TubeMapData,
} from './components/tubeMapData.ts'
import { isRecord, readStored, writeStored } from './components/persistedState.ts'
import { dataOriginTypes } from './enums.ts'
import './config-client.js'
import { config } from './config-global.mjs'
import ServerAPI from './api/ServerAPI.ts'
import { LocalAPI } from './api/LocalAPI.ts'
import type { APIInterface } from './api/APIInterface.ts'
import { defaultTrackColors, isLocalCompatibleDataSource } from './common.ts'
import type {
  ColorPaletteName,
  ColorScheme,
  Palette,
  PaletteField,
  Tracks,
  ViewTarget,
  VisOptionFlag,
  VisOptions,
} from './Types.ts'

type APIMode = APIInterface['mode']

// Everything in VisOptions except the color schemes, which are derived from
// the loaded tracks and so can't be meaningfully restored on their own.
type StoredVisOptions = Omit<VisOptions, 'colorSchemes'>

const VIS_OPTIONS_KEY = 'visOptions'
const LEGEND_VISIBLE_KEY = 'legendVisible'
const READ_RENDER_LIMIT_KEY = 'readRenderLimit'

const DEFAULT_VIS_OPTIONS: StoredVisOptions = {
  removeRedundantNodes: true,
  compressedView: false,
  transparentNodes: false,
  showNodeLabels: false,
  showReads: true,
  showSoftClips: true,
  colorReadsByMappingQuality: false,
  alphaReadsByMappingQuality: false,
  mappingQualityCutoff: 0,
  coarsenedReadView: false,
  ignoreStrand: false,
}

const VIS_OPTION_FLAGS = [
  'removeRedundantNodes',
  'compressedView',
  'transparentNodes',
  'showNodeLabels',
  'showReads',
  'showSoftClips',
  'colorReadsByMappingQuality',
  'alphaReadsByMappingQuality',
  'coarsenedReadView',
  'ignoreStrand',
] as const satisfies readonly VisOptionFlag[]

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
    const cutoff = value.mappingQualityCutoff
    return {
      ...DEFAULT_VIS_OPTIONS,
      ...flags,
      ...(typeof cutoff === 'number' &&
        Number.isFinite(cutoff) &&
        cutoff >= 0 && { mappingQualityCutoff: cutoff }),
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
  return tracks.map(t => t.trackColorSettings ?? defaultTrackColors(t.trackType))
}

// qs (copy link) and SWR's key hashing both treat an explicitly-undefined
// field differently from a missing one, so drop the undefined ones.
function removeUndefined(target: ViewTarget): ViewTarget {
  return {
    region: target.region,
    tracks: target.tracks,
    ...(target.bedFile !== undefined && { bedFile: target.bedFile }),
    ...(target.name !== undefined && { name: target.name }),
    ...(target.dataType !== undefined && { dataType: target.dataType }),
    ...(target.simplify !== undefined && { simplify: target.simplify }),
    ...(target.removeSequences !== undefined && {
      removeSequences: target.removeSequences,
    }),
    ...(target.skipAutoLoad !== undefined && {
      skipAutoLoad: target.skipAutoLoad,
    }),
  }
}

// Put the view on screen in the address bar so a reload (or the browser's own
// back button, which restores the query) comes back to the same view, and so
// "copy link" is just the current URL.
function syncUrlToViewTarget(target: ViewTarget) {
  const url = new URL(window.location.href)
  url.search = `?${viewTargetToUrlParams(target)}`
  window.history.replaceState(null, '', url.toString())
}

// BACKEND_URL semantics: literal `false` selects the in-browser LocalAPI; any string
// (possibly empty for same-origin via the dev-server proxy) means ServerAPI.
const isLocalMode = config.BACKEND_URL === false

const defaultApiUrl = isLocalMode ? '' : `${config.BACKEND_URL}/api/v0`

const UPSTREAM_API_URL = 'https://api.tubemap.graphs.vg/api/v0'

const localDefaultViewTarget: ViewTarget = removeUndefined(
  config.DATA_SOURCES.find(isLocalCompatibleDataSource) ??
    { tracks: [], region: '' },
)

const defaultViewTarget: ViewTarget = removeUndefined(
  urlParamsToViewTarget(document.location) ??
    (isLocalMode ? localDefaultViewTarget : config.DATA_SOURCES[0]),
)

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
    ...(readStored(VIS_OPTIONS_KEY, validateVisOptions) ??
      DEFAULT_VIS_OPTIONS),
    colorSchemes: getColorSchemesFromTracks(defaultViewTarget.tracks),
  }))
  const [apiInterface, setApiInterface] = useState<APIInterface>(
    () => api ?? (isLocalMode ? new LocalAPI() : new ServerAPI(apiUrl)),
  )

  // The tube map data lives here rather than in TubeMapContainer so the Go
  // button can show that a load is in flight, and so `keepPreviousData` can
  // leave the previous region on screen while the next one arrives.
  const fetchKey: FetchKey | null =
    dataOrigin === dataOriginTypes.API
      ? viewTarget.tracks.length === 0
        ? null
        : ['tubeMap.api', apiInterface.mode, viewTarget]
      : ['tubeMap.example', dataOrigin]

  const { data, error, isValidating, mutate } = useSWR<
    TubeMapData,
    Error,
    FetchKey | null
  >(fetchKey, (key: FetchKey) => fetchTubeMapData(key, apiInterface), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    keepPreviousData: true,
  })

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
      setApiInterface(create())
      setDataOrigin(dataOriginTypes.API)
      setViewTarget(modeViewTarget)
      setVisOptions(v => ({
        ...v,
        colorSchemes: getColorSchemesFromTracks(modeViewTarget.tracks),
      }))
    }
  }

  const setCurrentViewTarget = (newTarget: ViewTarget) => {
    const newViewTarget = removeUndefined(newTarget)
    if (
      !viewTargetsEqual(viewTarget, newViewTarget) ||
      dataOrigin !== dataOriginTypes.API
    ) {
      setViewTarget(newViewTarget)
      setDataOrigin(dataOriginTypes.API)
      setVisOptions(v => ({
        ...v,
        colorSchemes: getColorSchemesFromTracks(newViewTarget.tracks),
      }))
    }
  }

  // The address bar is an external system, and it has to describe the initial
  // view as well as every later one, so this belongs in an effect rather than
  // in the commit path.
  useEffect(() => {
    syncUrlToViewTarget(viewTarget)
  }, [viewTarget])

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

  const setColorSetting = (
    key: PaletteField,
    index: number,
    value: Palette,
  ) => {
    setVisOptions(v => {
      const newcolors = [...v.colorSchemes]
      newcolors[index] ??= { ...config.defaultReadColorPalette }
      newcolors[index] = { ...newcolors[index]!, [key]: value }
      return { ...v, colorSchemes: newcolors }
    })
  }

  const showExample = (
    origin: string,
    mainPalette: ColorPaletteName,
    readPalette?: ColorPaletteName,
  ) => {
    setDataOrigin(origin)
    setColorSetting('mainPalette', 0, mainPalette)
    if (readPalette !== undefined) {
      setColorSetting('mainPalette', 1, readPalette)
    }
  }

  return (
    <div>
      <HeaderForm
        // Re-seed the form's tracks/region/name/bedFile when the backend
        // changes, since the previous backend's files aren't valid any more.
        key={apiInterface.mode}
        setCurrentViewTarget={setCurrentViewTarget}
        showExample={showExample}
        currentViewTarget={viewTarget}
        APIInterface={apiInterface}
        onAPIMode={setAPIMode}
        serverModeId={isLocalMode ? 'upstream' : 'server'}
        loading={isValidating}
        onEscape={() => { setLegend(false); }}
        visMenus={
          <ViewMenu
            legendVisible={legendVisible}
            toggleLegend={() => { setLegend(!legendVisible); }}
            visOptions={visOptions}
            toggleVisOptionFlag={toggleVisOptionFlag}
            handleMappingQualityCutoffChange={handleMappingQualityCutoffChange}
            compressedViewLocked={viewTarget.removeSequences}
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
          onRetry={() => { void mutate(); }}
          readRenderLimit={readRenderLimit}
          onReadRenderLimitChange={limit => { setReadRenderLimit(limit); }}
          legendVisible={legendVisible}
          onLegendClose={() => { setLegend(false); }}
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

export default App
