import { useState, useEffect } from 'react'
import { Row, Col } from 'reactstrap'
import { TrackList } from './TrackList'
import { TrackAddButton } from './TrackAddButton'
import '../config-client.js'
import { config } from '../config-global.mjs'
import type {
  AvailableTrack,
  ColorPaletteName,
  FileType,
  Track,
  Tracks,
} from '../Types'

// -1 marks a pending deletion in the change set.
type TrackChange = Track | -1
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

export const TrackPickerDisplay = ({
  tracks,
  availableTracks,
  availableColors,
  onChange = () => {},
  handleFileUpload,
}: TrackPickerDisplayProps) => {
  const [trackListChanges, setTrackListChanges] = useState<TrackChanges>({})

  // gets the highest trackID between pending changes and tracks + 1
  const nextTrackID =
    Object.keys({ ...tracks, ...trackListChanges })
      .map(k => parseInt(k))
      .reduce((a, b) => (a > b ? a : b), 0) + 1

  // returns an updated track change set combining the 2 inputs, with trackChanges taking priority.
  // Output keeps the TrackChanges type (may include -1 deletions); convert to Tracks via applyToBase.
  const mergeChanges = (
    base: TrackChanges,
    trackChanges: TrackChanges,
  ): TrackChanges => ({ ...base, ...trackChanges })

  const applyToBase = (base: Tracks, trackChanges: TrackChanges): Tracks => {
    const newTrackList: Tracks = { ...base }
    for (const trackID of Object.keys(trackChanges)) {
      const change = trackChanges[trackID]
      if (change === -1) {
        delete newTrackList[trackID]
      } else {
        newTrackList[trackID] = change
      }
    }
    return newTrackList
  }

  const addTrackItem = () => {
    setTrackListChanges({
      ...trackListChanges,
      [nextTrackID.toString()]: { ...config.defaultTrackProps } as Track,
    })
  }

  const trackListOnChange = (newTracks: Tracks) => {
    setTrackListChanges(mergeChanges(trackListChanges, newTracks))
  }

  const onDelete = (trackID: number) => {
    setTrackListChanges({ ...trackListChanges, [trackID]: -1 })
  }

  useEffect(() => {
    const newTrackList = applyToBase(tracks, trackListChanges)

    // track list is valid to commit if all fileNames have been selected
    let validTrackList = true
    for (const trackID of Object.keys(newTrackList)) {
      if (newTrackList[trackID].trackFile === undefined) {
        validTrackList = false
      }
    }

    // call onChange if the track list is valid and changes have been made
    if (
      validTrackList &&
      JSON.stringify(newTrackList) !== JSON.stringify(tracks)
    ) {
      console.log('calling Track Picker Display onChange with ', newTrackList)
      onChange(newTrackList)
      setTrackListChanges({})
    }
  }, [trackListChanges, onChange, tracks])

  const appliedTracks = applyToBase(tracks, trackListChanges)
  const isEmpty = Object.keys(appliedTracks).length === 0

  return (
    <Col style={{ minWidth: '500px' }}>
      <Row>
        <TrackList
          tracks={appliedTracks}
          availableTracks={availableTracks}
          availableColors={availableColors}
          onChange={trackListOnChange}
          onDelete={onDelete}
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
