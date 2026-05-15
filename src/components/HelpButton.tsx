import { useState, useEffect } from 'react'
import type { ImgHTMLAttributes } from 'react'
import { Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faQuestion } from '@fortawesome/free-solid-svg-icons'
import Markdown from 'markdown-to-jsx'
import PopupDialog from './PopupDialog'

interface HelpButtonProps {
  file: string
}

export const HelpButton = ({ file }: HelpButtonProps) => {
  const fileURL = new URL(file, document.baseURI)
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  const [content, setContent] = useState('')

  const Image = ({ alt, src, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
    <img
      alt={alt}
      src={src ? new URL(src, fileURL).toString() : undefined}
      {...props}
      style={{
        margin: '5px 0',
        maxWidth: '90%',
        border: 'solid grey 1px',
        boxShadow: '0 2px 6px 0 rgba(0, 0, 0, 0.2)',
        borderRadius: '5px',
      }}
    />
  )

  const options = {
    overrides: {
      img: { component: Image },
    },
  }

  useEffect(() => {
    fetch(file)
      .then(res => res.text())
      .then(md => {
        setContent(md)
      })
      .catch(() => {
        // If the network drops or the front-end static server isn't available
        // (like in the end to end tests), put something instead of having an
        // unhandled rejection.
        setContent('Could not fetch help')
      })
  }, [file])

  return (
    <>
      <Button
        aria-label="Help"
        title="Help — region format, controls, and feature reference"
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeIcon icon={faQuestion} />
      </Button>
      <PopupDialog open={open} close={close}>
        <div
          style={{ height: '90vh', overflowY: 'scroll', overflowX: 'hidden' }}
        >
          <Markdown options={options}>{content}</Markdown>
        </div>
      </PopupDialog>
    </>
  )
}

export default HelpButton
