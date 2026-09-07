import { useState } from 'react'
import { Button } from 'reactstrap'
import Switch from 'react-switch'
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
        size="sm"
        onClick={() => { setOpen(o => !o); }}
        outline
        active={simplify || removeSequences}
      >
        <FontAwesomeIcon icon={faGear} /> Simplify
      </Button>
      <PopupDialog
        open={open}
        close={() => { setOpen(false); }}
        width="400px"
      >
        <div style={{ height: '10vh' }}>
          <label
            className="d-flex align-items-center justify-content-between"
            style={{ marginBottom: '10px' }}
          >
            <span>Remove Small Variants</span>
            <Switch
              onChange={() => { setSimplify(!simplify); }}
              checked={simplify}
            />
          </label>
          <label className="d-flex align-items-center justify-content-between">
            <span>Remove Node Sequences</span>
            <Switch
              onChange={() => { setRemoveSequences(!removeSequences); }}
              checked={removeSequences}
            />
          </label>
        </div>
      </PopupDialog>
    </>
  )
}

export default SimplifyButton
