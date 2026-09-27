import { Icon } from './Icon.tsx'
import { faGithub } from './icons.ts'

export const Footer = () => (
  <footer style={{ marginTop: '1.5em' }}>
    <a
      href="https://pangenome.github.io/MemPanG26/"
      target="_blank"
      rel="noopener noreferrer"
    >
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
    </a>
    <div
      style={{
        background: '#f8f9fa',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        fontSize: '0.95em',
      }}
    >
      <div>
        <strong>
          <a
            href="https://github.com/cmdcolin/sequenceTubeMap"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon icon={faGithub} /> seqTubeMaps
          </a>
        </strong>{' '}
        is a fork of the excellent sequenceTubeMap / IVG by the vgteam created
        for hackathon purposes (could be upstreamed potentially).
      </div>
      <div style={{ marginTop: 4 }}>
        Thanks to the organizers for a great{' '}
        <a href="https://pangenome.github.io/MemPanG26/">MemPanG26</a>!
      </div>
    </div>
  </footer>
)

export default Footer
