import { useState } from 'react'
import type { ReactNode } from 'react'
import { Modal, ModalHeader, ModalBody } from 'reactstrap'

interface HelpDialogProps {
  title: string
  children: ReactNode
}

function HelpDialog({ title, children }: HelpDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="btn btn-link btn-sm p-0 ms-2 align-baseline"
        style={{ fontSize: '0.8em' }}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        What is this?
      </button>
      <Modal isOpen={open} toggle={() => { setOpen(false); }}>
        <ModalHeader toggle={() => { setOpen(false); }}>{title}</ModalHeader>
        <ModalBody>{children}</ModalBody>
      </Modal>
    </>
  )
}

export default HelpDialog
