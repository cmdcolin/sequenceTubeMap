import { TrackListItem } from './TrackListItem.tsx'
import type {
  AvailableTrack,
  ColorPaletteName,
  FileType,
  Track,
  Tracks,
} from '../Types.ts'

interface TrackListProps {
  tracks: Tracks
  availableTracks: AvailableTrack[]
  availableColors?: ColorPaletteName[]
  onChange: (newTracks: Tracks) => void
  onDelete: (trackID: number) => void
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
}

export const TrackList = ({
  tracks,
  availableTracks,
  availableColors,
  onChange,
  onDelete,
  handleFileUpload,
}: TrackListProps) => {
  function trackItemOnChange(trackID: number, trackProps: Track) {
    const newTracks: Tracks = { ...tracks }
    newTracks[trackID] = trackProps
    if (JSON.stringify(newTracks) !== JSON.stringify(tracks)) {
      onChange(newTracks)
    }
  }

  function renderTracks() {
    return Object.keys(tracks).map(trackID => {
      const trackProps = tracks[trackID]!
      return (
        <TrackListItem
          trackProps={trackProps}
          availableTracks={availableTracks}
          availableColors={availableColors}
          onChange={trackItemOnChange}
          onDelete={onDelete}
          trackID={parseInt(trackID)}
          key={trackID}
          handleFileUpload={handleFileUpload}
        />
      )
    })
  }

  return <div>{renderTracks()}</div>
}

export default TrackList
