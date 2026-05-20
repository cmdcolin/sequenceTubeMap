import { Container, Row, Col, Navbar, Nav, NavItem } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { faDna } from '@fortawesome/free-solid-svg-icons'

import SafeLink from './SafeLink.tsx'

import PACKAGE from '../../package.json'

export const Footer = () => {
  return (
    <Container tag="footer" fluid={true} style={{ marginTop: '1em' }}>
      <Row className="bg-light">
        <Col lg={{ offset: 2, size: 8 }}>
          <Navbar>
            <Nav className="mr-auto">
              <NavItem>
                <SafeLink
                  className="nav-link"
                  target="_blank"
                  href="https://github.com/cmdcolin/sequenceTubeMap"
                >
                  <FontAwesomeIcon icon={faGithub} /> Github (MemPanG26 fork)
                </SafeLink>
              </NavItem>
              <NavItem>
                <SafeLink
                  className="nav-link"
                  target="_blank"
                  href="https://github.com/vgteam/sequenceTubeMap"
                >
                  <FontAwesomeIcon icon={faGithub} /> Upstream
                </SafeLink>
              </NavItem>
              <NavItem>
                <SafeLink
                  className="nav-link"
                  target="_blank"
                  href="https://genomics.ucsc.edu/"
                >
                  <FontAwesomeIcon icon={faDna} /> UCSC GI
                </SafeLink>
              </NavItem>
            </Nav>
            <Nav>
              <NavItem style={{ fontSize: '0.85em', color: '#555' }}>
                MemPanG26 Edition &mdash; Hackathon Team 2:{' '}
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
              </NavItem>
              <NavItem style={{ fontSize: '0.85em', color: '#888', marginLeft: '1em' }}>
                {PACKAGE.name} v{PACKAGE.version}
              </NavItem>
            </Nav>
          </Navbar>
        </Col>
      </Row>
    </Container>
  )
}

export default Footer
