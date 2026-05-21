import { useState } from 'react'
import AppBar from '@mui/material/AppBar'
import Backdrop from '@mui/material/Backdrop'
import Box from '@mui/material/Box'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import type { AvailableTrack, FileType, Track, Tracks, ViewTarget, VisOptions } from '../Types.ts'
import HelpButton from './HelpButton.tsx'
import { ExamplesMenu } from './ExamplesMenu.tsx'
import { FileMenu } from './FileMenu.tsx'
import { ReadsMenu } from './ReadsMenu.tsx'
import { ViewMenu } from './ViewMenu.tsx'
import { VisibilityMenu } from './VisibilityMenu.tsx'

type MenuType = 'examples' | 'file' | 'view' | 'reads' | 'visibility'

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
  onDestChange?: (mode: string) => void
  legendVisible?: boolean
  toggleLegend?: () => void
  visOptions?: VisOptions
  toggleVisOptionFlag?: (flag: string) => void
  compressedViewLocked?: boolean
  handleMappingQualityCutoffChange?: (value: string | number) => void
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
  onDestChange,
  legendVisible,
  toggleLegend,
  visOptions,
  toggleVisOptionFlag,
  compressedViewLocked,
  handleMappingQualityCutoffChange,
}: HeaderFormAppBarProps) {
  const [menuAnchor, setMenuAnchor] = useState<{ type: MenuType; el: HTMLElement } | null>(null)

  const menuFor = (type: MenuType) => ({
    anchorEl: menuAnchor?.type === type ? menuAnchor.el : null,
    open: menuAnchor?.type === type,
    onClose: () => { setMenuAnchor(null); },
    onOpen: (el: HTMLElement) => { setMenuAnchor({ type, el }); },
  })

  return (
    <>
      <Backdrop
        open={menuAnchor !== null}
        sx={{
          zIndex: 1200,
          backgroundColor: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          pb: 6,
        }}
      >
        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.75)' }}>
          Click away to close menu
        </Typography>
      </Backdrop>
      <AppBar position="static" color="primary" elevation={2} sx={{ background: '#1a5276', mb: 1 }}>
        <Toolbar variant="dense">
          <img src="./logo.svg" alt="seqTubeMaps" style={{ height: 32, marginRight: 8 }} />
          <ExamplesMenu
            {...menuFor('examples')}
            visibleDataSources={visibleDataSources}
            discoveredDataSources={discoveredDataSources}
            dataType={dataType}
            name={name}
            onSelect={onSelectDataSource}
          />
          <FileMenu
            {...menuFor('file')}
            customFilesFlag={customFilesFlag}
            tracks={tracks}
            availableTracks={availableTracks}
            onTracksChange={onTracksChange}
            handleFileUpload={handleFileUpload}
            onUploaded={onUploaded}
            onOpenCustomFiles={onOpenCustomFiles}
            apiMode={apiMode}
            onDestChange={onDestChange}
          />
          {toggleLegend && visOptions && toggleVisOptionFlag && (
            <>
              <ViewMenu
                {...menuFor('view')}
                legendVisible={!!legendVisible}
                toggleLegend={toggleLegend}
                visOptions={visOptions}
                toggleVisOptionFlag={toggleVisOptionFlag}
                compressedViewLocked={compressedViewLocked}
              />
              <ReadsMenu
                {...menuFor('reads')}
                visOptions={visOptions}
                toggleVisOptionFlag={toggleVisOptionFlag}
                handleMappingQualityCutoffChange={handleMappingQualityCutoffChange}
              />
            </>
          )}
          <VisibilityMenu {...menuFor('visibility')} />
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
    </>
  )
}
