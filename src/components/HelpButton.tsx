import { useState } from 'react'
import type { ImgHTMLAttributes } from 'react'
import IconButton from '@mui/material/IconButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons'
import Markdown from 'markdown-to-jsx'
import useSWR from 'swr'
import PopupDialog from './PopupDialog.tsx'

interface HelpButtonProps {
  file: string
}

interface HelpImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  baseURL: URL
}

// Defined outside the component so React sees a stable component type.
function HelpImage({ alt, src, baseURL, ...props }: HelpImageProps) {
  return (
    <img
      alt={alt}
      src={src ? new URL(src, baseURL).toString() : undefined}
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
}

export const HelpButton = ({ file }: HelpButtonProps) => {
  const fileURL = new URL(file, document.baseURI)
  const [open, setOpen] = useState(false)
  const { data, error } = useSWR(file, (f: string) => fetch(f).then(r => r.text()), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  })
  const content = error ? 'Could not fetch help' : (data ?? '')

  const options = {
    overrides: {
      img: { component: HelpImage, props: { baseURL: fileURL } },
      a: {
        component: 'a' as const,
        props: { target: '_blank', rel: 'noopener noreferrer' },
      },
    },
  }

  return (
    <>
      <IconButton
        color="inherit"
        title="Help — region format, controls, and feature reference"
        onClick={() => { setOpen(!open); }}
      >
        <FontAwesomeIcon icon={faCircleQuestion} />
      </IconButton>
      <PopupDialog open={open} close={() => { setOpen(false); }}>
        <div style={{ maxHeight: '80vh', overflowY: 'auto', overflowX: 'hidden' }}>
          <Markdown options={options}>{content}</Markdown>
        </div>
      </PopupDialog>
    </>
  )
}

export default HelpButton
