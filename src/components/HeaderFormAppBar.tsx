import type { ReactNode } from 'react'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import type { AvailableTrack, FileType, Track, Tracks, ViewTarget } from '../Types.ts'
import HelpButton from './HelpButton.tsx'
import { ExamplesMenu } from './ExamplesMenu.tsx'
import { FileMenu } from './FileMenu.tsx'
import { VisibilityMenu } from './VisibilityMenu.tsx'

interface HeaderFormAppBarProps {
  visibleDataSources: ViewTarget[]
  discoveredDataSources: ViewTarget[]
  dataType: string
  name: string | undefined
  onSelectDataSource: (name: string) => void
  customFilesFlag: boolean
  tracks: Tracks
  availableTracks: AvailableTrack[]
  onTracksChange: (tracks: Tracks) => void
  handleFileUpload: (fileType: FileType, file: File) => Promise<string | undefined>
  onUploaded: (tracks: Track[]) => void
  onOpenCustomFiles: () => void
  apiMode: 'local' | 'server' | 'upstream'
  serverModeId: 'server' | 'upstream'
  onDestChange: (mode: string) => void
  // Menus owned by the app (the visualization options), rendered between the
  // form's own menus and the visibility popover.
  visMenus: ReactNode
}

export function HeaderFormAppBar({
  visibleDataSources,
  discoveredDataSources,
  dataType,
  name,
  onSelectDataSource,
  customFilesFlag,
  tracks,
  availableTracks,
  onTracksChange,
  handleFileUpload,
  onUploaded,
  onOpenCustomFiles,
  apiMode,
  serverModeId,
  onDestChange,
  visMenus,
}: HeaderFormAppBarProps) {
  return (
    <AppBar position="static" color="primary" elevation={2} sx={{ background: '#1a5276', mb: 1 }}>
      <Toolbar variant="dense">
        <img src="./logo.svg" alt="seqTubeMaps" style={{ height: 32, marginRight: 8 }} />
        <ExamplesMenu
          visibleDataSources={visibleDataSources}
          discoveredDataSources={discoveredDataSources}
          dataType={dataType}
          name={name}
          onSelect={onSelectDataSource}
        />
        <FileMenu
          customFilesFlag={customFilesFlag}
          tracks={tracks}
          availableTracks={availableTracks}
          onTracksChange={onTracksChange}
          handleFileUpload={handleFileUpload}
          onUploaded={onUploaded}
          onOpenCustomFiles={onOpenCustomFiles}
          apiMode={apiMode}
          serverModeId={serverModeId}
          onDestChange={onDestChange}
        />
        {visMenus}
        <VisibilityMenu />
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
  )
}
