import { useState } from 'react'
import type { ReactNode } from 'react'
import { Modal, ModalHeader, ModalBody } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'

interface HelpDialogProps {
  title: string
  children: ReactNode
}

function HelpDialog({ title, children }: HelpDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <FontAwesomeIcon
        icon={faCircleInfo}
        className="help-dialog-icon ms-1"
        style={{ fontSize: '0.85em', cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      />
      <Modal isOpen={open} toggle={() => { setOpen(false); }}>
        <ModalHeader toggle={() => { setOpen(false); }}>{title}</ModalHeader>
        <ModalBody>{children}</ModalBody>
      </Modal>
    </>
  )
}

export default HelpDialog
