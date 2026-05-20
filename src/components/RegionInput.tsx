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
}

// RegionInput: The path and region input box component
// Responsible for selecting the path/chr and segment of data to look at
export const RegionInput = ({
  region,
  regionInfo,
  handleRegionChange,
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

  const displayRegions = pathsWithRegion

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
              const regionObject = displayRegions.find(
                option => option.label === newInput,
              )
              if (regionObject) {
                regionValue = regionObject.value
              }
              handleRegionChange(regionValue)
            }}
            options={displayRegions}
            renderInput={params => (
              <TextField
                {...params}
                size="small"
                label={'Region'}
                name="Region Input"
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
          <p>
            <strong>Format:</strong> <code>path:start-end</code>
            <br />
            <em>e.g.</em> <code>GRCh38#chr1:10000-20000</code>
          </p>
          <p>
            Paths assign linearly increasing coordinates to the nodes of a
            pangenome graph. A range query returns every node the path visits
            in that interval — even when the underlying graph is non-linear or
            contains bubbles.
          </p>
          <p>
            Use the <strong>Paths in this graph</strong> panel below to browse
            available paths and copy a range into this field.
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default RegionInput
