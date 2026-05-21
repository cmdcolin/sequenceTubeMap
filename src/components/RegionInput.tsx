import { useState } from 'react'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons'
import '../config-client.js'
import '../config-global.mjs'
import { isEmpty } from '../common.ts'
import type { RegionInfo } from '../Types.ts'

interface RegionOption {
  label: string
  value: string
}

interface RegionInputProps {
  region: string
  regionInfo: RegionInfo
  handleRegionChange: (region: string) => void
  onSubmit?: () => void
}

// RegionInput: The path and region input box component
// Responsible for selecting the path/chr and segment of data to look at
export const RegionInput = ({
  region,
  regionInfo,
  handleRegionChange,
  onSubmit,
}: RegionInputProps) => {
  const [helpOpen, setHelpOpen] = useState(false)
  const pathsWithRegion: RegionOption[] = []

  const regionToDesc = new Map<string, string>()

  if (
    !isEmpty(regionInfo) &&
    regionInfo.chr &&
    regionInfo.start &&
    regionInfo.end &&
    regionInfo.desc
  ) {
    const { chr, start, end, desc } = regionInfo
    for (const [index, path] of chr.entries()) {
      const pathWithRegion = `${path}:${start[index]}-${end[index]}`
      pathsWithRegion.push({
        label: `${pathWithRegion} ${desc[index]}`,
        value: pathWithRegion,
      })
      regionToDesc.set(pathWithRegion, desc[index]!)
    }
  }

  let descLabel = 'Region'
  const matched = regionToDesc.get(region)
  if (matched) {
    descLabel = matched
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title={descLabel} placement="top-start">
          <Autocomplete<RegionOption | string, false, false, true>
            disablePortal
            freeSolo
            size="small"
            sx={{ flexGrow: 1 }}
            getOptionLabel={option =>
              typeof option === 'string' ? option : option.label
            }
            value={region}
            inputValue={region}
            data-testid="autocomplete"
            id="regionInput"
            onInputChange={(_event, newInput) => {
              let regionValue = newInput
              const regionObject = pathsWithRegion.find(
                option => option.label === newInput,
              )
              if (regionObject) {
                regionValue = regionObject.value
              }
              handleRegionChange(regionValue)
            }}
            options={pathsWithRegion}
            renderInput={params => (
              <TextField
                {...params}
                size="small"
                label={'Region'}
                name="Region Input"
                onKeyDown={e => {
                  if (e.key === 'Enter' && onSubmit) {
                    e.preventDefault()
                    onSubmit()
                  }
                }}
              />
            )}
          />
        </Tooltip>
        <IconButton size="small" onClick={() => { setHelpOpen(true); }}>
          <FontAwesomeIcon icon={faCircleQuestion} />
        </IconButton>
      </Box>
      <Dialog open={helpOpen} onClose={() => { setHelpOpen(false); }} maxWidth="sm" fullWidth>
        <DialogTitle>Region format</DialogTitle>
        <DialogContent>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ paddingRight: '1.5em', paddingBottom: '0.75em', whiteSpace: 'nowrap', verticalAlign: 'top' }}><strong>Path range</strong></td>
                <td style={{ paddingBottom: '0.75em' }}>
                  <code>path:start-end</code> &nbsp;<em>e.g.</em> <code>GRCh38#chr1:10000-20000</code>
                  <br />
                  Paths have linearly increasing coordinates over graph nodes; the query returns every node the path visits in that interval.
                </td>
              </tr>
              <tr>
                <td style={{ paddingRight: '1.5em', whiteSpace: 'nowrap', verticalAlign: 'top' }}><strong>Node ID range</strong></td>
                <td>
                  <code>node:first-last</code> &nbsp;<em>e.g.</em> <code>node:42-55</code>
                  <br />
                  Returns the subgraph spanned by nodes whose IDs fall in the given range.
                </td>
              </tr>
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default RegionInput
