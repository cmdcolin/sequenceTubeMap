import React, { useState } from "react";
import { Card, CardHeader, Collapse, CardBody, Button } from "reactstrap";

function PathsPanel({ pathInfo, onLoadPath }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!pathInfo.length) return null;

  return (
    <Card className="mt-2">
      <CardHeader
        onClick={() => setIsOpen(!isOpen)}
        style={{ cursor: "pointer" }}
        className="d-flex justify-content-between align-items-center"
      >
        <span>Paths in this graph</span>
        <span className="text-muted small">{pathInfo.length} paths</span>
      </CardHeader>
      <Collapse isOpen={isOpen}>
        <CardBody style={{ maxHeight: "300px", overflowY: "auto", padding: 0 }}>
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
                      <span className="badge bg-info ms-1" style={{ fontSize: "0.7em" }}>
                        cyclic
                      </span>
                    )}
                  </td>
                  <td>{length !== null ? `${length} bp` : "—"}</td>
                  <td>
                    <Button
                      size="sm"
                      disabled={length === null}
                      onClick={() => onLoadPath(`${name}:0-${length}`)}
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
  );
}

export default PathsPanel;
