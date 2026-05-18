import { useState } from 'react'
import isEqual from 'react-fast-compare'

import './App.css'
import HeaderForm from './components/HeaderForm.tsx'
import TubeMapContainer from './components/TubeMapContainer.tsx'
import Legend from './components/Legend.tsx'
import { urlParamsToViewTarget } from './components/CopyLink.tsx'
import CustomizationAccordion from './components/CustomizationAccordion.tsx'
import Footer from './components/Footer.tsx'
import { dataOriginTypes } from './enums.ts'
import './config-client.js'
import { config } from './config-global.mjs'
import ServerAPI from './api/ServerAPI.ts'
import { LocalAPI } from './api/LocalAPI.ts'
import { defaultTrackColors } from './common.ts'
import type {
  ColorScheme,
  Palette,
  PaletteField,
  Tracks,
  ViewTarget,
  VisOptions,
} from './Types.ts'

const EXAMPLE_TRACKS: Tracks = [
  { trackType: 'graph', trackFile: 'fakeGraph' },
  { trackType: 'read', trackFile: 'fakeReads' },
]

function getColorSchemesFromTracks(tracks: Tracks): ColorScheme[] {
  return tracks.map(t => t.trackColorSettings ?? defaultTrackColors(t.trackType))
}

function removeUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T
}

function getAPIMode(apiInterface: LocalAPI | ServerAPI): 'local' | 'server' {
  if (apiInterface instanceof LocalAPI) {
    return 'local'
  } else {
    return 'server'
  }
}

const defaultApiUrl =
  (config.BACKEND_URL || window.location.origin) + '/api/v0'
const defaultViewTarget: ViewTarget =
  urlParamsToViewTarget(document.location) ?? config.DATA_SOURCES[0]

interface AppProps {
  apiUrl?: string
}

function App({ apiUrl = defaultApiUrl }: AppProps) {
  const [dataOrigin, setDataOrigin] = useState<string>(dataOriginTypes.API)
  const [viewTarget, setViewTarget] = useState<ViewTarget>(defaultViewTarget)
  const [visOptions, setVisOptions] = useState<VisOptions>({
    removeRedundantNodes: true,
    compressedView: false,
    transparentNodes: false,
    showNodeLabels: false,
    nodeLabelColorScheme: { mainPalette: 'plainColors' },
    showReads: true,
    showSoftClips: true,
    bundleReadsByPath: false,
    colorReadsByMappingQuality: false,
    alphaReadsByMappingQuality: false,
    colorSchemes: getColorSchemesFromTracks(defaultViewTarget.tracks),
    mappingQualityCutoff: 0,
  })
  const [apiInterface, setApiInterface] = useState<LocalAPI | ServerAPI>(
    () => new ServerAPI(apiUrl),
  )

  const setAPIMode = (mode: string) => {
    if (mode === getAPIMode(apiInterface)) {
      return
    }
    if (mode === 'local') {
      setApiInterface(new LocalAPI())
      setDataOrigin(dataOriginTypes.API)
      setViewTarget({ tracks: [], region: '' })
      setVisOptions(v => ({ ...v, colorSchemes: [] }))
    } else if (mode === 'server') {
      setApiInterface(new ServerAPI(apiUrl))
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

  const getCurrentViewTarget = () => removeUndefined(viewTarget)

  const toggleVisOptionFlag = (flagName: string) => {
    setVisOptions(v => {
      const key = flagName as keyof VisOptions
      return { ...v, [key]: !v[key] }
    })
  }

  const handleMappingQualityCutoffChange = (value: string | number) => {
    setVisOptions(v => ({ ...v, mappingQualityCutoff: Number(value) }))
  }

  const setNodeLabelColorSetting = (key: string, value: Palette) => {
    setVisOptions(v => ({
      ...v,
      nodeLabelColorScheme: { ...v.nodeLabelColorScheme, [key]: value },
    }))
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
        dataOrigin={dataOrigin}
        defaultViewTarget={defaultViewTarget}
        getCurrentViewTarget={getCurrentViewTarget}
        APIInterface={apiInterface}
      />
      <TubeMapContainer
        viewTarget={viewTarget}
        dataOrigin={dataOrigin}
        visOptions={visOptions}
        APIInterface={apiInterface}
      />
      <div style={{ margin: '8px 0' }}>
        <Legend
          tracks={
            dataOrigin === dataOriginTypes.API ? viewTarget.tracks : EXAMPLE_TRACKS
          }
          colorSchemes={visOptions.colorSchemes}
        />
      </div>
      <CustomizationAccordion
        enableCompressedNodes={viewTarget.removeSequences}
        visOptions={visOptions}
        toggleFlag={toggleVisOptionFlag}
        handleMappingQualityCutoffChange={handleMappingQualityCutoffChange}
        setNodeLabelColorSetting={setNodeLabelColorSetting}
        currentAPIMode={getAPIMode(apiInterface)}
        setAPIMode={setAPIMode}
      />
      <Footer />
    </div>
  )
}

export default App
