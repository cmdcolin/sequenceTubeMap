import { useState } from 'react'
import { Card, CardHeader, Collapse, CardBody, Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight, faChevronDown } from '@fortawesome/free-solid-svg-icons'
import type { PathInfo } from '../Types.ts'
import HelpDialog from './HelpDialog.tsx'

interface PathsPanelProps {
  pathInfo: PathInfo[]
  onLoadPath: (region: string) => void
}

// Loading paths much longer than this freezes the browser for many seconds
// (the tube-map layout pipeline is O(N) in nodes/bases). Warn before loading.
const SLOW_PATH_THRESHOLD = 10_000

function PathsPanel({ pathInfo, onLoadPath }: PathsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!pathInfo.length) return null

  function handleLoad(name: string, length: number) {
    const proceed =
      length < SLOW_PATH_THRESHOLD ||
      window.confirm(
        `Path "${name}" is ${length.toLocaleString()} bp. Rendering paths this large can freeze the browser for many seconds.\n\n` +
          `Tip: instead of loading the whole path, you can cancel and type a subrange into the Region field above, e.g. "${name}:0-5000".\n\n` +
          `Load the full path anyway?`,
      )
    if (proceed) {
      onLoadPath(`${name}:0-${length - 1}`)
    }
  }

  return (
    <Card className="mt-2">
      <CardHeader
        onClick={() => { setIsOpen(!isOpen); }}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        className="d-flex justify-content-between align-items-center"
        role="button"
        aria-expanded={isOpen}
      >
        <span>
          <FontAwesomeIcon
            icon={isOpen ? faChevronDown : faChevronRight}
            className="me-2"
            style={{ width: 12 }}
          />
          Paths in this graph
          <HelpDialog title="Paths in this graph">
            <p>
              These are the named paths embedded in the pangenome graph file
              (e.g. reference chromosomes or haplotypes stored in a GBZ/VG/XG
              graph).
            </p>
            <p>
              Click <strong>Load</strong> next to a path to navigate to its
              full extent in the tube map.
            </p>
            <p>
              Paths longer than{' '}
              {SLOW_PATH_THRESHOLD.toLocaleString()} bp are marked{' '}
              <span className="badge bg-warning text-dark">slow</span> — loading
              them can freeze the browser for several seconds, so you will be
              asked to confirm before they render.
            </p>
            <p>
              For long paths it's usually faster to type a subrange directly
              into the <strong>Region</strong> field above, using the syntax{' '}
              <code>pathName:start-end</code> (e.g.{' '}
              <code>chr1:0-5000</code>), instead of loading the entire path.
            </p>
          </HelpDialog>
        </span>
        <span className="text-muted small">
          {pathInfo.length} paths{' '}
          {isOpen ? '(click to collapse)' : '(click to expand)'}
        </span>
      </CardHeader>
      <Collapse isOpen={isOpen}>
        <CardBody style={{ maxHeight: '300px', overflowY: 'auto', padding: 0 }}>
          <table className="table table-sm table-hover mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Length</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pathInfo.map(({ name, length, cyclic }) => {
                const slow = length !== null && length >= SLOW_PATH_THRESHOLD
                return (
                  <tr key={name}>
                    <td>
                      {name}
                      {cyclic && (
                        <span
                          className="badge bg-info ms-1"
                          style={{ fontSize: '0.7em' }}
                        >
                          cyclic
                        </span>
                      )}
                    </td>
                    <td>
                      {length !== null ? `${length.toLocaleString()} bp` : '—'}
                      {slow && (
                        <span
                          className="badge bg-warning text-dark ms-1"
                          style={{ fontSize: '0.7em' }}
                          title="Loading this path may freeze the browser for several seconds"
                        >
                          slow
                        </span>
                      )}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        disabled={length === null}
                        onClick={() => { handleLoad(name, length!); }}
                      >
                        Load
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardBody>
      </Collapse>
    </Card>
  )
}

export default PathsPanel
