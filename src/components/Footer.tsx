import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'

import SafeLink from './SafeLink.tsx'

export const Footer = () => (
  <footer style={{ marginTop: '1.5em' }}>
    <SafeLink href="https://pangenome.github.io/MemPanG26/" target="_blank">
      <img
        src="https://pangenome.github.io/MemPanG26/images/trippy-bridge.png"
        alt="Memphis bridge — MemPanG26"
        style={{
          width: '100%',
          display: 'block',
          maxHeight: 120,
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />
    </SafeLink>
    <div
      style={{
        background: '#f8f9fa',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        fontSize: '0.95em',
      }}
    >
      <SafeLink
        target="_blank"
        href="https://github.com/cmdcolin/sequenceTubeMap"
      >
        <FontAwesomeIcon icon={faGithub} /> More info on this fork
      </SafeLink>
      <div style={{ marginTop: 4 }}>
        MemPanG26 Hackathon Team 2:{' '}
        <SafeLink href="https://github.com/cmdcolin" target="_blank">
          Colin Diesh
        </SafeLink>
        {' & '}
        <SafeLink
          href="https://scholar.google.com/citations?user=Vb6tJA0AAAAJ&hl=en"
          target="_blank"
        >
          Rafeed Rahman Turjya
        </SafeLink>{' '}
        et al.
      </div>
      <div style={{ marginTop: 4 }}>
        Thanks to the organizers for a great{' '}
        <a href="https://pangenome.github.io/MemPanG26/">MemPanG26</a>!
      </div>
    </div>
  </footer>
)

export default Footer
