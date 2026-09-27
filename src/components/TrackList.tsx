import { TrackListItem } from './TrackListItem.tsx'
import type { AvailableTrack, FileType, Track, Tracks } from '../Types.ts'

interface TrackListProps {
  tracks: Tracks
  availableTracks: AvailableTrack[]
  onChange: (trackID: number, newTrack: Track) => void
  onDelete: (trackID: number) => void
  handleFileUpload: (
    fileType: FileType,
    file: File,
  ) => Promise<string | undefined>
  apiMode: 'local' | 'server' | 'upstream'
}

export const TrackList = ({
  tracks,
  availableTracks,
  onChange,
  onDelete,
  handleFileUpload,
  apiMode,
}: TrackListProps) => {
  return (
    <div>
      {tracks.map((trackProps, idx) => (
        <TrackListItem
          key={idx}
          trackProps={trackProps}
          availableTracks={availableTracks}
          onChange={onChange}
          onDelete={onDelete}
          trackID={idx}
          handleFileUpload={handleFileUpload}
          apiMode={apiMode}
        />
      ))}
    </div>
  )
}

export default TrackList
