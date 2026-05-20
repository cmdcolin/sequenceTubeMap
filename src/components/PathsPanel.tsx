import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { PathInfo } from '../Types.ts'
import HelpDialog from './HelpDialog.tsx'

interface PathsPanelProps {
  pathInfo: PathInfo[]
  onLoadPath: (region: string) => void
}

// Loading paths much longer than this freezes the browser for many seconds
// (the tube-map layout pipeline is O(N) in nodes/bases). Warn before loading.
const SLOW_PATH_THRESHOLD = 10_000

function regionFor(name: string, length: number) {
  return `${name}:0-${length - 1}`
}

function PathsPanel({ pathInfo, onLoadPath }: PathsPanelProps) {
  if (!pathInfo.length) return null

  function handleLoad(name: string, length: number) {
    const proceed =
      length < SLOW_PATH_THRESHOLD ||
      window.confirm(
        `Path "${name}" is ${length.toLocaleString()} bp. Rendering paths this large can freeze the browser for many seconds.\n\n` +
          `Tip: edit the range in the Region field before loading.\n\n` +
          `Load the full path anyway?`,
      )
    if (proceed) {
      onLoadPath(regionFor(name, length))
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
      <Autocomplete<PathInfo>
        sx={{ flexGrow: 1 }}
        size="small"
        options={pathInfo}
        value={null}
        getOptionLabel={p => p.name}
        renderOption={(props, p) => {
          const slow = p.length !== null && p.length >= SLOW_PATH_THRESHOLD
          return (
            <li {...props} key={p.name}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, width: '100%' }}>
                <span>{p.name}</span>
                {p.cyclic && (
                  <Typography variant="caption" sx={{ color: 'info.main' }}>cyclic</Typography>
                )}
                <Typography variant="caption" sx={{ ml: 'auto', color: slow ? 'warning.main' : 'text.secondary' }}>
                  {p.length !== null ? `${p.length.toLocaleString()} bp` : '—'}
                  {slow ? ' ⚠' : ''}
                </Typography>
              </Box>
            </li>
          )
        }}
        onChange={(_, path) => {
          if (path?.length != null) {
            handleLoad(path.name, path.length)
          }
        }}
        renderInput={params => (
          <TextField {...params} size="small" label="Path" />
        )}
      />
      <HelpDialog title="Paths in this graph">
        <p>
          These are the named paths embedded in the pangenome graph file
          (e.g. reference chromosomes or haplotypes stored in a GBZ/VG/XG graph).
        </p>
        <p>
          Select a path to navigate to its full extent. Paths longer than{' '}
          {SLOW_PATH_THRESHOLD.toLocaleString()} bp will prompt for confirmation
          before loading — for large paths it's faster to type a subrange like{' '}
          <code>pathName:start-end</code> directly into the Region field.
        </p>
      </HelpDialog>
    </Box>
  )
}

export default PathsPanel
