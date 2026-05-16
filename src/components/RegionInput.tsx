import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import FormHelperText from '@mui/material/FormHelperText'
import Tooltip from '@mui/material/Tooltip'
import '../config-client.js'
import '../config-global.mjs'
import { isEmpty } from '../common.mjs'
import type { RegionInfo } from '../Types'

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
      regionToDesc.set(pathWithRegion, desc[index])
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
      <Tooltip title={descLabel} placement="top-start">
        <Autocomplete<RegionOption | string, false, false, true>
          disablePortal
          freeSolo
          size="small"
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
      <FormHelperText id="comboBoxHelperText">
        {`
        Input a data segment to select with format <path>:<regionRange> and hit 'Go'.  See ? for more information.
          `}
      </FormHelperText>
    </>
  )
}

export default RegionInput
