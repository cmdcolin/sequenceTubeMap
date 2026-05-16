import { useState } from 'react'
import isEqual from 'react-fast-compare'

import './App.css'
import HeaderForm from './components/HeaderForm'
import TubeMapContainer from './components/TubeMapContainer'
import { urlParamsToViewTarget } from './components/CopyLink'
import CustomizationAccordion from './components/CustomizationAccordion'
import Footer from './components/Footer'
import { dataOriginTypes } from './enums'
import './config-client.js'
import { config } from './config-global.mjs'
import ServerAPI from './api/ServerAPI.mjs'
import { LocalAPI } from './api/LocalAPI.mjs'
import type { ColorScheme, Palette, Tracks, ViewTarget, VisOptions } from './Types'

const EXAMPLE_TRACKS: Tracks = {
  0: { trackType: 'graph', trackFile: 'fakeGraph' },
  1: { trackType: 'read', trackFile: 'fakeReads' },
}

function getColorSchemesFromTracks(tracks: Tracks): ColorScheme[] {
  const schemes: ColorScheme[] = []
  for (const key in tracks) {
    const idx = Number(key)
    if (schemes[idx] === undefined) {
      const t = tracks[key]
      if (t.trackColorSettings !== undefined) {
        schemes[idx] = t.trackColorSettings
      } else if (t.trackType === 'read') {
        schemes[idx] = { ...config.defaultReadColorPalette }
      } else {
        schemes[idx] = { ...config.defaultHaplotypeColorPalette }
      }
    }
  }
  return schemes
}

function removeUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null),
  ) as Partial<T>
}

function getAPIMode(apiInterface: unknown): 'local' | 'server' {
  if (apiInterface instanceof LocalAPI) {
    return 'local'
  } else if (apiInterface instanceof ServerAPI) {
    return 'server'
  } else {
    throw new Error('Unnamed API implementation: ' + apiInterface)
  }
}

const defaultApiUrl =
  (config.BACKEND_URL || `${window.location.origin}`) + '/api/v0'
const defaultViewTarget: ViewTarget =
  (urlParamsToViewTarget(document.location) as unknown as ViewTarget) ??
  config.DATA_SOURCES[0]

interface AppProps {
  apiUrl?: string
}

function App({ apiUrl = defaultApiUrl }: AppProps) {
  console.log('App component starting up with API URL: ' + apiUrl)

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
      setViewTarget({ tracks: {}, region: '' })
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
    const newViewTarget = removeUndefined(newTarget) as ViewTarget
    if (
      !isEqual(viewTarget, newViewTarget) ||
      dataOrigin !== dataOriginTypes.API
    ) {
      console.log('Adopting view target: ', newViewTarget)
      const newColorSchemes = getColorSchemesFromTracks(newViewTarget.tracks)
      console.log('Adopting color schemes: ', newColorSchemes)
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

  // Note: HeaderForm.handleGoButton calls this with only (key, value) — that
  // path leaves `value` undefined here and the original JS would index
  // colorSchemes by the palette name. Behavior preserved verbatim.
  const setColorSetting = (
    key: string,
    indexOrValue: number | string | Palette,
    value?: Palette,
  ) => {
    setVisOptions(v => {
      const newcolors = [...v.colorSchemes]
      const idx = indexOrValue as unknown as number
      if (newcolors[idx] === undefined) {
        newcolors[idx] = { ...config.defaultReadColorPalette }
      }
      newcolors[idx] = { ...newcolors[idx], [key]: value }
      console.log('Set index ' + idx + ' key ' + key + ' to ' + value)
      console.log('New colors: ', newcolors)
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
      <CustomizationAccordion
        enableCompressedNodes={viewTarget.removeSequences}
        visOptions={visOptions}
        tracks={
          dataOrigin === dataOriginTypes.API ? viewTarget.tracks : EXAMPLE_TRACKS
        }
        toggleFlag={toggleVisOptionFlag}
        handleMappingQualityCutoffChange={handleMappingQualityCutoffChange}
        setColorSetting={setColorSetting}
        setNodeLabelColorSetting={setNodeLabelColorSetting}
        currentAPIMode={getAPIMode(apiInterface)}
        setAPIMode={setAPIMode}
      />
      <Footer />
    </div>
  )
}

export default App
