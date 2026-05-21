import { useState } from 'react'
import isEqual from 'react-fast-compare'
import { Row, Col } from 'reactstrap'
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
  onChange?: (newTracks: Tracks) => void
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
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

export const TrackPickerDisplay = ({
  tracks,
  availableTracks,
  availableColors,
  onChange = () => {},
  handleFileUpload,
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
    if (allFilesSet(next) && !isEqual(next, tracks)) {
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
    <Col style={{ minWidth: '500px' }}>
      <Row>
        <TrackList
          tracks={applied}
          availableTracks={availableTracks}
          availableColors={availableColors}
          onChange={(trackID, newTrack) => { stage({ [trackID]: newTrack }); }}
          onDelete={(trackID) => { stage({ [trackID]: DELETED }); }}
          handleFileUpload={handleFileUpload}
        />
      </Row>
      {isEmpty && (
        <Row>
          <div
            style={{ padding: '12px 16px', color: '#666', fontStyle: 'italic' }}
          >
            No tracks configured. Click the + button below to add a track.
          </div>
        </Row>
      )}
      <Row>
        <TrackAddButton onChange={addTrackItem} />
      </Row>
    </Col>
  )
}

export default TrackPickerDisplay
