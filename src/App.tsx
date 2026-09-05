import { useState } from 'react'
import isEqual from 'react-fast-compare'

import './App.css'
import HeaderForm from './components/HeaderForm.tsx'
import TubeMapContainer from './components/TubeMapContainer.tsx'
import { urlParamsToViewTarget } from './urlViewTarget.ts'
import CustomizationAccordion from './components/CustomizationAccordion.tsx'
import Footer from './components/Footer.tsx'
import { dataOriginTypes } from './enums.ts'
import './config-client.js'
import { config } from './config-global.mjs'
import ServerAPI from './api/ServerAPI.ts'
import { LocalAPI } from './api/LocalAPI.ts'
import type { APIInterface } from './api/APIInterface.ts'
import { defaultTrackColors, isLocalCompatibleDataSource } from './common.ts'
import type {
  ColorScheme,
  Palette,
  PaletteField,
  Tracks,
  ViewTarget,
  VisOptions,
} from './Types.ts'

function getColorSchemesFromTracks(tracks: Tracks): ColorScheme[] {
  return tracks.map(t => t.trackColorSettings ?? defaultTrackColors(t.trackType))
}

function removeUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T
}

// BACKEND_URL semantics: literal `false` selects the in-browser LocalAPI; any string
// (possibly empty for same-origin via the dev-server proxy) means ServerAPI.
const isLocalMode = config.BACKEND_URL === false

const defaultApiUrl = isLocalMode ? '' : `${config.BACKEND_URL}/api/v0`

const UPSTREAM_API_URL = 'https://api.tubemap.graphs.vg/api/v0'

const localDefaultViewTarget: ViewTarget =
  config.DATA_SOURCES.find(isLocalCompatibleDataSource) ??
  { tracks: [], region: '' }

const defaultViewTarget: ViewTarget =
  urlParamsToViewTarget(document.location) ??
  (isLocalMode ? localDefaultViewTarget : config.DATA_SOURCES[0])

interface AppProps {
  apiUrl?: string
}

function App({ apiUrl = defaultApiUrl }: AppProps) {
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
    () => (isLocalMode ? new LocalAPI() : new ServerAPI(apiUrl)),
  )

  const setAPIMode = (mode: string) => {
    if (mode === apiInterface.mode) {
      return
    }
    if (mode === 'local') {
      setApiInterface(new LocalAPI())
      setDataOrigin(dataOriginTypes.API)
      setViewTarget(localDefaultViewTarget)
      setVisOptions(v => ({
        ...v,
        colorSchemes: getColorSchemesFromTracks(localDefaultViewTarget.tracks),
      }))
    } else if (mode === 'server') {
      setApiInterface(new ServerAPI(apiUrl))
      setDataOrigin(dataOriginTypes.API)
      setViewTarget(defaultViewTarget)
      setVisOptions(v => ({
        ...v,
        colorSchemes: getColorSchemesFromTracks(defaultViewTarget.tracks),
      }))
    } else if (mode === 'upstream') {
      setApiInterface(new ServerAPI(UPSTREAM_API_URL, 'upstream'))
      setDataOrigin(dataOriginTypes.API)
      setViewTarget(defaultViewTarget)
      setVisOptions(v => ({
        ...v,
        colorSchemes: getColorSchemesFromTracks(defaultViewTarget.tracks),
      }))
    } else {
      throw new Error('Unimplemented API mode: ' + mode)
    }
  }

  const setCurrentViewTarget = (newTarget: ViewTarget) => {
    const newViewTarget = removeUndefined(newTarget)
    if (
      !isEqual(viewTarget, newViewTarget) ||
      dataOrigin !== dataOriginTypes.API
    ) {
      const newColorSchemes = getColorSchemesFromTracks(newViewTarget.tracks)
      setViewTarget(newViewTarget)
      setDataOrigin(dataOriginTypes.API)
      setVisOptions(v => ({ ...v, colorSchemes: newColorSchemes }))
    }
  }

  const currentViewTarget = removeUndefined(viewTarget)

  const toggleVisOptionFlag = (flagName: string) => {
    setVisOptions(v => {
      const key = flagName as keyof VisOptions
      return { ...v, [key]: !v[key] }
    })
  }

  const handleMappingQualityCutoffChange = (value: string | number) => {
    setVisOptions(v => ({ ...v, mappingQualityCutoff: Number(value) }))
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

  return (
    <div>
      <HeaderForm
        setCurrentViewTarget={setCurrentViewTarget}
        setDataOrigin={setDataOrigin}
        setColorSetting={setColorSetting}
        defaultViewTarget={defaultViewTarget}
        currentViewTarget={currentViewTarget}
        APIInterface={apiInterface}
        onAPIMode={setAPIMode}
        serverModeId={isLocalMode ? 'upstream' : 'server'}
        legendVisible={legendVisible}
        toggleLegend={() => { setLegendVisible(v => !v) }}
        visOptions={visOptions}
        toggleVisOptionFlag={toggleVisOptionFlag}
        handleMappingQualityCutoffChange={handleMappingQualityCutoffChange}
        compressedViewLocked={viewTarget.removeSequences}
      />
      <div style={{ margin: '8px 0' }}>
        <TubeMapContainer
          key={[viewTarget.region, ...viewTarget.tracks.map(t => t.trackFile ?? '')].join('|')}
          viewTarget={viewTarget}
          dataOrigin={dataOrigin}
          visOptions={visOptions}
          APIInterface={apiInterface}
          legendVisible={legendVisible}
          onLegendClose={() => { setLegendVisible(false) }}
        />
      </div>
      <CustomizationAccordion
        currentAPIMode={apiInterface.mode}
        setAPIMode={setAPIMode}
        showServerOption={!isLocalMode}
      />
      <Footer />
    </div>
  )
}

export default App
