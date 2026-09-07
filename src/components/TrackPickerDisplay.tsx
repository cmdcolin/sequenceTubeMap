import { useState } from 'react'
import Box from '@mui/material/Box'
import { TrackList } from './TrackList.tsx'
import { TrackAddButton } from './TrackAddButton.tsx'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type {
  AvailableTrack,
  ColorPaletteName,
  FileType,
  Track,
  Tracks,
} from '../Types.ts'

// Sentinel for deletions in the pending change set.
const DELETED = Symbol('deleted')
type TrackChange = Track | typeof DELETED
type TrackChanges = Record<string, TrackChange>

interface TrackPickerDisplayProps {
  tracks: Tracks
  availableTracks: AvailableTrack[]
  availableColors?: ColorPaletteName[]
  onChange: (newTracks: Tracks) => void
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
  apiMode: 'local' | 'server' | 'upstream'
}

function applyChanges(base: Tracks, changes: TrackChanges): Tracks {
  const result: Tracks = base
    .map((track, i) => {
      const change = changes[i]
      if (change === undefined) return track
      if (change === DELETED) return undefined
      return change
    })
    .filter((t): t is Track => t !== undefined)
  for (let i = base.length; ; i++) {
    const change = changes[i]
    if (change === undefined) break
    if (change !== DELETED) result.push(change)
  }
  return result
}

const allFilesSet = (tracks: Tracks) =>
  tracks.every(t => t.trackFile !== undefined)

// Same track set, in the same order, as far as the picker is concerned.
function sameTracks(a: Tracks, b: Tracks) {
  return (
    a.length === b.length &&
    a.every((track, i) => {
      const other = b[i]
      return (
        track.trackType === other?.trackType &&
        track.trackFile === other.trackFile &&
        track.trackColorSettings?.mainPalette ===
          other.trackColorSettings?.mainPalette &&
        track.trackColorSettings?.auxPalette ===
          other.trackColorSettings?.auxPalette
      )
    })
  )
}

export const TrackPickerDisplay = ({
  tracks,
  availableTracks,
  availableColors,
  onChange,
  handleFileUpload,
  apiMode,
}: TrackPickerDisplayProps) => {
  // Pending edits layered on top of the parent's tracks. We only flush to
  // the parent once every entry has a file selected, so users can stage a
  // half-configured row without dirtying upstream state.
  const [pending, setPending] = useState<TrackChanges>({})

  const applied = applyChanges(tracks, pending)
  const nextTrackID = applied.length

  const stage = (extra: TrackChanges) => {
    const merged = { ...pending, ...extra }
    const next = applyChanges(tracks, merged)
    if (allFilesSet(next) && !sameTracks(next, tracks)) {
      onChange(next)
      setPending({})
    } else {
      setPending(merged)
    }
  }

  const addTrackItem = () => {
    stage({ [nextTrackID]: { ...config.defaultTrackProps } })
  }

  const isEmpty = applied.length === 0

  return (
    <Box sx={{ minWidth: '500px' }}>
      <Box>
        <TrackList
          tracks={applied}
          availableTracks={availableTracks}
          availableColors={availableColors}
          onChange={(trackID, newTrack) => { stage({ [trackID]: newTrack }); }}
          onDelete={(trackID) => { stage({ [trackID]: DELETED }); }}
          handleFileUpload={handleFileUpload}
          apiMode={apiMode}
        />
      </Box>
      {isEmpty && (
        <Box
          sx={{ padding: '12px 16px', color: '#666', fontStyle: 'italic' }}
        >
          No tracks configured. Click the + button below to add a track.
        </Box>
      )}
      <Box>
        <TrackAddButton onChange={() => { addTrackItem(); }} />
      </Box>
    </Box>
  )
}

export default TrackPickerDisplay
