import { useState } from 'react'

import './App.css'
import HeaderForm from './components/HeaderForm.tsx'
import TubeMapContainer from './components/TubeMapContainer.tsx'
import { urlParamsToViewTarget } from './urlViewTarget.ts'
import BackendSelector from './components/BackendSelector.tsx'
import Footer from './components/Footer.tsx'
import { ReadsMenu } from './components/ReadsMenu.tsx'
import { ViewMenu } from './components/ViewMenu.tsx'
import { viewTargetsEqual } from './components/headerFormUtils.ts'
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
  const [legendVisible, setLegendVisible] = useState(true)
  const [visOptions, setVisOptions] = useState<VisOptions>({
    removeRedundantNodes: true,
    compressedView: false,
    transparentNodes: false,
    showNodeLabels: false,
    showReads: true,
    showSoftClips: true,
    colorReadsByMappingQuality: false,
    alphaReadsByMappingQuality: false,
    colorSchemes: getColorSchemesFromTracks(defaultViewTarget.tracks),
    mappingQualityCutoff: 0,
    coarsenedReadView: false,
    ignoreStrand: false,
  })
  const [apiInterface, setApiInterface] = useState<APIInterface>(
    () => api ?? (isLocalMode ? new LocalAPI() : new ServerAPI(apiUrl)),
  )

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

  const toggleVisOptionFlag = (flagName: VisOptionFlag) => {
    setVisOptions(v => ({ ...v, [flagName]: !v[flagName] }))
  }

  const handleMappingQualityCutoffChange = (value: number) => {
    setVisOptions(v => ({ ...v, mappingQualityCutoff: value }))
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
        visMenus={
          <>
            <ViewMenu
              legendVisible={legendVisible}
              toggleLegend={() => { setLegendVisible(v => !v); }}
              visOptions={visOptions}
              toggleVisOptionFlag={toggleVisOptionFlag}
              compressedViewLocked={viewTarget.removeSequences}
            />
            <ReadsMenu
              visOptions={visOptions}
              toggleVisOptionFlag={toggleVisOptionFlag}
              handleMappingQualityCutoffChange={handleMappingQualityCutoffChange}
            />
          </>
        }
      />
      <div style={{ margin: '8px 0' }}>
        <TubeMapContainer
          key={[viewTarget.region, ...viewTarget.tracks.map(t => t.trackFile ?? '')].join('|')}
          viewTarget={viewTarget}
          dataOrigin={dataOrigin}
          visOptions={visOptions}
          APIInterface={apiInterface}
          legendVisible={legendVisible}
          onLegendClose={() => { setLegendVisible(false); }}
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
