import { Fragment, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { Container, Row, Col, Label, Alert } from 'reactstrap'
import '../config-client.js'
import { config } from '../config-global.mjs'
import { LocalAPI } from '../api/LocalAPI.ts'
import type { APIInterface } from '../api/APIInterface.ts'
import DataPositionFormRow from './DataPositionFormRow.tsx'
import ExampleSelectButtons from './ExampleSelectButtons.tsx'
import RegionInput from './RegionInput.tsx'
import PathsPanel from './PathsPanel.tsx'
import TrackPicker from './TrackPicker.tsx'
import BedFileDropdown from './BedFileDropdown.tsx'
import UploadPanel from './UploadPanel.tsx'
import DataSourceSelect from './DataSourceSelect.tsx'
import SimplifyButton from './SimplifyButton.tsx'
import type { SelectChangeEvent } from '@mui/material/Select'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import FormHelperText from '@mui/material/FormHelperText'
import {
  isValidRegion,
  isLocalCompatibleDataSource,
  parseRegion,
  stringifyRegion,
  isEmpty,
} from '../common.ts'
import {
  determineRegionIndex,
  discoverDataSources,
  firstGraphTrack,
  isSet,
  makeAvailableTrackSet,
  makeViewTarget,
  regionDescByCoords,
  regionStringFromRegionIndex,
  trackListWithImplied,
  viewTargetsEqual,
} from './headerFormUtils.ts'
import type {
  FileType,
  PaletteField,
  PathInfo,
  Palette,
  RegionInfo,
  Track,
  Tracks,
  ViewTarget,
} from '../Types.ts'

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
    key: PaletteField,
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
  const initialView = defaultViewTarget ?? DATA_SOURCES[0]!
  const [bedSelect, setBedSelect] = useState(
    isSet(initialView.bedFile) ? initialView.bedFile : 'none',
  )
  const [tracks, setTracks] = useState<Tracks>(initialView.tracks)
  const [bedFile, setBedFile] = useState(initialView.bedFile)
  const [region, setRegion] = useState(initialView.region)
  const [name, setName] = useState(initialView.name)
  const [dataType, setDataType] = useState(
    initialView.dataType ?? dataTypes.BUILT_IN,
  )
  const [fileSizeAlert, setFileSizeAlert] = useState(false)
  const [uploadInProgress, setUploadInProgress] = useState(false)
  // Set true when a dataset with a BED but no preset region is picked; the
  // effect below applies the first BED entry as the default region once BED
  // data arrives, then clears the flag.
  const [pendingRegionDefault, setPendingRegionDefault] = useState(false)
  const [manualError, setManualError] = useState<Error | string | null>(null)
  const [simplify, setSimplify] = useState(initialView.simplify ?? false)
  const [removeSequences, setRemoveSequences] = useState(
    initialView.removeSequences ?? false,
  )

  // SWR-managed fetches. Each key encodes the state it depends on, so changing
  // that state automatically triggers a new fetch and supersedes any in-flight
  // result for the previous key (SWR only returns data for the current key).
  const {
    data: filenamesData,
    error: filenamesError,
    mutate: refetchFilenames,
  } = useSWR('headerForm.filenames', () => APIInterface.getFilenames(null), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  })

  const files = filenamesData?.files ?? []
  const availableBeds = ['none', ...(filenamesData?.bedFiles ?? [])]
  const availableTrackSet = makeAvailableTrackSet(files)
  const availableTracks = trackListWithImplied(files, availableTrackSet, tracks)
  // In WASM/local mode the gbz-base query.wasm only understands .gbz.db files,
  // so .vg.xg-based built-ins would silently fail. Hide them from the dropdown.
  const isLocal = APIInterface instanceof LocalAPI
  const visibleDataSources = isLocal
    ? DATA_SOURCES.filter(isLocalCompatibleDataSource)
    : DATA_SOURCES
  const discoveredDataSources = discoverDataSources(
    files,
    filenamesData?.bedFiles ?? [],
    visibleDataSources,
    config.dataPath,
    filenamesData?.folderManifests,
  )
  const allDataSources = [...visibleDataSources, ...discoveredDataSources]

  const bedKey =
    dataType !== dataTypes.EXAMPLES && isSet(bedFile) ? bedFile : null
  const { data: bedRegionsData, error: bedRegionsError } = useSWR(
    bedKey,
    (k: string) => APIInterface.getBedRegions(k, null),
    {
      // Apply the auto-default region from the first BED entry when BED data
      // arrives for a dataset switch that armed pendingRegionDefault.
      onSuccess: data => {
        if (pendingRegionDefault) {
          const ri = data.bedRegions
          if (ri?.chr && ri.chr.length > 0) {
            setRegion(regionStringFromRegionIndex(0, ri))
          }
          setPendingRegionDefault(false)
        }
      },
    },
  )
  const regionInfo: RegionInfo = bedRegionsData?.bedRegions ?? {}

  const graphTrack = firstGraphTrack(tracks)
  // Ask whenever we have a graph track that isn't a synthetic example.
  // `getPathInfo` returns [] (and won't surface an error) when the API
  // can't resolve the file, so we don't need a separate availability gate.
  const graphKey =
    dataType !== dataTypes.EXAMPLES && graphTrack?.trackFile
      ? graphTrack.trackFile
      : null
  const { data: pathInfoData, error: pathInfoError } = useSWR(
    graphKey,
    (k: string) => APIInterface.getPathInfo(k, null),
  )
  const pathInfo: PathInfo[] = pathInfoData?.pathInfo ?? []

  // Server explicitly reported no mounted files (vs network/parse failure).
  // LocalAPI starts with no files until the user uploads, so we only surface
  // the generic fallback when a real server returned an empty list.
  const noFilesMessage =
    filenamesData && (!filenamesData.files || filenamesData.files.length === 0)
      ? (filenamesData.error ??
          (APIInterface instanceof LocalAPI
            ? null
            : 'Server did not return a list of mounted filenames.'))
      : null

  const error =
    manualError ??
    filenamesError ??
    bedRegionsError ??
    pathInfoError ??
    noFilesMessage

  const desc = regionDescByCoords(region, regionInfo)

  // Subscribe to server-pushed filename changes; revalidate the SWR cache on
  // each notification.
  useEffect(() => {
    const controller = new AbortController()
    APIInterface.subscribeToFilenameChanges(
      () => {
        void refetchFilenames()
      },
      controller.signal,
    )
    return () => {
      controller.abort()
    }
  }, [APIInterface, refetchFilenames])


  // Per-invocation AbortController for getChunkTracks (event-driven, not
  // SWR-cached). We abort the prior in-flight call when a new region change
  // arrives so its result can't overwrite the newer one. Assigned only inside
  // an event handler — never during render.
  const chunkTracksAbortRef = useRef<AbortController | null>(null)

  function buildViewTarget(overrides?: {
    region?: string
    tracks?: Tracks
  }): ViewTarget {
    return makeViewTarget({
      tracks: overrides?.tracks ?? tracks,
      bedFile,
      name,
      region: overrides?.region ?? region,
      dataType,
      simplify,
      removeSequences,
    })
  }

  function getNextViewTarget(): ViewTarget {
    return buildViewTarget()
  }

  function commitViewTarget(next: ViewTarget) {
    if (!isValidRegion(next.region)) {
      setManualError(
        new Error(
          `Cannot load: region "${next.region}" is missing or malformed. ` +
            `Type a region like "ref:0-1000" or pick a path below.`,
        ),
      )
      return
    }
    if (
      next.tracks.length > 0 &&
      !viewTargetsEqual(getCurrentViewTarget(), next)
    ) {
      setCurrentViewTarget(next)
    }
  }

  function handleGoButton() {
    commitViewTarget(getNextViewTarget())
  }

  // Updates region (and tracks, if a BED-driven chunk requires it) and returns
  // the fresh values so callers that immediately "go" can build a view target
  // without reading stale state from this render's closure.
  async function handleRegionChange(
    coords: string,
  ): Promise<{ region: string; tracks: Tracks } | null> {
    setRegion(coords)
    setManualError(null)

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
      chunkTracksAbortRef.current?.abort()
      const controller = new AbortController()
      chunkTracksAbortRef.current = controller
      try {
        const json = await APIInterface.getChunkTracks(
          bedFile,
          chunk,
          controller.signal,
        )
        newTracks = json.tracks ?? null
      } catch (e) {
        if (controller.signal.aborted) {
          return null
        }
        console.error('API getChunkTracks failed:', e)
        setManualError(e instanceof Error ? e : String(e))
        return null
      }
    }

    if (newTracks) {
      setTracks(newTracks)
      // pathInfo SWR key derives from the graph track, so it re-fetches on its
      // own when the new tracks contain a different graph.
    }
    return { region: coords, tracks: newTracks ?? tracks }
  }

  async function changeRegionAndGo(coords: string) {
    const result = await handleRegionChange(coords)
    if (result) {
      commitViewTarget(buildViewTarget(result))
    }
  }

  function handleInputChange(newTracks: Tracks) {
    setTracks(newTracks)
  }

  function handleBedChange(event: { target: { id: string; value: string } }) {
    const { id, value } = event.target
    if (id === 'bedSelect') {
      setBedSelect(value)
    }
    setBedFile(value)
    // regionInfo + desc derive from the bedFile-keyed SWR fetch; nothing else
    // to reset here.
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
    await changeRegionAndGo(stringifyRegion(shifted))
  }

  async function jumpRegion(offset: -1 | 1) {
    const current = determineRegionIndex(region, regionInfo) ?? 0
    const canMove =
      (offset === -1 && canGoLeft(current)) ||
      (offset === 1 && canGoRight(current))
    const next = canMove ? current + offset : current
    await changeRegionAndGo(regionStringFromRegionIndex(next, regionInfo))
  }

  function canGoLeft(regionIndex: number) {
    return isSet(bedFile) ? regionIndex > 0 : true
  }

  function canGoRight(regionIndex: number) {
    return isSet(bedFile)
      ? !!regionInfo.chr && regionIndex < regionInfo.chr.length - 1
      : true
  }

  function move(dir: -1 | 1) {
    if (isSet(bedFile)) {
      void jumpRegion(dir)
    } else {
      void budgeRegion(dir * 0.5)
    }
  }

  function handleDataSourceChange(event: SelectChangeEvent) {
    const value = event.target.value
    setManualError(null)

    if (value === dataTypes.CUSTOM_FILES) {
      setBedSelect('none')
      setTracks([])
      setBedFile('none')
      setRegion('')
      setName(undefined)
      setDataType(dataTypes.CUSTOM_FILES)
      setFileSizeAlert(false)
      setUploadInProgress(false)
    } else if (value === dataTypes.EXAMPLES) {
      setDataType(dataTypes.EXAMPLES)
    } else {
      const ds = allDataSources.find(d => d.name === value)
      if (ds) {
        setTracks(ds.tracks)
        setBedFile(ds.bedFile)
        setBedSelect(isSet(ds.bedFile) ? ds.bedFile : 'none')
        setRegion(ds.region)
        setDataType(dataTypes.BUILT_IN)
        setName(ds.name)
        setPendingRegionDefault(isSet(ds.bedFile) && !ds.region)
        // SWR keys for regionInfo + pathInfo update with the new bedFile /
        // graph track and refetch automatically.
      }
    }
  }

  function handleQuickUploaded(uploadedTracks: Track[]) {
    setBedSelect('none')
    setBedFile('none')
    setRegion('')
    setName(undefined)
    setTracks(uploadedTracks)
    setDataType(dataTypes.CUSTOM_FILES)
    setFileSizeAlert(false)
    setManualError(null)
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
      const fileName = await APIInterface.putFile(fileType, file, null)
      if (fileType === 'graph') {
        void refetchFilenames()
      }
      setUploadInProgress(false)
      return fileName
    } catch (e) {
      setUploadInProgress(false)
      throw e
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

  // Group options for visual separation. Subheaders are only emitted when
  // there's something to separate, so the dropdown stays flat in the common
  // case (no discovered folders).
  const dataSourceGroups: {
    heading: string | null
    options: { value: string; label: string }[]
  }[] = []
  const hasDiscovered = discoveredDataSources.length > 0
  dataSourceGroups.push({
    heading: hasDiscovered ? 'Built-in' : null,
    options: visibleDataSources.map(ds => ({
      value: ds.name!,
      label: ds.name!,
    })),
  })
  if (hasDiscovered) {
    dataSourceGroups.push({
      heading: 'Discovered folders',
      options: discoveredDataSources.map(ds => ({
        value: ds.name!,
        label: ds.name!,
      })),
    })
  }
  dataSourceGroups.push({
    heading: hasDiscovered ? 'Other' : null,
    options: [{ value: dataTypes.EXAMPLES, label: 'synthetic data examples' }],
  })
  const dataSourceValue =
    dataType === dataTypes.BUILT_IN ? (name ?? '') : dataType

  const viewMode: 'sample' | 'upload' =
    dataType === dataTypes.CUSTOM_FILES ? 'upload' : 'sample'

  function handleViewModeChange(next: 'sample' | 'upload') {
    if (next === viewMode) {
      return
    }
    setManualError(null)
    if (next === 'upload') {
      setBedSelect('none')
      setTracks([])
      setBedFile('none')
      setRegion('')
      setName(undefined)
      setDataType(dataTypes.CUSTOM_FILES)
      setFileSizeAlert(false)
      setUploadInProgress(false)
    } else {
      const first = visibleDataSources[0] ?? DATA_SOURCES[0]!
      setTracks(first.tracks)
      setBedFile(first.bedFile)
      setBedSelect(isSet(first.bedFile) ? first.bedFile : 'none')
      setRegion(first.region)
      setName(first.name)
      setDataType(dataTypes.BUILT_IN)
      setPendingRegionDefault(isSet(first.bedFile) && !first.region)
    }
  }

  const customFilesFlag = dataType === dataTypes.CUSTOM_FILES
  const examplesFlag = dataType === dataTypes.EXAMPLES
  const viewTargetHasChange = !viewTargetsEqual(
    getNextViewTarget(),
    getCurrentViewTarget(),
  )
  const regionIndex = determineRegionIndex(region, regionInfo) ?? 0

  const DataPositionFormRowComponent = (
    <DataPositionFormRow
      handleGoLeft={() => { move(-1); }}
      handleGoRight={() => { move(1); }}
      handleGoButton={() => { handleGoButton(); }}
      uploadInProgress={uploadInProgress}
      getCurrentViewTarget={getCurrentViewTarget}
      viewTargetHasChange={viewTargetHasChange}
      canGo={isValidRegion(region) && tracks.length > 0}
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
            <a
              href="https://github.com/cmdcolin/sequenceTubeMap"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', marginTop: '4px' }}
            >
              <img src="./mempang26-badge.svg" alt="MemPanG26 Edition" />
            </a>
            <a
              href="https://github.com/cmdcolin/sequenceTubeMap#no-server-required"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                marginTop: '2px',
                fontSize: '0.7rem',
                color: '#888',
              }}
            >
              server-free — what does this mean?
            </a>
          </Col>
          <Col>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={viewMode}
              onChange={(_e, next: 'sample' | 'upload' | null) => {
                if (next) { handleViewModeChange(next); }
              }}
              sx={{ mb: 1, ms: 2 }}
              data-testid="dataModeToggle"
            >
              <ToggleButton value="sample" data-testid="dataModeSample">
                Sample data
              </ToggleButton>
              <ToggleButton value="upload" data-testid="dataModeUpload">
                Open custom data
              </ToggleButton>
            </ToggleButtonGroup>
            &nbsp;
            {viewMode === 'sample' && (
              <>
                <DataSourceSelect
                  value={dataSourceValue}
                  groups={dataSourceGroups}
                  onChange={e => { handleDataSourceChange(e); }}
                />
                &nbsp;
              </>
            )}
            {viewMode === 'upload' && (
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <UploadPanel
                  onUploaded={tracks => { handleQuickUploaded(tracks); }}
                  handleFileUpload={async (fileType, file) =>
                    handleFileUpload(fileType, file)
                  }
                  isLocal={isLocal}
                />
              </div>
            )}
            {customFilesFlag && filenamesData?.bedFiles?.length ? (
              <Fragment>
                <Label
                  htmlFor="bedSelectInput"
                  className="customData tight-label mb-2 me-sm-2 mb-sm-0 ms-2"
                >
                  BED file (optional — list of bookmarked regions):
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
            ) : null}
            {!examplesFlag && (
              <RegionInput
                regionInfo={regionInfo}
                handleRegionChange={coords => { void handleRegionChange(coords); }}
                region={region}
              />
            )}
            {customFilesFlag && (
              <div className="d-flex justify-content-between align-items-start">
                <div>{DataPositionFormRowComponent}</div>
                <div className="d-flex justify-content-end align-items-start flex-shrink-0">
                  <SimplifyButton
                    simplify={simplify}
                    removeSequences={removeSequences}
                    setSimplify={(next) => { setSimplify(next); }}
                    setRemoveSequences={(next) => { setRemoveSequences(next); }}
                  />
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
                onLoadPath={region => { void changeRegionAndGo(region); }}
                onCopyToRegion={region => { setRegion(region); }}
              />
            </Col>
          </Row>
        )}
      </Container>
    </div>
  )
}

export default HeaderForm
