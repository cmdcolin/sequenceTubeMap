import { Container, Row, Col } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'

import SafeLink from './SafeLink.tsx'

export const Footer = () => {
  return (
    <Container tag="footer" fluid={true} style={{ marginTop: '1em' }}>
      <Row className="bg-light">
        <Col lg={{ offset: 2, size: 8 }} className="py-2 text-center">
          <SafeLink
            target="_blank"
            href="https://github.com/cmdcolin/sequenceTubeMap"
          >
            <FontAwesomeIcon icon={faGithub} /> Click to see the list of
            differences on this fork
          </SafeLink>
        </Col>
      </Row>
    </Container>
  )
}

export default Footer
