import { Container, Row, Col } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'

import SafeLink from './SafeLink.tsx'

export const Footer = () => {
  return (
    <Container tag="footer" fluid={true} style={{ marginTop: '1em' }}>
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
      <Row className="bg-light">
        <Col lg={{ offset: 2, size: 8 }} className="py-2 text-center">
          <div>
            <SafeLink
              target="_blank"
              href="https://github.com/cmdcolin/sequenceTubeMap"
            >
              <FontAwesomeIcon icon={faGithub} /> Click for more info on this
              fork
            </SafeLink>
          </div>
          <div style={{ fontSize: '0.85em', color: '#555', marginTop: 4 }}>
            MemPanG26 Hackathon Team 2:{' '}
            <SafeLink
              href="https://github.com/cmdcolin"
              target="_blank"
              style={{ color: 'inherit' }}
            >
              Colin Diesh
            </SafeLink>
            {' & '}
            <SafeLink
              href="https://scholar.google.com/citations?user=Vb6tJA0AAAAJ&hl=en"
              target="_blank"
              style={{ color: 'inherit' }}
            >
              Rafeed Rahman Turjya
            </SafeLink>
          </div>
          <div style={{ color: '#777', marginTop: 4 }}>
            Thanks to the organizers for a great{' '}
            <a href="https://pangenome.github.io/MemPanG26/">MemPanG26</a>!
          </div>
        </Col>
      </Row>
    </Container>
  )
}

export default Footer
