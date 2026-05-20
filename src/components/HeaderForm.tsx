import { Fragment, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { Button, Container, Row, Col, Label, Alert } from 'reactstrap'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type { APIInterface } from '../api/APIInterface.ts'
import DataPositionFormRow from './DataPositionFormRow.tsx'
import HelpButton from './HelpButton.tsx'
import ExampleSelectButtons from './ExampleSelectButtons.tsx'
import RegionInput from './RegionInput.tsx'
import PathsPanel from './PathsPanel.tsx'
import TrackPicker from './TrackPicker.tsx'
import BedFileDropdown from './BedFileDropdown.tsx'
import UploadPanel from './UploadPanel.tsx'
import SimplifyButton from './SimplifyButton.tsx'
import FormHelperText from '@mui/material/FormHelperText'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Checkbox from '@mui/material/Checkbox'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import MuiButton from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {
  isValidRegion,
  isLocalCompatibleDataSource,
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
  VisOptions,
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
  legendVisible?: boolean
  toggleLegend?: () => void
  visOptions?: VisOptions
  toggleVisOptionFlag?: (flag: string) => void
  handleMappingQualityCutoffChange?: (value: string | number) => void
  enableCompressedNodes?: boolean
}

interface CoordsMetaData {
  tracks: Track[] | null
  chunk: string
}

function CheckboxMenuItem({
  label,
  checked,
  onToggle,
  disabled,
  testid,
}: {
  label: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  testid?: string
}) {
  return (
    <MenuItem
      dense
      data-testid={testid}
      disabled={disabled}
      onClick={() => { onToggle() }}
    >
      <ListItemIcon>
        <Checkbox
          edge="start"
          size="small"
          checked={checked}
          disabled={disabled}
          tabIndex={-1}
          disableRipple
        />
      </ListItemIcon>
      <ListItemText primary={label} />
    </MenuItem>
  )
}

function HeaderForm({
  setColorSetting,
  setDataOrigin,
  setCurrentViewTarget,
  getCurrentViewTarget,
  defaultViewTarget,
  APIInterface,
  legendVisible,
  toggleLegend,
  visOptions,
  toggleVisOptionFlag,
  handleMappingQualityCutoffChange,
  enableCompressedNodes,
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
  const [menuAnchor, setMenuAnchor] = useState<{ type: 'examples' | 'file' | 'view' | 'reads'; el: HTMLElement } | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
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
  const isLocal = APIInterface.mode === 'local'
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
    filenamesData && files.length === 0
      ? (filenamesData.error ?? (isLocal ? null : 'Server did not return a list of mounted filenames.'))
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
      !viewTargetsEqual(getCurrentViewTarget(), next)
    ) {
      setCurrentViewTarget(next)
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

  function handleDataSourceChange(value: string) {
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
      APIInterface.mode !== 'local' &&
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

  const customFilesFlag = dataType === dataTypes.CUSTOM_FILES
  const examplesFlag = dataType === dataTypes.EXAMPLES
  const viewTargetHasChange = !viewTargetsEqual(
    buildViewTarget(),
    getCurrentViewTarget(),
  )
  const regionIndex = determineRegionIndex(region, regionInfo) ?? 0

  const DataPositionFormRowComponent = (
    <DataPositionFormRow
      handleGoButton={() => { handleGoButton(); }}
      uploadInProgress={uploadInProgress}
      getCurrentViewTarget={getCurrentViewTarget}
      viewTargetHasChange={viewTargetHasChange}
      canGo={isValidRegion(region) && tracks.length > 0}
    />
  )

  return (
    <div>
      <AppBar
        position="static"
        color="primary"
        elevation={2}
        sx={{ background: '#1a5276', mb: 1 }}
      >
        <Toolbar variant="dense">
          <img src="./logo.svg" alt="IVG" style={{ height: 32, marginRight: 8 }} />
          <MuiButton
            color="inherit"
            data-testid="examplesMenuButton"
            onClick={(e) => { setMenuAnchor({ type: 'examples', el: e.currentTarget }); }}
          >
            Examples
          </MuiButton>
          <Menu
            anchorEl={menuAnchor?.type === 'examples' ? menuAnchor.el : null}
            open={menuAnchor?.type === 'examples'}
            onClose={() => { setMenuAnchor(null); }}
          >
            {visibleDataSources.map(ds => (
              <MenuItem
                key={ds.name}
                selected={dataType === dataTypes.BUILT_IN && name === ds.name}
                onClick={() => { handleDataSourceChange(ds.name!); setMenuAnchor(null); }}
              >
                {ds.name}
              </MenuItem>
            ))}
            {discoveredDataSources.length > 0 && (
              <>
                <ListSubheader>Discovered</ListSubheader>
                {discoveredDataSources.map(ds => (
                  <MenuItem
                    key={ds.name}
                    selected={dataType === dataTypes.BUILT_IN && name === ds.name}
                    onClick={() => { handleDataSourceChange(ds.name!); setMenuAnchor(null); }}
                  >
                    {ds.name}
                  </MenuItem>
                ))}
              </>
            )}
            <Divider />
            <MenuItem
              selected={examplesFlag}
              onClick={() => { handleDataSourceChange(dataTypes.EXAMPLES); setMenuAnchor(null); }}
            >
              Synthetic examples
            </MenuItem>
          </Menu>
          <MuiButton
            color="inherit"
            data-testid="fileMenuButton"
            onClick={(e) => { setMenuAnchor({ type: 'file', el: e.currentTarget }); }}
          >
            File
          </MuiButton>
          <Menu
            anchorEl={menuAnchor?.type === 'file' ? menuAnchor.el : null}
            open={menuAnchor?.type === 'file'}
            onClose={() => { setMenuAnchor(null); }}
          >
            <MenuItem
              data-testid="openCustomFiles"
              selected={customFilesFlag}
              onClick={() => {
                if (!customFilesFlag) {
                  handleDataSourceChange(dataTypes.CUSTOM_FILES)
                }
                setUploadDialogOpen(true)
                setMenuAnchor(null)
              }}
            >
              Open…
            </MenuItem>
          </Menu>
          {toggleLegend && visOptions && toggleVisOptionFlag && (
            <>
              <MuiButton
                color="inherit"
                data-testid="viewMenuButton"
                onClick={(e) => { setMenuAnchor({ type: 'view', el: e.currentTarget }); }}
              >
                View
              </MuiButton>
              <Menu
                anchorEl={menuAnchor?.type === 'view' ? menuAnchor.el : null}
                open={menuAnchor?.type === 'view'}
                onClose={() => { setMenuAnchor(null); }}
                slotProps={{ list: { dense: true } }}
              >
                <CheckboxMenuItem
                  label="Show legend"
                  checked={!!legendVisible}
                  onToggle={() => { toggleLegend() }}
                  testid="legendToggleMenuItem"
                />
                <CheckboxMenuItem
                  label="Remove redundant nodes"
                  checked={visOptions.removeRedundantNodes}
                  onToggle={() => { toggleVisOptionFlag('removeRedundantNodes') }}
                />
                <CheckboxMenuItem
                  label="Compressed view"
                  checked={visOptions.compressedView}
                  disabled={enableCompressedNodes}
                  onToggle={() => { toggleVisOptionFlag('compressedView') }}
                />
                <CheckboxMenuItem
                  label="Fully transparent nodes"
                  checked={visOptions.transparentNodes}
                  onToggle={() => { toggleVisOptionFlag('transparentNodes') }}
                />
                <CheckboxMenuItem
                  label="Show node labels"
                  checked={visOptions.showNodeLabels}
                  onToggle={() => { toggleVisOptionFlag('showNodeLabels') }}
                />
              </Menu>
              <MuiButton
                color="inherit"
                data-testid="readsMenuButton"
                onClick={(e) => { setMenuAnchor({ type: 'reads', el: e.currentTarget }); }}
              >
                Reads
              </MuiButton>
              <Menu
                anchorEl={menuAnchor?.type === 'reads' ? menuAnchor.el : null}
                open={menuAnchor?.type === 'reads'}
                onClose={() => { setMenuAnchor(null); }}
                slotProps={{ list: { dense: true } }}
              >
                <CheckboxMenuItem
                  label="Show sequence reads"
                  checked={visOptions.showReads}
                  onToggle={() => { toggleVisOptionFlag('showReads') }}
                />
                <CheckboxMenuItem
                  label="Show soft clips"
                  checked={visOptions.showSoftClips}
                  disabled={!visOptions.showReads}
                  onToggle={() => { toggleVisOptionFlag('showSoftClips') }}
                />
                <CheckboxMenuItem
                  label="Color by mapping quality"
                  checked={visOptions.colorReadsByMappingQuality}
                  disabled={!visOptions.showReads}
                  onToggle={() => { toggleVisOptionFlag('colorReadsByMappingQuality') }}
                />
                <CheckboxMenuItem
                  label="Transparency by mapping quality"
                  checked={visOptions.alphaReadsByMappingQuality}
                  disabled={!visOptions.showReads}
                  onToggle={() => { toggleVisOptionFlag('alphaReadsByMappingQuality') }}
                />
                {handleMappingQualityCutoffChange && (
                  <Box
                    sx={{ px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}
                    onClick={(e) => { e.stopPropagation() }}
                  >
                    <Typography variant="body2">Mapping quality cutoff:</Typography>
                    <select
                      disabled={!visOptions.showReads}
                      value={visOptions.mappingQualityCutoff}
                      onChange={(e) => { handleMappingQualityCutoffChange(e.target.value) }}
                    >
                      {Array.from({ length: 61 }, (_, i) => (
                        <option value={i} key={i}>{i}</option>
                      ))}
                    </select>
                  </Box>
                )}
              </Menu>
            </>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Typography
            variant="body2"
            component="a"
            href="https://github.com/cmdcolin/sequenceTubeMap"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              textDecoration: 'none',
              mr: 2,
              fontWeight: 900,
              background:
                'linear-gradient(90deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #c77dff, #ff6b6b)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              display: 'inline-block',
            }}
          >
            ✨ MemPanG26 edition! ✨
          </Typography>
          <HelpButton file="./help/help.md" />
        </Toolbar>
      </AppBar>
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
              />
            )}
            {pathInfo.length > 0 && !examplesFlag && (
              <PathsPanel
                pathInfo={pathInfo}
                onLoadPath={region => { void changeRegionAndGo(region); }}
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
      </Container>
      <Dialog
        open={uploadDialogOpen}
        onClose={() => { setUploadDialogOpen(false); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Open custom files</DialogTitle>
        <DialogContent>
          <UploadPanel
            onUploaded={uploadedTracks => {
              handleQuickUploaded(uploadedTracks)
              setUploadDialogOpen(false)
            }}
            handleFileUpload={async (fileType, file) =>
              handleFileUpload(fileType, file)
            }
            isLocal={isLocal}
          />
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => { setUploadDialogOpen(false); }}>Close</MuiButton>
        </DialogActions>
      </Dialog>
    </div>
  )
}

export default HeaderForm
