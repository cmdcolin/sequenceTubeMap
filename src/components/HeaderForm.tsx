import { Fragment, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { Button, Container, Row, Col, Label, Alert } from 'reactstrap'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type { APIInterface } from '../api/APIInterface.ts'
import { truncateMiddle } from '../util/text.ts'
import DataPositionFormRow from './DataPositionFormRow.tsx'
import ExampleSelectButtons from './ExampleSelectButtons.tsx'
import RegionInput from './RegionInput.tsx'
import PathsPanel from './PathsPanel.tsx'
import BedFileDropdown from './BedFileDropdown.tsx'
import SimplifyButton from './SimplifyButton.tsx'
import FormHelperText from '@mui/material/FormHelperText'
import { HeaderFormAppBar } from './HeaderFormAppBar.tsx'
import {
  isValidRegion,
  isLocalCompatibleDataSource,
  isEmpty,
} from '../common.ts'
import {
  dataTypes,
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
  VisOptions,
} from '../Types.ts'

export { determineRegionIndex, regionStringFromRegionIndex }

const DATA_SOURCES: ViewTarget[] = config.DATA_SOURCES
const MAX_UPLOAD_SIZE_DESCRIPTION = '5 MB'

interface HeaderFormProps {
  setColorSetting: (
    key: PaletteField,
    index: number,
    value: Palette,
  ) => void
  setDataOrigin: (origin: string) => void
  setCurrentViewTarget: (viewTarget: ViewTarget) => void
  currentViewTarget: ViewTarget
  defaultViewTarget?: ViewTarget
  APIInterface: APIInterface
  onAPIMode?: (mode: string) => void
  serverModeId?: 'server' | 'upstream'
  legendVisible?: boolean
  toggleLegend?: () => void
  visOptions?: VisOptions
  toggleVisOptionFlag?: (flag: string) => void
  handleMappingQualityCutoffChange?: (value: string | number) => void
  compressedViewLocked?: boolean
}

interface CoordsMetaData {
  tracks: Track[] | null
  chunk: string
}

function HeaderForm({
  setColorSetting,
  setDataOrigin,
  setCurrentViewTarget,
  currentViewTarget,
  defaultViewTarget,
  APIInterface,
  onAPIMode,
  serverModeId,
  legendVisible,
  toggleLegend,
  visOptions,
  toggleVisOptionFlag,
  handleMappingQualityCutoffChange,
  compressedViewLocked,
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
  // onSuccess callback below applies the first BED entry as the default region
  // once BED data arrives, then clears the flag.
  const [pendingRegionDefault, setPendingRegionDefault] = useState(false)
  const [manualError, setManualError] = useState<Error | string | null>(null)
  const [simplify, setSimplify] = useState(initialView.simplify ?? false)
  const [removeSequences, setRemoveSequences] = useState(
    initialView.removeSequences ?? false,
  )
  // Filenames of files uploaded via the "Open custom files" dialog. Shown as a
  // success banner so the user gets confirmation. Cleared when the user
  // navigates away or commits a view target.
  const [recentlyUploaded, setRecentlyUploaded] = useState<string[]>([])
  // Whether the paths panel is expanded. Auto-opens when the graph file
  // changes (see render-time adjustment below) so the user sees what paths
  // are available without having to expand it.
  const [pathsPanelOpen, setPathsPanelOpen] = useState(true)

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
  const apiMode = APIInterface.mode
  const visibleDataSources = apiMode === 'local'
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

  // Optional read-coverage stats: scan the first read track once and bucket
  // reads to paths so the PathsPanel can label heavy paths up front. Only
  // available when the API implements getReadCountsPerPath (LocalAPI does;
  // ServerAPI doesn't yet). Keyed by (graph, read) so it re-runs when either
  // changes, but stays cached across re-renders within the same dataset.
  const readTrackForCounts = tracks.find(t => t.trackType === 'read')
  const readCountsKey =
    graphKey !== null
    && readTrackForCounts?.trackFile
    && APIInterface.getReadCountsPerPath
      ? [graphKey, readTrackForCounts.trackFile] as const
      : null
  const { data: readCountsData } = useSWR(
    readCountsKey,
    async ([g, r]: readonly [string, string]) =>
      APIInterface.getReadCountsPerPath!(g, r, null),
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false },
  )
  const readCounts: Record<string, number> | undefined =
    readCountsData?.counts

  // Adjust state during render when the graph file changes — re-opens the
  // paths panel for the new graph. See:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastGraphKey, setLastGraphKey] = useState(graphKey)
  if (graphKey !== lastGraphKey) {
    setLastGraphKey(graphKey)
    setPathsPanelOpen(true)
  }

  // Server explicitly reported no mounted files (vs network/parse failure).
  // LocalAPI starts with no files until the user uploads, so we only surface
  // the generic fallback when a real server returned an empty list.
  const noFilesMessage =
    filenamesData && files.length === 0
      ? (filenamesData.error ?? (apiMode === 'local' ? null : 'Server did not return a list of mounted filenames.'))
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
      !viewTargetsEqual(currentViewTarget, next)
    ) {
      setCurrentViewTarget(next)
      setRecentlyUploaded([])
    }
  }

  function handleGoButton() {
    commitViewTarget(buildViewTarget())
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

  async function jumpRegion(offset: -1 | 1) {
    const current = determineRegionIndex(region, regionInfo) ?? 0
    await changeRegionAndGo(regionStringFromRegionIndex(current + offset, regionInfo))
  }

  // Shared reset for the two entry points into custom-files mode (the File
  // menu's Open… item, and an upload completing). Always clears the rendered
  // tube map so the previous dataset's graph doesn't linger while the user
  // picks new files. The success banner derives its filenames directly from
  // the tracks' `trackDisplayName` (set by UploadPanel).
  function enterCustomFilesMode(newTracks: Tracks) {
    setBedSelect('none')
    setBedFile('none')
    setRegion('')
    setName(undefined)
    setTracks(newTracks)
    setDataType(dataTypes.CUSTOM_FILES)
    setFileSizeAlert(false)
    setManualError(null)
    setRecentlyUploaded(
      newTracks.map(t => t.trackDisplayName ?? t.trackFile ?? '(unnamed)'),
    )
    setCurrentViewTarget({ tracks: [], region: '' })
  }

  function handleDataSourceChange(value: string) {
    setManualError(null)
    // Banner is upload-specific; clear it on any other navigation so a stale
    // "Loaded N files: …" message can't persist across dataset switches.
    setRecentlyUploaded([])

    if (value === dataTypes.CUSTOM_FILES) {
      enterCustomFilesMode([])
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
        // Auto-commit so the tube map clears and loads the new source immediately.
        // Skipped when skipAutoLoad is set (for data sources with large default
        // regions) or when there's no valid region yet (pendingRegionDefault path).
        if (!ds.skipAutoLoad && isValidRegion(ds.region) && ds.tracks.length > 0) {
          setCurrentViewTarget(makeViewTarget({
            tracks: ds.tracks,
            bedFile: ds.bedFile,
            name: ds.name,
            region: ds.region,
            dataType: dataTypes.BUILT_IN,
            simplify,
            removeSequences,
          }))
        }
      }
    }
  }

  function handleQuickUploaded(uploadedTracks: Track[]) {
    enterCustomFilesMode(uploadedTracks)
  }

  async function handleFileUpload(
    fileType: FileType,
    file: File,
  ): Promise<string | undefined> {
    if (
      apiMode !== 'local' &&
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

  const customFilesFlag = dataType === dataTypes.CUSTOM_FILES
  const examplesFlag = dataType === dataTypes.EXAMPLES
  const viewTargetHasChange = !viewTargetsEqual(
    buildViewTarget(),
    currentViewTarget,
  )
  const regionIndex = determineRegionIndex(region, regionInfo) ?? 0
  const dataPositionProps = {
    handleGoButton: () => { handleGoButton(); },
    uploadInProgress,
    currentViewTarget,
    viewTargetHasChange,
    canGo: isValidRegion(region) && tracks.length > 0,
  }

  const errorDiv = error ? (
    <div>
      <Container fluid={true}>
        <Row>
          <Alert color="danger">
            {error instanceof Error ? error.message : String(error)}
          </Alert>
        </Row>
      </Container>
    </div>
  ) : null

  return (
    <div>
      <HeaderFormAppBar
        visibleDataSources={visibleDataSources}
        discoveredDataSources={discoveredDataSources}
        dataType={dataType}
        name={name}
        onSelectDataSource={handleDataSourceChange}
        customFilesFlag={customFilesFlag}
        tracks={tracks}
        availableTracks={availableTracks}
        onTracksChange={handleInputChange}
        handleFileUpload={handleFileUpload}
        onUploaded={handleQuickUploaded}
        onOpenCustomFiles={() => { handleDataSourceChange(dataTypes.CUSTOM_FILES); }}
        apiMode={apiMode}
        serverModeId={serverModeId}
        onDestChange={onAPIMode}
        legendVisible={legendVisible}
        toggleLegend={toggleLegend}
        visOptions={visOptions}
        toggleVisOptionFlag={toggleVisOptionFlag}
        compressedViewLocked={compressedViewLocked}
        handleMappingQualityCutoffChange={handleMappingQualityCutoffChange}
      />
      <Container>
        <Row>
          <Col>{errorDiv}</Col>
        </Row>
        <Row className="align-items-start">
          <Col>
            {customFilesFlag && filenamesData?.bedFiles?.length ? (
              <Fragment>
                <Label
                  htmlFor="bedSelectInput"
                  className="customData tight-label mb-2 me-sm-2 mb-sm-0 ms-2"
                >
                  BED file:
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
                {isSet(bedFile) && (
                  <>
                    &nbsp;
                    <Button
                      color="primary"
                      size="sm"
                      disabled={regionIndex === 0}
                      onClick={() => { void jumpRegion(-1); }}
                    >
                      Prev
                    </Button>
                    &nbsp;
                    <Button
                      color="primary"
                      size="sm"
                      disabled={!regionInfo.chr || regionIndex >= regionInfo.chr.length - 1}
                      onClick={() => { void jumpRegion(1); }}
                    >
                      Next
                    </Button>
                  </>
                )}
                &nbsp;
              </Fragment>
            ) : null}
            {!examplesFlag && (
              <RegionInput
                regionInfo={regionInfo}
                handleRegionChange={coords => { void handleRegionChange(coords); }}
                region={region}
                onSubmit={() => { handleGoButton(); }}
              />
            )}
            {recentlyUploaded.length > 0 && (
              <Alert color="success" className="mt-2 mb-2 py-2">
                <strong>Loaded {recentlyUploaded.length} file{recentlyUploaded.length === 1 ? '' : 's'}:</strong>{' '}
                {recentlyUploaded.map(f => truncateMiddle(f, 40)).join(', ')}.{' '}
                {pathInfo.length > 0
                  ? 'Pick a path below or type a region to view it.'
                  : 'Type a region above to view it.'}
              </Alert>
            )}
            {pathInfo.length > 0 && !examplesFlag && (
              <PathsPanel
                pathInfo={pathInfo}
                readCounts={readCounts}
                isOpen={pathsPanelOpen}
                onToggle={() => { setPathsPanelOpen(o => !o); }}
                onLoadPath={region => { void changeRegionAndGo(region); }}
                onCopyToRegion={region => { setRegion(region); }}
              />
            )}
            {customFilesFlag && (
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <DataPositionFormRow {...dataPositionProps} />
                </div>
                <div className="d-flex justify-content-end align-items-start flex-shrink-0">
                  <SimplifyButton
                    simplify={simplify}
                    removeSequences={removeSequences}
                    setSimplify={(next) => { setSimplify(next); }}
                    setRemoveSequences={(next) => { setRemoveSequences(next); }}
                  />
                </div>
              </div>
            )}
            <Row>
              <Alert
                color="danger"
                isOpen={fileSizeAlert}
                toggle={() => { setFileSizeAlert(false); }}
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
                !customFilesFlag && (
                  <DataPositionFormRow {...dataPositionProps} />
                )
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
      </Container>
    </div>
  )
}

export default HeaderForm
