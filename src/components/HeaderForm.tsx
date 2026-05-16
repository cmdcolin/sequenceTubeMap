import { Fragment, useState, useEffect, useRef } from 'react'
import { Container, Row, Col, Label, Alert, Button } from 'reactstrap'
import '../config-client.js'
import { config } from '../config-global.mjs'
import { LocalAPI } from '../api/LocalAPI'
import type { APIInterface } from '../api/APIInterface'
import DataPositionFormRow from './DataPositionFormRow'
import ExampleSelectButtons from './ExampleSelectButtons'
import RegionInput from './RegionInput'
import PathsPanel from './PathsPanel'
import TrackPicker from './TrackPicker'
import BedFileDropdown from './BedFileDropdown'
import MenuItem from '@mui/material/MenuItem'
import MuiSelect, { type SelectChangeEvent } from '@mui/material/Select'
import FormHelperText from '@mui/material/FormHelperText'
import PopupDialog from './PopupDialog'
import Switch from 'react-switch'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear } from '@fortawesome/free-solid-svg-icons'
import { parseRegion, stringifyRegion, isEmpty, isValidURL, readsExist } from '../common.mjs'
import {
  determineRegionIndex,
  firstGraphTrack,
  isSet,
  makeAvailableTrackSet,
  regionDescByCoords,
  regionStringFromRegionIndex,
  trackIsImplied,
  trackListWithImplied,
  tracksFromArray,
  viewTargetsEqual,
} from './headerFormUtils'
import type {
  AvailableTrack,
  ColorScheme,
  FileType,
  PathInfo,
  Palette,
  RegionInfo,
  Track,
  Tracks,
  ViewTarget,
} from '../Types'

export { determineRegionIndex, regionStringFromRegionIndex }

const DATA_SOURCES: ViewTarget[] = config.DATA_SOURCES
const MAX_UPLOAD_SIZE_DESCRIPTION = '5 MB'
const dataTypes = {
  BUILT_IN: 'built-in',
  CUSTOM_FILES: 'mounted files',
  EXAMPLES: 'examples',
}

interface HeaderFormProps {
  dataOrigin: string
  setColorSetting: (
    key: keyof ColorScheme,
    index: number,
    value: Palette,
  ) => void
  setDataOrigin: (origin: string) => void
  setCurrentViewTarget: (viewTarget: ViewTarget) => void
  getCurrentViewTarget: () => ViewTarget
  defaultViewTarget?: ViewTarget
  APIInterface: APIInterface
}

interface CoordsMetaData {
  tracks: Track[] | null
  chunk: string
}

function HeaderForm({
  setColorSetting,
  setDataOrigin,
  setCurrentViewTarget,
  getCurrentViewTarget,
  defaultViewTarget,
  APIInterface,
}: HeaderFormProps) {
  const initialView = defaultViewTarget ?? DATA_SOURCES[0]
  const [bedSelect, setBedSelect] = useState(
    isSet(initialView.bedFile) ? initialView.bedFile : 'none',
  )
  const [desc, setDesc] = useState<string | null | undefined>('')
  const [regionInfo, setRegionInfo] = useState<RegionInfo>({})
  const [pathInfo, setPathInfo] = useState<PathInfo[]>([])
  const [tracks, setTracks] = useState<Tracks>(initialView.tracks)
  const [bedFile, setBedFile] = useState(initialView.bedFile)
  const [region, setRegion] = useState(initialView.region)
  const [name, setName] = useState(initialView.name)
  const [dataType, setDataType] = useState(
    initialView.dataType ?? dataTypes.BUILT_IN,
  )
  const [fileSizeAlert, setFileSizeAlert] = useState(false)
  const [uploadInProgress, setUploadInProgress] = useState(false)
  const [error, setError] = useState<Error | string | null>(null)
  const [availableTracks, setAvailableTracks] = useState<AvailableTrack[]>([])
  const [availableBeds, setAvailableBeds] = useState<string[]>([])
  const [simplify, setSimplify] = useState(initialView.simplify ?? false)
  const [removeSequences, setRemoveSequences] = useState(
    initialView.removeSequences ?? false,
  )
  const [popupOpen, setPopupOpen] = useState(false)

  // Ref for the AbortController — legitimate useRef: imperative handle that
  // must persist across renders without triggering re-renders.
  const cancelSignalRef = useRef<AbortSignal | null>(null)

  // Snapshot of state read after `await` in async fetch handlers to avoid
  // stale closures. Only fields actually consumed post-await are tracked.
  // Assigned during render (not in useEffect) so the ref is in sync with the
  // current render before any post-render code reads it.
  const stateRef = useRef({
    tracks,
    bedFile,
    region,
    dataType,
    availableTracks,
  })
  // eslint-disable-next-line react-hooks/refs
  stateRef.current = {
    tracks,
    bedFile,
    region,
    dataType,
    availableTracks,
  }

  function handleFetchError(err: unknown, message: string) {
    if (!cancelSignalRef.current?.aborted) {
      console.error(message, err)
      setError(err instanceof Error ? err : String(err))
    }
  }

  async function getBedRegions(bedFileArg: string) {
    setError(null)
    try {
      const json = await APIInterface.getBedRegions(
        bedFileArg,
        cancelSignalRef.current,
      )
      if (!json.bedRegions || !Array.isArray(json.bedRegions.desc)) {
        throw new Error(
          'Server did not send back an array of BED region descriptions',
        )
      }
      if (stateRef.current.bedFile === bedFileArg) {
        const newRegionInfo = json.bedRegions ?? {}
        setRegionInfo(newRegionInfo)
        setDesc(regionDescByCoords(stateRef.current.region, newRegionInfo))
      }
    } catch (err) {
      handleFetchError(err, `API getBedRegions failed:`)
    }
  }

  async function getPathInfo(graphFile: string | null) {
    if (graphFile === null) return
    setError(null)
    try {
      const json = await APIInterface.getPathInfo(
        graphFile,
        cancelSignalRef.current,
      )
      if (!Array.isArray(json.pathInfo)) {
        throw new Error('Server did not send back an array of path info')
      }
      const laterGraphTrack = firstGraphTrack(stateRef.current.tracks)
      if (laterGraphTrack?.trackFile === graphFile) {
        setPathInfo(json.pathInfo)
      }
    } catch (err) {
      handleFetchError(err, 'API getPathInfo failed:')
    }
  }

  async function getMountedFilenames() {
    setError(null)
    try {
      const json = await APIInterface.getFilenames(cancelSignalRef.current)
      if (!json.files || json.files.length === 0) {
        setError(
          json.error ?? 'Server did not return a list of mounted filenames.',
        )
      } else {
        const bedFiles = ['none', ...(json.bedFiles ?? [])]
        const availableTrackSet = makeAvailableTrackSet(json.files)

        const currentDataType = stateRef.current.dataType
        const currentBedFile = stateRef.current.bedFile
        const currentTracks = stateRef.current.tracks

        if (currentDataType !== dataTypes.EXAMPLES) {
          const bedAvailable =
            isValidURL(currentBedFile) || bedFiles.includes(currentBedFile ?? '')
          if (bedAvailable && isSet(currentBedFile)) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            getBedRegions(currentBedFile)
          }

          const graphTrack = firstGraphTrack(currentTracks)
          if (
            graphTrack?.trackFile &&
            !trackIsImplied(graphTrack, availableTrackSet)
          ) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            getPathInfo(graphTrack.trackFile)
          }
        }

        setAvailableTracks(
          trackListWithImplied(json.files, availableTrackSet, currentTracks),
        )
        setAvailableBeds(bedFiles)
      }
    } catch (err) {
      handleFetchError(err, `API getFilenames failed:`)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    cancelSignalRef.current = controller.signal

    /* eslint-disable @typescript-eslint/no-floating-promises, react-hooks/set-state-in-effect */
    getMountedFilenames()
    /* eslint-enable @typescript-eslint/no-floating-promises, react-hooks/set-state-in-effect */
    APIInterface.subscribeToFilenameChanges(
      getMountedFilenames,
      controller.signal,
    )

    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getNextViewTarget(): ViewTarget {
    return {
      tracks,
      bedFile,
      name,
      region,
      dataType,
      simplify: simplify && !readsExist(tracks),
      removeSequences,
    }
  }

  function handleGoButton() {
    const nextViewTarget = getNextViewTarget()
    const currViewTarget = getCurrentViewTarget()

    if (
      Object.keys(nextViewTarget.tracks).length > 0 &&
      !viewTargetsEqual(currViewTarget, nextViewTarget)
    ) {
      setCurrentViewTarget(nextViewTarget)
    }
  }

  // Re-fetch path info if the graph track changed and the new one is real.
  function refreshPathInfoIfGraphChanged(
    prevTracks: Tracks,
    newTracks: Tracks,
    availableTrackSet: Set<string>,
  ) {
    const oldGraph = firstGraphTrack(prevTracks)
    const newGraph = firstGraphTrack(newTracks)
    const sameGraph =
      newGraph && oldGraph && newGraph.trackFile === oldGraph.trackFile
    if (!sameGraph) {
      setPathInfo([])
      if (newGraph?.trackFile && !trackIsImplied(newGraph, availableTrackSet)) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        getPathInfo(newGraph.trackFile)
      }
    }
  }

  async function handleRegionChange(coords: string) {
    setRegion(coords)
    setDesc(regionDescByCoords(coords, regionInfo))

    const coordsToMetaData: Record<string, CoordsMetaData> = {}
    if (!isEmpty(regionInfo) && regionInfo.chr) {
      const { chr, start, end, tracks: rTracks, chunk: rChunk } = regionInfo
      chr.forEach((path, index) => {
        const pathWithRegion = `${path}:${start![index]}-${end![index]}`
        coordsToMetaData[pathWithRegion] = {
          tracks: rTracks?.[index] ?? null,
          chunk: rChunk?.[index] ?? '',
        }
      })
    }

    let newTracks = coordsToMetaData[coords]?.tracks ?? null
    const chunk = coordsToMetaData[coords]?.chunk ?? null
    if (!newTracks && isSet(bedFile) && chunk) {
      const json = await APIInterface.getChunkTracks(
        bedFile,
        chunk,
        cancelSignalRef.current,
      )
      newTracks = json.tracks ?? null
    }

    if (newTracks) {
      const trackObject = tracksFromArray(newTracks)
      const availableTrackSet = makeAvailableTrackSet(
        stateRef.current.availableTracks,
      )
      if (stateRef.current.region === coords) {
        setTracks(trackObject)
        setAvailableTracks(
          trackListWithImplied(
            stateRef.current.availableTracks,
            availableTrackSet,
            trackObject,
          ),
        )
      }
      refreshPathInfoIfGraphChanged(
        stateRef.current.tracks,
        trackObject,
        availableTrackSet,
      )
    }
  }

  function handleInputChange(newTracks: Tracks) {
    setTracks(newTracks)
    refreshPathInfoIfGraphChanged(
      tracks,
      newTracks,
      makeAvailableTrackSet(availableTracks),
    )
  }

  function handleBedChange(event: { target: { id: string; value: string } }) {
    const { id, value } = event.target
    const changed = value !== bedFile

    if (id === 'bedSelect') {
      setBedSelect(value)
    }
    setBedFile(value)

    if (changed) {
      setRegionInfo({})
      setDesc(undefined)
      if (isSet(value)) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        getBedRegions(value)
      }
    }
  }

  async function budgeRegion(fraction: number) {
    const parsed = parseRegion(region)
    const span =
      'distance' in parsed ? parsed.distance : parsed.end - parsed.start
    const shift = span * fraction
    const nextStart = Math.max(0, Math.round(parsed.start + shift))
    const shifted =
      'distance' in parsed
        ? { ...parsed, start: nextStart }
        : {
            ...parsed,
            start: nextStart,
            end: Math.max(0, Math.round(parsed.end + shift)),
          }
    await handleRegionChange(stringifyRegion(shifted))
    handleGoButton()
  }

  async function jumpRegion(offset: number) {
    const current = determineRegionIndex(region, regionInfo) ?? 0
    const canMove =
      (offset === -1 && canGoLeft(current)) ||
      (offset === 1 && canGoRight(current))
    const next = canMove ? current + offset : current
    await handleRegionChange(regionStringFromRegionIndex(next, regionInfo))
    handleGoButton()
  }

  function canGoLeft(regionIndex: number) {
    return isSet(bedFile) ? regionIndex > 0 : true
  }

  function canGoRight(regionIndex: number) {
    return isSet(bedFile)
      ? !!regionInfo.chr && regionIndex < regionInfo.chr.length - 1
      : true
  }

  function handleGoRight() {
    if (isSet(bedFile)) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      jumpRegion(1)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      budgeRegion(0.5)
    }
  }

  function handleGoLeft() {
    if (isSet(bedFile)) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      jumpRegion(-1)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      budgeRegion(-0.5)
    }
  }

  function handleDataSourceChange(event: SelectChangeEvent) {
    const value = event.target.value

    if (value === dataTypes.CUSTOM_FILES) {
      setBedSelect('none')
      setDesc('')
      setRegionInfo({})
      setPathInfo([])
      setTracks({})
      setBedFile('none')
      setRegion('')
      setName(undefined)
      setDataType(dataTypes.CUSTOM_FILES)
      setFileSizeAlert(false)
      setUploadInProgress(false)
      setError(null)
    } else if (value === dataTypes.EXAMPLES) {
      setDataType(dataTypes.EXAMPLES)
    } else {
      const ds = DATA_SOURCES.find(d => d.name === value)
      if (ds) {
        if (isSet(ds.bedFile)) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          getBedRegions(ds.bedFile)
        } else {
          setRegionInfo({})
        }

        const graphTrack = firstGraphTrack(ds.tracks)
        const laterGraph = firstGraphTrack(tracks)
        if (!laterGraph || graphTrack?.trackFile !== laterGraph.trackFile) {
          setPathInfo([])
        }
        if (graphTrack?.trackFile) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          getPathInfo(graphTrack.trackFile)
        }

        setTracks(ds.tracks)
        setBedFile(ds.bedFile)
        setBedSelect(isSet(ds.bedFile) ? ds.bedFile : 'none')
        setRegion(ds.region)
        setDataType(dataTypes.BUILT_IN)
        setName(ds.name)
      }
    }
  }

  async function handleFileUpload(
    fileType: FileType,
    file: File,
  ): Promise<string | undefined> {
    if (
      !(APIInterface instanceof LocalAPI) &&
      file.size > config.MAXUPLOADSIZE
    ) {
      setFileSizeAlert(true)
      return
    }

    setUploadInProgress(true)

    try {
      const fileName = await APIInterface.putFile(
        fileType,
        file,
        cancelSignalRef.current,
      )
      if (fileType === 'graph') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        getMountedFilenames()
      }
      setUploadInProgress(false)
      return fileName
    } catch (e) {
      if (!cancelSignalRef.current?.aborted) {
        setUploadInProgress(false)
        throw e
      }
      return undefined
    }
  }

  let errorDiv = null
  if (error) {
    const message = error instanceof Error ? error.message : String(error)
    errorDiv = (
      <div>
        <Container fluid={true}>
          <Row>
            <Alert color="danger">{message}</Alert>
          </Row>
        </Container>
      </div>
    )
  }

  const dataSourceDropdownOptions = [
    ...DATA_SOURCES.map(ds => ({ value: ds.name, label: ds.name })),
    { value: dataTypes.EXAMPLES, label: 'synthetic data examples' },
    { value: dataTypes.CUSTOM_FILES, label: 'custom' },
  ]
  const dataSourceValue =
    dataType === dataTypes.BUILT_IN ? (name ?? '') : dataType

  const customFilesFlag = dataType === dataTypes.CUSTOM_FILES
  const examplesFlag = dataType === dataTypes.EXAMPLES
  const viewTargetHasChange = !viewTargetsEqual(
    getNextViewTarget(),
    getCurrentViewTarget(),
  )
  const regionIndex = determineRegionIndex(region, regionInfo) ?? 0

  const DataPositionFormRowComponent = (
    <DataPositionFormRow
      handleGoLeft={() => { handleGoLeft(); }}
      handleGoRight={() => { handleGoRight(); }}
      handleGoButton={() => { handleGoButton(); }}
      uploadInProgress={uploadInProgress}
      getCurrentViewTarget={getCurrentViewTarget}
      viewTargetHasChange={viewTargetHasChange}
      canGoLeft={canGoLeft(regionIndex)}
      canGoRight={canGoRight(regionIndex)}
    />
  )

  return (
    <div>
      <Container>
        <Row>
          <Col>{errorDiv}</Col>
        </Row>
        <Row>
          <Col md="auto">
            <img src="./logo.png" alt="Logo" />
          </Col>
          <Col>
            <Label
              className="tight-label mb-2 me-sm-2 mb-sm-0 ms-2"
              htmlFor="dataSourceSelect"
            >
              Data:
            </Label>
            <MuiSelect
              id="dataSourceSelect"
              data-testid="dataSourceSelect"
              size="small"
              fullWidth
              value={dataSourceValue}
              onChange={e => { handleDataSourceChange(e); }}
            >
              {dataSourceDropdownOptions.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </MuiSelect>
            &nbsp;
            {customFilesFlag && (
              <Fragment>
                <Label
                  htmlFor="bedSelectInput"
                  className="customData tight-label mb-2 me-sm-2 mb-sm-0 ms-2"
                >
                  BED:
                </Label>
                &nbsp;
                <BedFileDropdown
                  className="customDataMounted dropdown mb-2 me-sm-4 mb-sm-0"
                  id="bedSelect"
                  inputId="bedSelectInput"
                  value={bedSelect}
                  onChange={(e) => { handleBedChange(e); }}
                  options={availableBeds}
                />
                &nbsp;
              </Fragment>
            )}
            {!examplesFlag && (
              <RegionInput
                regionInfo={regionInfo}
                handleRegionChange={coords => handleRegionChange(coords)}
                region={region}
              />
            )}
            {customFilesFlag && (
              <div className="d-flex justify-content-between align-items-start">
                <div>{DataPositionFormRowComponent}</div>
                <div className="d-flex justify-content-end align-items-start flex-shrink-0">
                  <>
                    <Button
                      onClick={() => { setPopupOpen(!popupOpen); }}
                      outline
                      active={simplify || removeSequences}
                    >
                      <FontAwesomeIcon icon={faGear} /> Simplify
                    </Button>
                    <PopupDialog
                      open={popupOpen}
                      close={() => { setPopupOpen(!popupOpen); }}
                      width="400px"
                    >
                      <div style={{ height: '10vh' }}>
                        <label
                          className="d-flex align-items-center justify-content-between"
                          style={{ marginBottom: '10px' }}
                        >
                          <span>Remove Small Variants</span>
                          <Switch
                            onChange={() => { setSimplify(!simplify); }}
                            checked={!!simplify}
                          />
                        </label>
                        <label className="d-flex align-items-center justify-content-between">
                          <span>Remove Node Sequences</span>
                          <Switch
                            onChange={() =>
                              { setRemoveSequences(!removeSequences); }
                            }
                            checked={!!removeSequences}
                          />
                        </label>
                      </div>
                    </PopupDialog>
                  </>
                  <TrackPicker
                    tracks={tracks}
                    availableTracks={availableTracks}
                    onChange={newTracks => { handleInputChange(newTracks); }}
                    handleFileUpload={async (fileType, file) =>
                      handleFileUpload(fileType, file)
                    }
                  />
                </div>
              </div>
            )}
            <Row>
              <Alert
                color="danger"
                isOpen={fileSizeAlert}
                toggle={() => {
                  setFileSizeAlert(false)
                }}
                className="mt-3"
              >
                <strong>File size too big! </strong>
                You may only upload files with a maximum size of{' '}
                {MAX_UPLOAD_SIZE_DESCRIPTION}.
              </Alert>

              {examplesFlag ? (
                <ExampleSelectButtons
                  setDataOrigin={setDataOrigin}
                  setColorSetting={setColorSetting}
                />
              ) : (
                !customFilesFlag && DataPositionFormRowComponent
              )}
            </Row>
            {desc ? (
              <div style={{ marginTop: '10px' }}>
                <FormHelperText> {'Region Description: '} </FormHelperText>
                <FormHelperText style={{ fontWeight: 'bold' }}>
                  {desc}
                </FormHelperText>
              </div>
            ) : null}
          </Col>
        </Row>
        {pathInfo.length > 0 && !examplesFlag && (
          <Row>
            <Col>
              <PathsPanel
                pathInfo={pathInfo}
                onLoadPath={async region => {
                  await handleRegionChange(region)
                  handleGoButton()
                }}
              />
            </Col>
          </Row>
        )}
      </Container>
    </div>
  )
}

export default HeaderForm
