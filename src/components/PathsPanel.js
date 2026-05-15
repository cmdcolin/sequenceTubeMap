import React, { useState } from 'react'
import { Card, CardHeader, Collapse, CardBody, Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronRight,
  faChevronDown,
} from '@fortawesome/free-solid-svg-icons'

function PathsPanel({ pathInfo, onLoadPath }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!pathInfo.length) return null

  return (
    <Card className="mt-2">
      <CardHeader
        onClick={() => setIsOpen(!isOpen)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        className="d-flex justify-content-between align-items-center"
        role="button"
        aria-expanded={isOpen}
      >
        <span>
          <FontAwesomeIcon
            icon={isOpen ? faChevronDown : faChevronRight}
            className="me-2"
            style={{ width: 12 }}
          />
          Paths in this graph
        </span>
        <span className="text-muted small">
          {pathInfo.length} paths{' '}
          {isOpen ? '(click to collapse)' : '(click to expand)'}
        </span>
      </CardHeader>
      <Collapse isOpen={isOpen}>
        <CardBody style={{ maxHeight: '300px', overflowY: 'auto', padding: 0 }}>
          <table className="table table-sm table-hover mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Length</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pathInfo.map(({ name, length, cyclic }) => (
                <tr key={name}>
                  <td>
                    {name}
                    {cyclic && (
                      <span
                        className="badge bg-info ms-1"
                        style={{ fontSize: '0.7em' }}
                      >
                        cyclic
                      </span>
                    )}
                  </td>
                  <td>{length !== null ? `${length} bp` : '—'}</td>
                  <td>
                    <Button
                      size="sm"
                      disabled={length === null}
                      onClick={() => onLoadPath(`${name}:0-${length - 1}`)}
                    >
                      Load
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Collapse>
    </Card>
  )
}

export default PathsPanel
