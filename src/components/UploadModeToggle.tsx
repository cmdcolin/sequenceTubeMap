import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

interface UploadModeToggleProps {
  apiMode: 'local' | 'server' | 'upstream'
  serverModeId: 'server' | 'upstream'
  onDestChange: (mode: string) => void
}

export function UploadModeToggle({
  apiMode,
  serverModeId,
  onDestChange,
}: UploadModeToggleProps) {
  const isLocal = apiMode === 'local'

  const handleChange = (
    _e: React.MouseEvent<HTMLElement>,
    val: 'local' | 'server' | null,
  ) => {
    if (val === null) {
      return
    }
    onDestChange(val === 'local' ? 'local' : serverModeId)
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <ToggleButtonGroup
        value={isLocal ? 'local' : 'server'}
        exclusive
        size="small"
        onChange={handleChange}
        aria-label="upload mode"
        fullWidth
      >
        <ToggleButton value="server" data-testid="mode-server">
          Server upload (default)
        </ToggleButton>
        <ToggleButton value="local" data-testid="mode-local">
          Local parsing (experimental)
        </ToggleButton>
      </ToggleButtonGroup>
      <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
        {isLocal ? (
          <>
            <strong>Local parsing</strong> runs entirely in your browser via
            WebAssembly — files stay on your machine. Currently supports{' '}
            <code>.gbz.db</code> graphs and sorted <code>.gam</code> reads
            (with their <code>.gam.gai</code> index).{' '}
            <a
              href="https://github.com/cmdcolin/sequenceTubeMap/blob/master/doc/data.md"
              target="_blank"
              rel="noreferrer"
            >
              How to prepare files →
            </a>
          </>
        ) : (
          <>
            <strong>Server upload</strong> sends your files to{' '}
            {apiMode === 'upstream' ? (
              <>
                the public <code>api.tubemap.graphs.vg</code> server
                (5&nbsp;MB limit, deleted after 24 h)
              </>
            ) : (
              <>your self-hosted server</>
            )}
            . Accepts the full vg toolchain: <code>.xg</code>,{' '}
            <code>.vg</code>, <code>.gbz</code> graphs and <code>.gam</code> /{' '}
            <code>.gaf</code> reads. You can include a <code>.gam.gai</code>{' '}
            index — it's silently ignored because the server builds its own.
          </>
        )}
      </div>
    </div>
  )
}

export default UploadModeToggle
