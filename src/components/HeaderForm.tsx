import { Fragment, useState, useEffect, useRef } from 'react'
import type { ChangeEvent, SyntheticEvent } from 'react'
import { Container, Row, Col, Label, Alert, Button } from 'reactstrap'
import { dataOriginTypes } from '../enums'
import '../config-client.js'
import { config } from '../config-global.mjs'
import { LocalAPI } from '../api/LocalAPI.mjs'
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
import {
  parseRegion,
  stringifyRegion,
  isEmpty,
  isValidURL,
  readsExist,
} from '../common.mjs'
import type {
  AvailableTrack,
  ColorPaletteName,
  FileType,
  PathInfo,
  Palette,
  RegionInfo,
  Track,
  Tracks,
  ViewTarget,
} from '../Types'

const DATA_SOURCES: ViewTarget[] = config.DATA_SOURCES
const MAX_UPLOAD_SIZE_DESCRIPTION = '5 MB'
const dataTypes = {
  BUILT_IN: 'built-in',
  CUSTOM_FILES: 'mounted files',
  EXAMPLES: 'examples',
}
const fileTypes = {
  GRAPH: 'graph' as const,
  HAPLOTYPE: 'haplotype' as const,
  NODE: 'node' as const,
  READ: 'read' as const,
  BED: 'bed' as const,
}

interface BedRegionsResponse {
  bedRegions?: RegionInfo
}

interface FilenamesResponse {
  files?: AvailableTrack[]
  bedFiles?: string[]
  error?: string
}

interface APILike {
  getBedRegions(
    bedFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<BedRegionsResponse>
  getPathInfo(
    graphFile: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ pathInfo: PathInfo[] }>
  getFilenames(cancelSignal: AbortSignal | null): Promise<FilenamesResponse>
  subscribeToFilenameChanges(
    handler: () => void,
    cancelSignal: AbortSignal,
  ): unknown
  putFile(
    fileType: FileType,
    file: File,
    cancelSignal: AbortSignal | null,
  ): Promise<string>
  getChunkTracks(
    bedFile: string,
    chunk: string,
    cancelSignal: AbortSignal | null,
  ): Promise<{ tracks?: Track[] }>
}

interface ClearState {
  bedSelect: string
  desc: string
  regionInfo: RegionInfo
  pathInfo: PathInfo[]
  tracks: Tracks
  bedFile: string | undefined
  region: string
  name: string | undefined
  dataType: string
  fileSizeAlert: boolean
  uploadInProgress: boolean
  error: Error | string | null
}

const CLEAR_STATE: ClearState = {
  bedSelect: 'none',
  desc: '',
  regionInfo: {},
  pathInfo: [],
  tracks: {},
  bedFile: undefined,
  region: '',
  name: undefined,
  dataType: dataTypes.BUILT_IN,
  fileSizeAlert: false,
  uploadInProgress: false,
  error: null,
}

const EMPTY_STATE = {
  ...CLEAR_STATE,
  availableTracks: [] as AvailableTrack[],
  availableBeds: [] as string[],
}

// Return true if file is set to a string file name or URL, and false if it is
// falsey or the "none" sentinel.
function isSet(file: string | undefined | null): file is string {
  return !!file && file !== 'none'
}

// Checks if two track objects in the current track set are equal
function tracksEqual(curr: Track | undefined, next: Track | undefined) {
  if ((curr === undefined) !== (next === undefined)) {
    return false
  }
  if (!curr || !next) {
    return true
  }

  const curr_file = curr.trackFile
  const next_file = next.trackFile

  const curr_settings = curr.trackColorSettings
  const next_settings = next.trackColorSettings

  if (curr_settings && next_settings) {
    if (
      curr_settings.mainPalette !== next_settings.mainPalette ||
      curr_settings.auxPalette !== next_settings.auxPalette ||
      curr_settings.colorReadsByMappingQuality !==
        next_settings.colorReadsByMappingQuality ||
      curr_settings.alphaReadsByMappingQuality !==
        next_settings.alphaReadsByMappingQuality
    ) {
      return false
    }
  }
  if ((!curr_file && !next_file) || curr_file === next_file) {
    return true
  }
  return false
}

// Checks if two view targets are the same. They are the same if they have the
// same tracks and the same region.
function viewTargetsEqual(
  currViewTarget: ViewTarget | undefined,
  nextViewTarget: ViewTarget | undefined,
) {
  if ((currViewTarget === undefined) !== (nextViewTarget === undefined)) {
    return false
  }
  if (!currViewTarget || !nextViewTarget) {
    return true
  }

  if (
    Object.keys(currViewTarget.tracks).length !==
    Object.keys(nextViewTarget.tracks).length
  ) {
    return false
  }

  for (const key in currViewTarget.tracks) {
    const currTrack = currViewTarget.tracks[key]
    const nextTrack = nextViewTarget.tracks[key]

    if (!currTrack || !nextTrack) {
      return false
    }

    if (!tracksEqual(currTrack, nextTrack)) {
      return false
    }
  }

  if (currViewTarget.bedFile !== nextViewTarget.bedFile) {
    return false
  }

  if (currViewTarget.region !== nextViewTarget.region) {
    return false
  }

  if (currViewTarget.simplify !== nextViewTarget.simplify) {
    return false
  }

  if (currViewTarget.removeSequences !== nextViewTarget.removeSequences) {
    return false
  }

  return true
}

/* determine the current region: accepts a region string and returns the region index */
export const determineRegionIndex = (
  regionString: string,
  regionInfo: RegionInfo,
): number | null => {
  let parsedRegion
  try {
    parsedRegion = parseRegion(regionString)
  } catch {
    return null
  }
  const chr = regionInfo.chr
  if (!chr) {
    return null
  }
  for (let i = 0; i < chr.length; i++) {
    if (
      parseInt(regionInfo.start![i]) === parsedRegion.start &&
      parseInt(regionInfo.end![i]) === parsedRegion.end &&
      chr[i] === parsedRegion.contig
    ) {
      return i
    }
  }
  return null
}

/* Reconstructs a region string from an index into regionInfo. */
export const regionStringFromRegionIndex = (
  regionIndex: number,
  regionInfo: RegionInfo,
): string => {
  const regionStart = regionInfo.start![regionIndex]
  const regionEnd = regionInfo.end![regionIndex]
  const regionContig = regionInfo.chr![regionIndex]
  return regionContig + ':' + regionStart + '-' + regionEnd
}

// Stringly-typed key for tracks (no tuple in JS).
function makeKey(track: Track | AvailableTrack) {
  return JSON.stringify([track.trackType, track.trackFile])
}

function makeAvailableTrackSet(availableTracks: AvailableTrack[]) {
  const available = new Set<string>()
  for (const track of availableTracks) {
    if (!track.trackIsImplied) {
      available.add(makeKey(track))
    }
  }
  return available
}

function trackIsImplied(
  track: Track | AvailableTrack,
  availableTrackSet: Set<string>,
) {
  return !availableTrackSet.has(makeKey(track))
}

function trackListWithImplied(
  availableTracks: AvailableTrack[],
  availableTrackSet: Set<string>,
  currentTracks: Tracks,
): AvailableTrack[] {
  const newAvailableTracks: AvailableTrack[] = []
  for (const track of availableTracks) {
    if (!track.trackIsImplied) {
      newAvailableTracks.push(track)
    }
  }

  const unavailable: Track[] = []
  for (const key in currentTracks) {
    const track = currentTracks[key]
    if (trackIsImplied(track, availableTrackSet)) {
      unavailable.push(track)
    }
  }

  if (unavailable.length === 0) {
    return newAvailableTracks
  }

  for (const track of unavailable) {
    newAvailableTracks.push({
      trackType: track.trackType,
      trackFile: track.trackFile,
      trackIsImplied: true,
    })
  }

  return newAvailableTracks
}

function firstGraphTrack(tracks: Tracks): Track | null {
  for (const key in tracks) {
    const track = tracks[key]
    if (track.trackType === fileTypes.GRAPH) {
      return track
    }
  }
  return null
}

interface HeaderFormProps {
  dataOrigin: string
  setColorSetting: (key: string, indexOrValue: number | Palette, value?: Palette) => void
  setDataOrigin: (origin: string) => void
  setCurrentViewTarget: (viewTarget: ViewTarget) => void
  getCurrentViewTarget: () => ViewTarget | Record<string, unknown>
  defaultViewTarget?: ViewTarget
  APIInterface: APILike
}

interface CoordsMetaData {
  tracks: Track[] | null
  chunk: string
}

function HeaderForm({
  dataOrigin,
  setColorSetting,
  setDataOrigin,
  setCurrentViewTarget,
  getCurrentViewTarget,
  defaultViewTarget,
  APIInterface,
}: HeaderFormProps) {
  const [bedSelect, setBedSelect] = useState(EMPTY_STATE.bedSelect)
  const [desc, setDesc] = useState<string | null | undefined>(EMPTY_STATE.desc)
  const [regionInfo, setRegionInfo] = useState<RegionInfo>(
    EMPTY_STATE.regionInfo,
  )
  const [pathInfo, setPathInfo] = useState<PathInfo[]>(EMPTY_STATE.pathInfo)
  const [tracks, setTracks] = useState<Tracks>(EMPTY_STATE.tracks)
  const [bedFile, setBedFile] = useState<string | undefined>(
    EMPTY_STATE.bedFile,
  )
  const [region, setRegion] = useState(EMPTY_STATE.region)
  const [name, setName] = useState<string | undefined>(EMPTY_STATE.name)
  const [dataType, setDataType] = useState(EMPTY_STATE.dataType)
  const [fileSizeAlert, setFileSizeAlert] = useState(EMPTY_STATE.fileSizeAlert)
  const [uploadInProgress, setUploadInProgress] = useState(
    EMPTY_STATE.uploadInProgress,
  )
  const [error, setError] = useState<Error | string | null>(EMPTY_STATE.error)
  const [availableTracks, setAvailableTracks] = useState<AvailableTrack[]>(
    EMPTY_STATE.availableTracks,
  )
  const [availableBeds, setAvailableBeds] = useState<string[]>(
    EMPTY_STATE.availableBeds,
  )
  const [simplify, setSimplify] = useState<boolean | undefined>(undefined)
  const [removeSequences, setRemoveSequences] = useState<boolean | undefined>(
    undefined,
  )
  const [popupOpen, setPopupOpen] = useState(false)

  // Ref for the AbortController — legitimate useRef: imperative handle that
  // must persist across renders without triggering re-renders.
  const cancelSignalRef = useRef<AbortSignal | null>(null)

  // Expose current state values to async callbacks without stale closures.
  // These refs are updated every render so async functions can read latest values.
  interface StateSnapshot {
    bedSelect: string
    desc: string | null | undefined
    regionInfo: RegionInfo
    pathInfo: PathInfo[]
    tracks: Tracks
    bedFile: string | undefined
    region: string
    name: string | undefined
    dataType: string
    fileSizeAlert: boolean
    uploadInProgress: boolean
    error: Error | string | null
    availableTracks: AvailableTrack[]
    availableBeds: string[]
    simplify: boolean | undefined
    removeSequences: boolean | undefined
    popupOpen: boolean
  }
  const stateRef = useRef<StateSnapshot>({
    bedSelect,
    desc,
    regionInfo,
    pathInfo,
    tracks,
    bedFile,
    region,
    name,
    dataType,
    fileSizeAlert,
    uploadInProgress,
    error,
    availableTracks,
    availableBeds,
    simplify,
    removeSequences,
    popupOpen,
  })
  stateRef.current = {
    bedSelect,
    desc,
    regionInfo,
    pathInfo,
    tracks,
    bedFile,
    region,
    name,
    dataType,
    fileSizeAlert,
    uploadInProgress,
    error,
    availableTracks,
    availableBeds,
    simplify,
    removeSequences,
    popupOpen,
  }

  function handleFetchError(err: Error, message: string) {
    if (!cancelSignalRef.current?.aborted) {
      console.log(message, err.name, err.message)
      setError(err)
    } else {
      console.log('fetch canceled by unmount', err.name, err.message)
    }
  }

  function getRegionDescByCoords(coords: string, rInfo?: RegionInfo) {
    const ri = rInfo ?? stateRef.current.regionInfo
    const chr = ri.chr
    if (!chr) return null
    for (let i = 0; i < chr.length; i++) {
      if (coords === regionStringFromRegionIndex(i, ri)) {
        return ri.desc?.[i] ?? null
      }
    }
    return null
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
      const currentBedFile = stateRef.current.bedFile
      if (currentBedFile === bedFileArg) {
        console.log('Apply retrieved BED regions')
        const newRegionInfo = json.bedRegions ?? {}
        setRegionInfo(newRegionInfo)
        setDesc(getRegionDescByCoords(stateRef.current.region, newRegionInfo))
      } else {
        console.log(
          'Discard stale BED regions for ' +
            bedFileArg +
            ' because we are now looking at ' +
            currentBedFile,
        )
      }
    } catch (err) {
      handleFetchError(err as Error, `API getBedRegions failed:`)
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
      if (laterGraphTrack && laterGraphTrack.trackFile === graphFile) {
        setPathInfo(json.pathInfo)
      }
    } catch (err) {
      handleFetchError(err as Error, 'API getPathInfo failed:')
    }
  }

  async function getMountedFilenames() {
    setError(null)
    try {
      const json = await APIInterface.getFilenames(cancelSignalRef.current)
      if (!json.files || json.files.length === 0) {
        const err =
          json.error || 'Server did not return a list of mounted filenames.'
        setError(err)
      } else {
        const bedFiles = json.bedFiles ?? []
        bedFiles.unshift('none')

        const availableTrackSet = makeAvailableTrackSet(json.files)

        const currentDataType = stateRef.current.dataType
        const currentBedFile = stateRef.current.bedFile
        const currentTracks = stateRef.current.tracks

        if (currentDataType !== dataTypes.EXAMPLES) {
          const resolvedBedFile =
            isValidURL(currentBedFile) || bedFiles.includes(currentBedFile ?? '')
              ? currentBedFile
              : 'none'
          if (isSet(resolvedBedFile)) {
            console.log('Get BED regions for available BED file')
            getBedRegions(resolvedBedFile)
          } else {
            console.log("Don't get BED regions for BED", currentBedFile)
          }

          const graphTrack = firstGraphTrack(currentTracks)
          if (graphTrack) {
            if (trackIsImplied(graphTrack, availableTrackSet)) {
              console.log("Don't get path info for implied track:", graphTrack)
            } else {
              console.log('Get path info for track:', graphTrack)
              if (graphTrack.trackFile) getPathInfo(graphTrack.trackFile)
            }
          }
        }

        setAvailableTracks(
          trackListWithImplied(json.files, availableTrackSet, currentTracks),
        )
        setAvailableBeds(bedFiles)

        // Note: the original code referenced dataTypes.CUSTOM (which is undefined),
        // so this branch never ran. Preserved by checking the same condition here.
        if (currentDataType === (dataTypes as Record<string, string>).CUSTOM) {
          const currentBedSelect = stateRef.current.bedSelect
          const newBedSelect =
            isValidURL(currentBedSelect) || bedFiles.includes(currentBedSelect)
              ? currentBedSelect
              : 'none'
          setBedSelect(newBedSelect)
          setBedFile(isSet(newBedSelect) ? newBedSelect : undefined)
          if (!isSet(newBedSelect)) {
            setRegionInfo({})
            setDesc(undefined)
          }
        }
      }
    } catch (err) {
      handleFetchError(err as Error, `API getFilenames failed:`)
    }
  }

  function initState() {
    const ds = defaultViewTarget ?? DATA_SOURCES[0]
    const newBedSelect = isSet(ds.bedFile) ? ds.bedFile : 'none'
    setTracks(ds.tracks)
    setBedFile(ds.bedFile)
    setBedSelect(newBedSelect)
    setRegion(ds.region)
    setDataType(ds.dataType ?? dataTypes.BUILT_IN)
    setName(ds.name)
    setSimplify(ds.simplify)
    setPopupOpen(false)
    setRemoveSequences(ds.removeSequences)
  }

  useEffect(() => {
    const controller = new AbortController()
    cancelSignalRef.current = controller.signal

    initState()
    getMountedFilenames()
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
    const s = stateRef.current
    return {
      tracks: s.tracks,
      bedFile: s.bedFile,
      name: s.name,
      region: s.region,
      dataType: s.dataType,
      simplify: s.simplify && !readsExist(s.tracks),
      removeSequences: s.removeSequences,
    }
  }

  function handleGoButton() {
    console.log('HANDLING GO BUTTON:')
    if (dataOrigin !== dataOriginTypes.API) {
      setColorSetting('haplotypeColors', 'ygreys' as ColorPaletteName)
      setColorSetting('forwardReadColors', 'reds' as ColorPaletteName)
    }

    const nextViewTarget = getNextViewTarget()
    const currViewTarget = getCurrentViewTarget() as ViewTarget

    if (Object.keys(nextViewTarget.tracks).length === 0) {
      console.log('Tracks must not be empty before go')
      return
    }

    if (!viewTargetsEqual(currViewTarget, nextViewTarget)) {
      setCurrentViewTarget(nextViewTarget)
    }
  }

  function convertArrayToObject(array: Track[]): Tracks {
    const obj: Tracks = {}
    for (let i = 0; i < array.length; i++) {
      obj[i] = array[i]
    }
    return obj
  }

  async function handleRegionChange(coords: string) {
    setRegion(coords)
    setDesc(getRegionDescByCoords(coords, stateRef.current.regionInfo))

    const coordsToMetaData: Record<string, CoordsMetaData> = {}

    const currentRegionInfo = stateRef.current.regionInfo
    if (
      currentRegionInfo &&
      !isEmpty(currentRegionInfo) &&
      currentRegionInfo.chr
    ) {
      for (const [index, path] of currentRegionInfo.chr.entries()) {
        const pathWithRegion =
          path +
          ':' +
          currentRegionInfo.start![index] +
          '-' +
          currentRegionInfo.end![index]
        coordsToMetaData[pathWithRegion] = {
          tracks: currentRegionInfo.tracks?.[index] ?? null,
          chunk: currentRegionInfo.chunk?.[index] ?? '',
        }
      }
    }

    let newTracks: Track[] | null = coordsToMetaData[coords]?.tracks ?? null
    const chunk = coordsToMetaData[coords]?.chunk ?? null

    const currentBedFile = stateRef.current.bedFile
    if (!newTracks && isSet(currentBedFile) && chunk) {
      const json = await APIInterface.getChunkTracks(
        currentBedFile,
        chunk,
        cancelSignalRef.current,
      )
      if (json.tracks) {
        console.log('json tracks: ', json.tracks)
        newTracks = json.tracks
      }
    }

    if (newTracks) {
      const trackObject = convertArrayToObject(newTracks)
      const newGraphTrack = firstGraphTrack(trackObject)
      const laterRegion = stateRef.current.region
      if (laterRegion === coords) {
        const currentAvailableTracks = stateRef.current.availableTracks
        const laterGraphTrack = firstGraphTrack(stateRef.current.tracks)
        const availableTrackSet = makeAvailableTrackSet(currentAvailableTracks)
        setTracks(trackObject)
        setAvailableTracks(
          trackListWithImplied(
            currentAvailableTracks,
            availableTrackSet,
            trackObject,
          ),
        )
        if (
          !newGraphTrack ||
          !laterGraphTrack ||
          newGraphTrack.trackFile !== laterGraphTrack.trackFile
        ) {
          setPathInfo([])
        }
      }

      const currentTracksNow = stateRef.current.tracks
      const currentGraphTrack = firstGraphTrack(currentTracksNow)
      if (
        !newGraphTrack ||
        !currentGraphTrack ||
        newGraphTrack.trackFile !== currentGraphTrack.trackFile
      ) {
        const availableTrackSet = makeAvailableTrackSet(
          stateRef.current.availableTracks,
        )
        if (
          newGraphTrack &&
          !trackIsImplied(newGraphTrack, availableTrackSet)
        ) {
          console.log(
            'Get path info for chunk provided graph track:',
            newGraphTrack,
          )
          if (newGraphTrack.trackFile) getPathInfo(newGraphTrack.trackFile)
        }
      }
    }
  }

  function handleInputChange(newTracks: Tracks) {
    const newGraphTrack = firstGraphTrack(newTracks)
    const laterGraphTrack = firstGraphTrack(stateRef.current.tracks)

    setTracks(newTracks)
    if (
      !newGraphTrack ||
      !laterGraphTrack ||
      newGraphTrack.trackFile !== laterGraphTrack.trackFile
    ) {
      setPathInfo([])
    }

    const currentGraphTrack = firstGraphTrack(stateRef.current.tracks)
    if (
      !newGraphTrack ||
      !currentGraphTrack ||
      newGraphTrack.trackFile !== currentGraphTrack.trackFile
    ) {
      const availableTrackSet = makeAvailableTrackSet(
        stateRef.current.availableTracks,
      )
      if (newGraphTrack && !trackIsImplied(newGraphTrack, availableTrackSet)) {
        console.log(
          'Get path info for newly selected graph track:',
          newGraphTrack,
        )
        if (newGraphTrack.trackFile) getPathInfo(newGraphTrack.trackFile)
      }
    }
  }

  function handleBedChange(event: { target: { id: string; value: string } }) {
    const id = event.target.id
    const value = event.target.value

    if (id === 'bedSelect') {
      setBedSelect(value)
    }

    const currentBedFile = stateRef.current.bedFile
    setBedFile(value)
    if (value !== currentBedFile) {
      console.log('Clearing outdated BED regions')
      setRegionInfo({})
      setDesc(undefined)
    }

    if (isSet(value) && value !== currentBedFile) {
      getBedRegions(value)
    }
  }

  async function budgeRegion(fraction: number) {
    const parsedRegion = parseRegion(stateRef.current.region) as {
      contig: string
      start: number
      end?: number
      distance?: number
    }

    if (parsedRegion.distance !== undefined) {
      const shift = parsedRegion.distance * fraction
      parsedRegion.start = Math.max(0, Math.round(parsedRegion.start + shift))
    } else {
      const shift = ((parsedRegion.end ?? 0) - parsedRegion.start) * fraction
      parsedRegion.start = Math.max(0, Math.round(parsedRegion.start + shift))
      parsedRegion.end = Math.max(
        0,
        Math.round((parsedRegion.end ?? 0) + shift),
      )
    }

    await handleRegionChange(stringifyRegion(parsedRegion))
    handleGoButton()
  }

  async function jumpRegion(offset: number) {
    let regionIndex =
      determineRegionIndex(
        stateRef.current.region,
        stateRef.current.regionInfo,
      ) ?? 0
    if (
      (offset === -1 && canGoLeft(regionIndex)) ||
      (offset === 1 && canGoRight(regionIndex))
    ) {
      regionIndex += offset
    }
    const regionString = regionStringFromRegionIndex(
      regionIndex,
      stateRef.current.regionInfo,
    )
    await handleRegionChange(regionString)
    handleGoButton()
  }

  function canGoLeft(regionIndex: number) {
    if (isSet(stateRef.current.bedFile)) {
      return regionIndex > 0
    } else {
      return true
    }
  }

  function canGoRight(regionIndex: number) {
    if (isSet(stateRef.current.bedFile)) {
      const chr = stateRef.current.regionInfo.chr
      if (!chr) {
        return false
      }
      return regionIndex < chr.length - 1
    } else {
      return true
    }
  }

  function handleGoRight() {
    if (isSet(bedFile)) {
      jumpRegion(1)
    } else {
      budgeRegion(0.5)
    }
  }

  function handleGoLeft() {
    if (isSet(bedFile)) {
      jumpRegion(-1)
    } else {
      budgeRegion(-0.5)
    }
  }

  function handleDataSourceChange(event: SelectChangeEvent<unknown>) {
    const value = event.target.value as string

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
      DATA_SOURCES.forEach(ds => {
        if (ds.name === value) {
          let newBedSelect = 'none'
          if (isSet(ds.bedFile)) {
            getBedRegions(ds.bedFile)
            newBedSelect = ds.bedFile
          } else {
            setRegionInfo({})
          }
          const graphTrack = firstGraphTrack(ds.tracks)
          if (graphTrack) {
            console.log('Get path info for built-in track: ', graphTrack)
            if (graphTrack.trackFile) getPathInfo(graphTrack.trackFile)
          }

          const laterGraphTrack = firstGraphTrack(stateRef.current.tracks)
          if (
            !laterGraphTrack ||
            !graphTrack ||
            laterGraphTrack.trackFile !== graphTrack.trackFile
          ) {
            setPathInfo([])
          }

          setTracks(ds.tracks)
          setBedFile(ds.bedFile)
          setBedSelect(newBedSelect)
          setRegion(ds.region)
          setDataType(dataTypes.BUILT_IN)
          setName(ds.name)
        }
      })
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
    getCurrentViewTarget() as ViewTarget,
  )
  const displayDescription = desc

  const regionIndex = determineRegionIndex(region, regionInfo) ?? 0

  const DataPositionFormRowComponent = (
    <DataPositionFormRow
      handleGoLeft={() => handleGoLeft()}
      handleGoRight={() => handleGoRight()}
      handleGoButton={() => handleGoButton()}
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
              onChange={e => handleDataSourceChange(e)}
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
                  onChange={e => handleBedChange(e)}
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
                      onClick={() => setPopupOpen(!popupOpen)}
                      outline
                      active={simplify || removeSequences}
                    >
                      <FontAwesomeIcon icon={faGear} /> Simplify
                    </Button>
                    <PopupDialog
                      open={popupOpen}
                      close={() => setPopupOpen(!popupOpen)}
                      width="400px"
                    >
                      <div style={{ height: '10vh' }}>
                        <label
                          className="d-flex align-items-center justify-content-between"
                          style={{ marginBottom: '10px' }}
                        >
                          <span>Remove Small Variants</span>
                          <Switch
                            onChange={() => setSimplify(!simplify)}
                            checked={!!simplify}
                          />
                        </label>
                        <label className="d-flex align-items-center justify-content-between">
                          <span>Remove Node Sequences</span>
                          <Switch
                            onChange={() =>
                              setRemoveSequences(!removeSequences)
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
                    onChange={newTracks => handleInputChange(newTracks)}
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
                  setColorSetting={setColorSetting as (k: string, i: number, v: ColorPaletteName) => void}
                />
              ) : (
                !customFilesFlag && DataPositionFormRowComponent
              )}
            </Row>
            {displayDescription ? (
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
