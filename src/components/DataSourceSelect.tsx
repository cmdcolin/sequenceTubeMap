import MenuItem from '@mui/material/MenuItem'
import ListSubheader from '@mui/material/ListSubheader'
import MuiSelect, { type SelectChangeEvent } from '@mui/material/Select'
import { Label } from 'reactstrap'

export interface DataSourceGroup {
  heading: string | null
  options: { value: string; label: string }[]
}

interface DataSourceSelectProps {
  value: string
  groups: DataSourceGroup[]
  onChange: (event: SelectChangeEvent) => void
}

export const DataSourceSelect = ({
  value,
  groups,
  onChange,
}: DataSourceSelectProps) => (
  <>
    <Label
      className="tight-label mb-2 me-sm-2 mb-sm-0 ms-2"
      htmlFor="dataSourceSelect"
    >
      Data:
    </Label>
    <MuiSelect
      id="dataSourceSelect"
      data-testid="dataSourceSelect"
      size="small"
      fullWidth
      value={value}
      onChange={e => { onChange(e); }}
    >
      {groups.flatMap(group => [
        group.heading ? (
          <ListSubheader key={`heading-${group.heading}`}>
            {group.heading}
          </ListSubheader>
        ) : null,
        ...group.options.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        )),
      ])}
    </MuiSelect>
  </>
)

export default DataSourceSelect
