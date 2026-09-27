import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { IconOnlyButton } from './IconOnlyButton.tsx'
import {
  faAngleLeft,
  faAngleRight,
  faArrowLeft,
  faArrowRight,
  faCompress,
  faExpand,
} from './icons.ts'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type { APIInterface } from '../api/APIInterface.ts'
import { errorMessage, toError } from '../util/error.ts'
import { truncateMiddle } from '../util/text.ts'
import DataPositionFormRow from './DataPositionFormRow.tsx'
import ExampleSelectButtons from './ExampleSelectButtons.tsx'
import RegionInput from './RegionInput.tsx'
import PathsPanel from './PathsPanel.tsx'
import BedFileDropdown from './BedFileDropdown.tsx'
import SimplifyButton from './SimplifyButton.tsx'
import FormHelperText from '@mui/material/FormHelperText'
import { HeaderFormAppBar } from './HeaderFormAppBar.tsx'
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp.tsx'
import { useKeyboardShortcuts } from './useKeyboardShortcuts.ts'
import * as tubeMap from '../util/tubemap.ts'
import {
  convertRegionToRangeRegion,
  isValidRegion,
  isLocalCompatibleDataSource,
  isEmpty,
  parseRegion,
  stringifyRangeRegion,
  type RangeRegion,
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
  PathInfo,
  RegionInfo,
  Track,
  Tracks,
  ViewTarget,
} from '../Types.ts'

const DATA_SOURCES: ViewTarget[] = config.DATA_SOURCES

const MAX_UPLOAD_SIZE_DESCRIPTION = `${(
  config.MAXUPLOADSIZE /
  (1024 * 1024)
).toFixed(0)} MB`

interface HeaderFormProps {
  showExample: (origin: string) => void
  // The tracks a saved figure's color key describes, or undefined when the
  // legend is hidden.
  legendTracks: Tracks | undefined
  setCurrentViewTarget: (viewTarget: ViewTarget) => void
  // Also seeds the form's own tracks/region/name/bedFile state on mount.
  currentViewTarget: ViewTarget
  // A view that arrived from outside the form -- Back or Forward (the
  // browser's or the form's own), or a switch of backend. App has already
  // committed it; the form follows so its fields describe what is on screen.
  // A new object each time is the signal to re-seed, so re-seeding happens
  // once per change.
  seedViewTarget: ViewTarget | null
  // Walk the browser's history, or undefined when there is no view of the
  // app's to walk to.
  goBack: (() => void) | undefined
  goForward: (() => void) | undefined
  APIInterface: APIInterface
  onAPIMode: (mode: string) => void
  serverModeId: 'server' | 'upstream'
  // Whether the committed view is currently being fetched, so the Go button
  // can say so.
  loading: boolean
  // Escape, when the user isn't typing. App uses it to dismiss the legend.
  onEscape: () => void
  // The app's own View/Reads menus, rendered in the app bar.
  visMenus: ReactNode
}

// How far one "shift" moves the window, as a fraction of its width.
const SHIFT_FRACTION = 0.5

// How much one "widen"/"narrow" step scales the window.
const REGION_ZOOM_FACTOR = 2

// Factor the canvas zooms by for the +/- shortcuts, matching the zoom buttons.
const CANVAS_ZOOM_FACTOR = 2

interface CoordsMetaData {
  tracks: Track[] | null
  chunk: string
}

// A dataset with a BED file but no preset region gets its region from the
// first BED entry, which only arrives once the BED fetch resolves. Modelling
// "no region chosen yet" as undefined lets that default be derived during
// render instead of written back into state from a fetch callback.
function presetRegion(region: string) {
  return region === '' ? undefined : region
}

function HeaderForm({
  showExample,
  legendTracks,
  setCurrentViewTarget,
  currentViewTarget,
  seedViewTarget,
  goBack,
  goForward,
  APIInterface,
  onAPIMode,
  serverModeId,
  loading,
  onEscape,
  visMenus,
}: HeaderFormProps) {
  const [tracks, setTracks] = useState<Tracks>(currentViewTarget.tracks)
  const [bedFile, setBedFile] = useState(currentViewTarget.bedFile)
  const [chosenRegion, setChosenRegion] = useState(
    presetRegion(currentViewTarget.region),
  )
  const [name, setName] = useState(currentViewTarget.name)
  const [dataType, setDataType] = useState(
    currentViewTarget.dataType ?? dataTypes.BUILT_IN,
  )
  const [manualError, setManualError] = useState<Error | null>(null)
  const [simplify, setSimplify] = useState(currentViewTarget.simplify ?? false)
  const [removeSequences, setRemoveSequences] = useState(
    currentViewTarget.removeSequences ?? false,
  )
  // Filenames of files uploaded via the "Open custom files" dialog. Shown as a
  // success banner so the user gets confirmation. Cleared when the user
  // navigates away or commits a view target.
  const [recentlyUploaded, setRecentlyUploaded] = useState<string[]>([])
  // Whether the paths panel is expanded. Auto-opens when the graph file
  // changes (see render-time adjustment below) so the user sees what paths
  // are available without having to expand it.
  const [pathsPanelOpen, setPathsPanelOpen] = useState(true)
  // Focused by the "/" shortcut; a ref is how you hand focus to a DOM node.
  const regionInputRef = useRef<HTMLInputElement>(null)

  // Back or Forward moved the view. App has committed it already, so the form
  // only points its own fields at it -- committing from here would be a state
  // update in the middle of App's render. Adjusted during render rather than
  // in an effect; see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastSeed, setLastSeed] = useState(seedViewTarget)
  if (seedViewTarget !== lastSeed) {
    setLastSeed(seedViewTarget)
    if (seedViewTarget !== null) {
      seedFormFrom(seedViewTarget)
    }
  }

  // SWR-managed fetches. Each key encodes the state it depends on — including
  // the API mode, so switching backends refetches rather than reusing the
  // previous backend's answer — and changing that state supersedes any
  // in-flight result for the previous key.
  const apiMode = APIInterface.mode
  const {
    data: filenamesData,
    error: filenamesError,
    mutate: refetchFilenames,
  } = useSWR(['headerForm.filenames', apiMode] as const, () =>
    APIInterface.getFilenames(null),
  )

  const files = filenamesData?.files ?? []
  const mountedBeds = filenamesData?.bedFiles ?? []
  // Tracks edited from a dataset keep its BED, which may not be a mounted one.
  const availableBeds = [
    'none',
    ...mountedBeds,
    ...(isSet(bedFile) && !mountedBeds.includes(bedFile) ? [bedFile] : []),
  ]
  const availableTrackSet = makeAvailableTrackSet(files)
  const availableTracks = trackListWithImplied(files, availableTrackSet, tracks)
  // In local mode the in-browser gbz-base reader only understands .gbz.db files,
  // so .vg.xg-based built-ins would silently fail. Hide them from the dropdown.
  const visibleDataSources =
    apiMode === 'local'
      ? DATA_SOURCES.filter(isLocalCompatibleDataSource)
      : DATA_SOURCES
  const discoveredDataSources = discoverDataSources(
    files,
    mountedBeds,
    visibleDataSources,
    config.dataPath,
    filenamesData?.folderManifests,
  )
  const allDataSources = [...visibleDataSources, ...discoveredDataSources]

  const bedKey =
    dataType !== dataTypes.EXAMPLES && isSet(bedFile)
      ? (['headerForm.bedRegions', apiMode, bedFile] as const)
      : null
  const { data: bedRegionsData, error: bedRegionsError } = useSWR(
    bedKey,
    ([, , bed]: readonly [string, string, string]) =>
      APIInterface.getBedRegions(bed, null),
  )
  const regionInfo: RegionInfo = bedRegionsData?.bedRegions ?? {}
  const firstBedRegion = regionInfo.chr?.length
    ? regionStringFromRegionIndex(0, regionInfo)
    : undefined
  const region = chosenRegion ?? firstBedRegion ?? ''

  const graphTrack = firstGraphTrack(tracks)
  // Ask whenever we have a graph track that isn't a synthetic example.
  // `getPathInfo` returns [] (and won't surface an error) when the API
  // can't resolve the file, so we don't need a separate availability gate.
  const graphFile =
    dataType !== dataTypes.EXAMPLES ? graphTrack?.trackFile : undefined
  // The companion haplotype index goes with it: without it the paths panel
  // answers every length by walking the graph.
  const haplotypeIndexFile = graphTrack?.haplotypeIndexFile ?? ''
  const { data: pathInfoData, error: pathInfoError } = useSWR(
    graphFile === undefined
      ? null
      : ([
          'headerForm.pathInfo',
          apiMode,
          graphFile,
          haplotypeIndexFile,
        ] as const),
    ([, , graph, index]: readonly [string, string, string, string]) =>
      APIInterface.getPathInfo(graph, null, index === '' ? undefined : index),
  )
  const pathInfo: PathInfo[] = pathInfoData?.pathInfo ?? []

  // Optional read-coverage stats: scan the first read track once and bucket
  // reads to paths so the PathsPanel can label heavy paths up front. Only
  // available when the API implements getReadCountsPerPath (LocalAPI does;
  // ServerAPI doesn't yet). Keyed by (graph, read) so it re-runs when either
  // changes, but stays cached across re-renders within the same dataset.
  const readTrackForCounts = tracks.find(t => t.trackType === 'read')
  const readFile = readTrackForCounts?.trackFile
  const getReadCountsPerPath = APIInterface.getReadCountsPerPath
  const { data: readCountsData } = useSWR(
    graphFile !== undefined && readFile !== undefined && getReadCountsPerPath
      ? (['headerForm.readCounts', apiMode, graphFile, readFile] as const)
      : null,
    ([, , graph, read]: readonly [string, string, string, string]) =>
      getReadCountsPerPath!(graph, read, null),
  )
  const readCounts: Record<string, number> | undefined = readCountsData?.counts

  // Adjust state during render when the graph file changes — re-opens the
  // paths panel for the new graph. See:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastGraphFile, setLastGraphFile] = useState(graphFile)
  if (graphFile !== lastGraphFile) {
    setLastGraphFile(graphFile)
    setPathsPanelOpen(true)
  }

  // Server explicitly reported no mounted files (vs network/parse failure).
  // LocalAPI starts with no files until the user uploads, so we only surface
  // the generic fallback when a real server returned an empty list.
  const noFilesMessage =
    filenamesData && files.length === 0
      ? (filenamesData.error ??
        (apiMode === 'local'
          ? null
          : 'Server did not return a list of mounted filenames.'))
      : null

  // Fetches that fill in the form's own controls. Until each lands, the
  // control it feeds is simply empty, which reads as "there is nothing here"
  // rather than "not yet" -- so say which one is still coming.
  const pending: string[] = [
    filenamesData === undefined && filenamesError === undefined
      ? 'Loading available files…'
      : null,
    bedKey !== null &&
    bedRegionsData === undefined &&
    bedRegionsError === undefined
      ? `Loading regions from ${truncateMiddle(bedKey[2], 40)}…`
      : null,
    graphFile !== undefined &&
    pathInfoData === undefined &&
    pathInfoError === undefined
      ? `Loading paths in ${truncateMiddle(graphFile, 40)}…`
      : null,
  ].filter(message => message !== null)

  // Every distinct error that's currently live, so one failure can't hide
  // another while an outage that fails every fetch the same way shows once.
  const errorMessages = [
    ...new Set(
      [
        manualError,
        filenamesError,
        bedRegionsError,
        pathInfoError,
        noFilesMessage,
      ]
        .filter(e => e !== null && e !== undefined)
        .map(errorMessage),
    ),
  ]

  const desc = regionDescByCoords(region, regionInfo)

  // Subscribe to server-pushed filename changes; revalidate the SWR cache on
  // each notification.
  useEffect(() => {
    const controller = new AbortController()
    APIInterface.subscribeToFilenameChanges(() => {
      void refetchFilenames()
    }, controller.signal)
    return () => {
      controller.abort()
    }
  }, [APIInterface, refetchFilenames])

  // Per-invocation AbortController for getChunkTracks (event-driven, not
  // SWR-cached). A late answer would commit the view it was fetched for, so
  // anything that moves the form off that view aborts it: another region
  // change, a data source or an upload, and a view or backend arriving from
  // outside the form. Assigned only outside render.
  const chunkTracksAbortRef = useRef<AbortController | null>(null)

  function abortChunkTracks() {
    chunkTracksAbortRef.current?.abort()
  }

  useEffect(
    () => () => {
      chunkTracksAbortRef.current?.abort()
    },
    [seedViewTarget, APIInterface],
  )

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
    } else if (
      next.tracks.length > 0 &&
      !viewTargetsEqual(currentViewTarget, next)
    ) {
      setCurrentViewTarget(next)
      setRecentlyUploaded([])
    }
  }

  // Point the form's fields at a view, without committing it.
  function seedFormFrom(target: ViewTarget) {
    setTracks(target.tracks)
    setBedFile(target.bedFile)
    setChosenRegion(presetRegion(target.region))
    setName(target.name)
    setDataType(target.dataType ?? dataTypes.BUILT_IN)
    setSimplify(target.simplify ?? false)
    setRemoveSequences(target.removeSequences ?? false)
    setManualError(null)
    setRecentlyUploaded([])
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
    setChosenRegion(coords)
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
      abortChunkTracks()
      const controller = new AbortController()
      chunkTracksAbortRef.current = controller
      try {
        const json = await APIInterface.getChunkTracks(
          bedFile,
          chunk,
          controller.signal,
        )
        if (controller.signal.aborted) {
          return null
        }
        newTracks = json.tracks ?? null
      } catch (e) {
        if (controller.signal.aborted) {
          return null
        }
        console.error('API getChunkTracks failed:', e)
        setManualError(toError(e))
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

  // Tracks edited in Manage tracks are the user's own set rather than the named
  // dataset's, which is what custom-files mode (with its BED picker and
  // Simplify) is for. Everything else the form describes stays.
  function handleInputChange(newTracks: Tracks) {
    setTracks(newTracks)
    setName(undefined)
    setDataType(dataTypes.CUSTOM_FILES)
  }

  async function jumpRegion(offset: -1 | 1) {
    const target = (determineRegionIndex(region, regionInfo) ?? 0) + offset
    if (target >= 0 && target < (regionInfo.chr?.length ?? 0)) {
      await changeRegionAndGo(regionStringFromRegionIndex(target, regionInfo))
    }
  }

  // The region controls rewrite the window and load it immediately, the way
  // the BED prev/next buttons do.
  function transformRegion(transform: (range: RangeRegion) => RangeRegion) {
    try {
      const range = convertRegionToRangeRegion(parseRegion(region))
      void changeRegionAndGo(stringifyRangeRegion(transform(range)))
    } catch (e) {
      setManualError(toError(e))
    }
  }

  function shiftRegion(direction: -1 | 1) {
    transformRegion(({ contig, start, end }) => {
      const span = end - start
      const offset = Math.max(1, Math.round(span * SHIFT_FRACTION)) * direction
      const newStart = Math.max(0, start + offset)
      return { contig, start: newStart, end: newStart + span }
    })
  }

  function scaleRegion(factor: number) {
    transformRegion(({ contig, start, end }) => {
      const span = Math.max(1, Math.round((end - start) * factor))
      const center = (start + end) / 2
      const newStart = Math.max(0, Math.round(center - span / 2))
      return { contig, start: newStart, end: newStart + span }
    })
  }

  // Files from the Open dialog have loaded. They replace the view, so the
  // previous dataset's graph doesn't linger while the user picks a region in
  // them. The success banner takes its filenames from the tracks'
  // `trackDisplayName` (set by UploadPanel).
  function loadUploadedTracks(uploadedTracks: Tracks) {
    abortChunkTracks()
    setBedFile('none')
    setChosenRegion('')
    setName(undefined)
    setTracks(uploadedTracks)
    setDataType(dataTypes.CUSTOM_FILES)
    setManualError(null)
    setRecentlyUploaded(
      uploadedTracks.map(t => t.trackDisplayName ?? t.trackFile ?? '(unnamed)'),
    )
    setCurrentViewTarget({ tracks: [], region: '' })
  }

  function handleDataSourceChange(value: string) {
    abortChunkTracks()
    setManualError(null)
    // Banner is upload-specific; clear it on any other navigation so a stale
    // "Loaded N files: …" message can't persist across dataset switches.
    setRecentlyUploaded([])

    if (value === dataTypes.EXAMPLES) {
      setDataType(dataTypes.EXAMPLES)
    } else {
      const ds = allDataSources.find(d => d.name === value)
      if (ds) {
        seedFormFrom({ ...ds, dataType: dataTypes.BUILT_IN })
        // Auto-commit so the tube map clears and loads the new source immediately.
        // Skipped when skipAutoLoad is set (for data sources with large default
        // regions) or when the region still has to come from the BED file.
        if (
          !ds.skipAutoLoad &&
          isValidRegion(ds.region) &&
          ds.tracks.length > 0
        ) {
          setCurrentViewTarget(
            makeViewTarget({
              tracks: ds.tracks,
              bedFile: ds.bedFile,
              name: ds.name,
              region: ds.region,
              dataType: dataTypes.BUILT_IN,
              simplify: ds.simplify ?? false,
              removeSequences: ds.removeSequences ?? false,
            }),
          )
        }
      }
    }
  }

  async function handleFileUpload(
    fileType: FileType,
    file: File,
  ): Promise<string | undefined> {
    if (apiMode !== 'local' && file.size > config.MAXUPLOADSIZE) {
      throw new Error(
        `${file.name} is larger than the ${MAX_UPLOAD_SIZE_DESCRIPTION} upload limit.`,
      )
    }
    const fileName = await APIInterface.putFile(fileType, file, null)
    if (fileType === 'graph') {
      void refetchFilenames()
    }
    return fileName
  }

  const customFilesFlag = dataType === dataTypes.CUSTOM_FILES
  const examplesFlag = dataType === dataTypes.EXAMPLES
  const regionIndex = determineRegionIndex(region, regionInfo) ?? 0
  const bedRegionCount = regionInfo.chr?.length ?? 0
  const regionUsable = isValidRegion(region)
  const hasBedRegions = bedRegionCount > 0
  const canShiftRegion = regionUsable && !examplesFlag

  useKeyboardShortcuts({
    '+': () => {
      tubeMap.zoomBy(CANVAS_ZOOM_FACTOR)
    },
    '=': () => {
      tubeMap.zoomBy(CANVAS_ZOOM_FACTOR)
    },
    '-': () => {
      tubeMap.zoomBy(1 / CANVAS_ZOOM_FACTOR)
    },
    '[': hasBedRegions
      ? () => {
          void jumpRegion(-1)
        }
      : undefined,
    ']': hasBedRegions
      ? () => {
          void jumpRegion(1)
        }
      : undefined,
    'Shift+ArrowLeft': canShiftRegion
      ? () => {
          shiftRegion(-1)
        }
      : undefined,
    'Shift+ArrowRight': canShiftRegion
      ? () => {
          shiftRegion(1)
        }
      : undefined,
    '/': () => {
      regionInputRef.current?.focus()
    },
    Escape: () => {
      onEscape()
    },
  })

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
        onUploaded={uploadedTracks => {
          loadUploadedTracks(uploadedTracks)
        }}
        apiMode={apiMode}
        serverModeId={serverModeId}
        onDestChange={onAPIMode}
        visMenus={visMenus}
      />
      <Box sx={{ px: 2 }}>
        {errorMessages.map(message => (
          <Alert severity="error" key={message} sx={{ mb: 1 }}>
            {message}
          </Alert>
        ))}
        {pending.length > 0 && (
          <Box role="status">
            {pending.map(message => (
              <Box
                key={message}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">
                  {message}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {customFilesFlag && filenamesData?.bedFiles?.length ? (
            <>
              <Typography
                component="label"
                htmlFor="bedSelectInput"
                variant="body2"
                sx={{ alignSelf: 'center' }}
              >
                BED file:
              </Typography>
              <BedFileDropdown
                id="bedSelect"
                inputId="bedSelectInput"
                value={isSet(bedFile) ? bedFile : 'none'}
                onChange={value => {
                  setBedFile(value)
                }}
                options={availableBeds}
              />
            </>
          ) : null}
          {!examplesFlag && (
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                alignSelf: 'center',
                flexWrap: 'wrap',
              }}
            >
              <IconOnlyButton
                testid="regionHistoryBack"
                label="Back to the previous view"
                icon={faArrowLeft}
                disabled={!goBack}
                onClick={() => {
                  goBack?.()
                }}
              />
              <IconOnlyButton
                testid="regionHistoryForward"
                label="Forward to the next view"
                icon={faArrowRight}
                disabled={!goForward}
                onClick={() => {
                  goForward?.()
                }}
              />
              {hasBedRegions && (
                <>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={regionIndex === 0}
                    onClick={() => {
                      void jumpRegion(-1)
                    }}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={regionIndex >= bedRegionCount - 1}
                    onClick={() => {
                      void jumpRegion(1)
                    }}
                  >
                    Next
                  </Button>
                </>
              )}
              <IconOnlyButton
                testid="shiftRegionLeft"
                label="Shift region left by half a window"
                icon={faAngleLeft}
                disabled={!regionUsable}
                onClick={() => {
                  shiftRegion(-1)
                }}
              />
              <IconOnlyButton
                testid="widenRegion"
                label={`Widen region ${REGION_ZOOM_FACTOR}x`}
                icon={faExpand}
                disabled={!regionUsable}
                onClick={() => {
                  scaleRegion(REGION_ZOOM_FACTOR)
                }}
              />
              <IconOnlyButton
                testid="narrowRegion"
                label={`Narrow region ${REGION_ZOOM_FACTOR}x`}
                icon={faCompress}
                disabled={!regionUsable}
                onClick={() => {
                  scaleRegion(1 / REGION_ZOOM_FACTOR)
                }}
              />
              <IconOnlyButton
                testid="shiftRegionRight"
                label="Shift region right by half a window"
                icon={faAngleRight}
                disabled={!regionUsable}
                onClick={() => {
                  shiftRegion(1)
                }}
              />
            </Box>
          )}
          {!examplesFlag && (
            <Box sx={{ flexGrow: 1, minWidth: 260 }}>
              <RegionInput
                regionInfo={regionInfo}
                inputRef={regionInputRef}
                handleRegionChange={coords => {
                  void handleRegionChange(coords)
                }}
                region={region}
                onSubmit={() => {
                  handleGoButton()
                }}
              />
            </Box>
          )}
          {!examplesFlag && (
            <Box sx={{ alignSelf: 'center' }}>
              <KeyboardShortcutsHelp />
            </Box>
          )}
        </Box>
        {recentlyUploaded.length > 0 && (
          <Alert severity="success" sx={{ mt: 1, mb: 1 }}>
            <strong>
              Loaded {recentlyUploaded.length} file
              {recentlyUploaded.length === 1 ? '' : 's'}:
            </strong>{' '}
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
            onToggle={() => {
              setPathsPanelOpen(o => !o)
            }}
            onLoadPath={region => {
              void changeRegionAndGo(region)
            }}
            onCopyToRegion={region => {
              setChosenRegion(region)
            }}
          />
        )}
        {examplesFlag ? (
          <ExampleSelectButtons showExample={showExample} />
        ) : (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 1,
              mt: 1,
            }}
          >
            <DataPositionFormRow
              handleGoButton={() => {
                handleGoButton()
              }}
              currentViewTarget={currentViewTarget}
              viewTargetHasChange={
                !viewTargetsEqual(buildViewTarget(), currentViewTarget)
              }
              canGo={regionUsable && tracks.length > 0}
              loading={loading}
              legendTracks={legendTracks}
            />
            {customFilesFlag && (
              <Box sx={{ flexShrink: 0 }}>
                <SimplifyButton
                  simplify={simplify}
                  removeSequences={removeSequences}
                  setSimplify={next => {
                    setSimplify(next)
                  }}
                  setRemoveSequences={next => {
                    setRemoveSequences(next)
                  }}
                  simplifyAvailable={apiMode !== 'local'}
                />
              </Box>
            )}
          </Box>
        )}
        {desc ? (
          <Box sx={{ mt: 1 }}>
            <FormHelperText> {'Region Description: '} </FormHelperText>
            <FormHelperText style={{ fontWeight: 'bold' }}>
              {desc}
            </FormHelperText>
          </Box>
        ) : null}
      </Box>
    </div>
  )
}

export default HeaderForm
