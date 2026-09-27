import type { ReactNode } from 'react'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

type APIMode = 'local' | 'server' | 'upstream'

interface UploadModeToggleProps {
  apiMode: APIMode
  selfHostedServer: boolean
  onDestChange: (mode: string) => void
  disabled: boolean
}

const SERVER_FORMATS = (
  <>
    Accepts the full vg toolchain: <code>.xg</code>, <code>.vg</code>,{' '}
    <code>.gbz</code> graphs and <code>.gam</code> reads. The server builds its
    own <code>.gam.gai</code>, so an uploaded one is skipped. <code>.gaf</code>{' '}
    reads have to be sorted, tabix-indexed and mounted in the server's data
    directory beforehand.
  </>
)

const descriptions: Record<APIMode, ReactNode> = {
  local: (
    <>
      The in-browser reader runs in WebAssembly, so files stay on your machine.
      It reads <code>.gbz.db</code> graphs and sorted <code>.gam</code> reads
      with their <code>.gam.gai</code> index.{' '}
      <a
        href="https://github.com/cmdcolin/sequenceTubeMap/blob/master/doc/data.md"
        target="_blank"
        rel="noreferrer"
      >
        How to prepare files →
      </a>
    </>
  ),
  upstream: (
    <>
      Uploads go to the public <code>api.tubemap.graphs.vg</code> server (5 MB
      limit, deleted after 24 h). {SERVER_FORMATS}
    </>
  ),
  server: <>Uploads go to your self-hosted server. {SERVER_FORMATS}</>,
}

export function UploadModeToggle({
  apiMode,
  selfHostedServer,
  onDestChange,
  disabled,
}: UploadModeToggleProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <ToggleButtonGroup
        value={apiMode}
        exclusive
        disabled={disabled}
        onChange={(_e, val: APIMode | null) => {
          if (val !== null) {
            onDestChange(val)
          }
        }}
        aria-label="Where files are read"
        fullWidth
      >
        <ToggleButton value="local" data-testid="mode-local">
          In browser
        </ToggleButton>
        <ToggleButton value="upstream" data-testid="mode-upstream">
          vgteam server
        </ToggleButton>
        {selfHostedServer && (
          <ToggleButton value="server" data-testid="mode-server">
            Self-hosted server
          </ToggleButton>
        )}
      </ToggleButtonGroup>
      <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
        {descriptions[apiMode]}
      </div>
    </div>
  )
}

export default UploadModeToggle
