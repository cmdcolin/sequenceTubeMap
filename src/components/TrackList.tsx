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
  onChange: (trackID: number, newTrack: Track) => void
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
  return (
    <div>
      {tracks.map((trackProps, idx) => (
        <TrackListItem
          key={trackProps.trackFile ?? String(idx)}
          trackProps={trackProps}
          availableTracks={availableTracks}
          availableColors={availableColors}
          onChange={onChange}
          onDelete={onDelete}
          trackID={idx}
          handleFileUpload={handleFileUpload}
        />
      ))}
    </div>
  )
}

export default TrackList
