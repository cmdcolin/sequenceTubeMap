import React, { useState } from 'react'
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

const EXAMPLE_TRACKS = [
  { files: [{ type: 'graph', name: 'fakeGraph' }] },
  { files: [{ type: 'read', name: 'fakeReads' }] },
]

function getColorSchemesFromTracks(tracks) {
  let schemes = []
  for (const key in tracks) {
    if (schemes[key] === undefined) {
      if (tracks[key].trackColorSettings !== undefined) {
        schemes[key] = tracks[key].trackColorSettings
      } else if (tracks[key].trackType === 'read') {
        schemes[key] = { ...config.defaultReadColorPalette }
      } else {
        schemes[key] = { ...config.defaultHaplotypeColorPalette }
      }
    }
  }
  return schemes
}

function removeUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null))
}

function getAPIMode(apiInterface) {
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
const defaultViewTarget =
  urlParamsToViewTarget(document.location) ?? config.DATA_SOURCES[0]

function App({ apiUrl = defaultApiUrl }) {
  console.log('App component starting up with API URL: ' + apiUrl)

  const [dataOrigin, setDataOrigin] = useState(dataOriginTypes.API)
  const [viewTarget, setViewTarget] = useState(defaultViewTarget)
  const [visOptions, setVisOptions] = useState({
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
  const [apiInterface, setApiInterface] = useState(() => new ServerAPI(apiUrl))

  const setAPIMode = mode => {
    if (mode === getAPIMode(apiInterface)) {
      return
    }
    if (mode === 'local') {
      setApiInterface(new LocalAPI())
      setDataOrigin(dataOriginTypes.API)
      setViewTarget({ tracks: [] })
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

  const setCurrentViewTarget = newTarget => {
    const newViewTarget = removeUndefined(newTarget)
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

  const toggleVisOptionFlag = flagName => {
    setVisOptions(v => ({ ...v, [flagName]: !v[flagName] }))
  }

  const handleMappingQualityCutoffChange = value => {
    setVisOptions(v => ({ ...v, mappingQualityCutoff: value }))
  }

  const setNodeLabelColorSetting = (key, value) => {
    setVisOptions(v => ({
      ...v,
      nodeLabelColorScheme: { ...v.nodeLabelColorScheme, [key]: value },
    }))
  }

  const setColorSetting = (key, index, value) => {
    setVisOptions(v => {
      const newcolors = [...v.colorSchemes]
      if (newcolors[index] === undefined) {
        newcolors[index] = { ...config.defaultReadColorPalette }
      }
      newcolors[index] = { ...newcolors[index], [key]: value }
      console.log('Set index ' + index + ' key ' + key + ' to ' + value)
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
          dataOrigin === dataOriginTypes.API
            ? viewTarget.tracks
            : EXAMPLE_TRACKS
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
