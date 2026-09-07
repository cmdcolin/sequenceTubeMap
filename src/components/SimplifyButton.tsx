import { useState } from 'react'
import Button from '@mui/material/Button'
import Switch from '@mui/material/Switch'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear } from '@fortawesome/free-solid-svg-icons'
import PopupDialog from './PopupDialog.tsx'

interface SimplifyButtonProps {
  simplify: boolean
  removeSequences: boolean
  setSimplify: (next: boolean) => void
  setRemoveSequences: (next: boolean) => void
}

export const SimplifyButton = ({
  simplify,
  removeSequences,
  setSimplify,
  setRemoveSequences,
}: SimplifyButtonProps) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="small"
        variant={simplify || removeSequences ? 'contained' : 'outlined'}
        startIcon={<FontAwesomeIcon icon={faGear} />}
        onClick={() => { setOpen(o => !o); }}
      >
        Simplify
      </Button>
      <PopupDialog
        open={open}
        close={() => { setOpen(false); }}
        width="400px"
      >
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <FormControlLabel
            labelPlacement="start"
            label="Remove Small Variants"
            sx={{ justifyContent: 'space-between', ml: 0 }}
            control={
              <Switch
                checked={simplify}
                onChange={() => { setSimplify(!simplify); }}
              />
            }
          />
          <FormControlLabel
            labelPlacement="start"
            label="Remove Node Sequences"
            sx={{ justifyContent: 'space-between', ml: 0 }}
            control={
              <Switch
                checked={removeSequences}
                onChange={() => { setRemoveSequences(!removeSequences); }}
              />
            }
          />
        </Box>
      </PopupDialog>
    </>
  )
}

export default SimplifyButton
