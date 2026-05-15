import React, { useState } from "react";
import {
  Container,
  Collapse,
  CardBody,
  Card,
  CardHeader,
  Form,
  Label,
  Input,
  FormGroup,
} from "reactstrap";
import TrackSettings from "./TrackSettings";

function VisualizationOptions({
  visOptions,
  toggleFlag,
  tracks,
  setColorSetting,
  handleMappingQualityCutoffChange,
  enableCompressedNodes,
  currentAPIMode,
  setAPIMode,
}) {
  const [isOpenLegend, setIsOpenLegend] = useState(false);
  const [isOpenVisualizationOptions, setIsOpenVisualizationOptions] = useState(true);
  const [isOpenServer, setIsOpenServer] = useState(false);

  const mappingQualityOptions = Array.from(Array(61).keys()).map((i) => (
    <option value={i} key={i}>{i}</option>
  ));

  let readTrackNumber = 1;
  let trackSettingsList = [];
  for (let key in tracks) {
    const track = tracks[key];
    console.log(track);
    if (!track.trackFile) {
      continue;
    }
    const type = track.trackType;
    if (type === "graph") {
      trackSettingsList.push(
        <TrackSettings
          key={key}
          label="Graph Paths"
          fileType={type}
          trackColorSettings={visOptions.colorSchemes[key]}
          setTrackColorSetting={(k, v) => setColorSetting(k, key, v)}
        />
      );
    } else if (type === "haplotype") {
      // TODO: Do nothing for now. Haplotypes get assigned to the graph as their source track right now.
    } else if (type === "node") {
      // TODO: Do nothing for now. Haplotypes get assigned to the graph as their source track right now.
    } else if (type === "read") {
      if (visOptions.showReads) {
        trackSettingsList.push(
          <TrackSettings
            key={key}
            label={"Read Track " + readTrackNumber}
            fileType={type}
            trackColorSettings={visOptions.colorSchemes[key]}
            setTrackColorSetting={(k, v) => setColorSetting(k, key, v)}
          />
        );
        readTrackNumber++;
      }
    } else {
      throw new Error("Unknown track type " + type);
    }
  }

  return (
    <Container>
      <div id="accordion">
        <Card>
          <CardHeader id="legendCard">
            <h5 className="mb-0">
              <a href="#collapse" onClick={(e) => { setIsOpenLegend(!isOpenLegend); e.preventDefault(); }}>
                Legend
              </a>
            </h5>
          </CardHeader>
          <Collapse isOpen={isOpenLegend}>
            <CardBody>
              <div id="legendDiv" />
            </CardBody>
          </Collapse>
        </Card>

        <Card>
          <CardHeader id="visOptionsCard">
            <h5 className="mb-0">
              <a href="#collapse" onClick={(e) => { setIsOpenVisualizationOptions(!isOpenVisualizationOptions); e.preventDefault(); }}>
                Visualization Options
              </a>
            </h5>
          </CardHeader>
          <Collapse isOpen={isOpenVisualizationOptions}>
            <CardBody>
              <FormGroup>
                <h5>General</h5>
                <FormGroup check>
                  <Label check>
                    <Input
                      type="checkbox"
                      checked={visOptions.removeRedundantNodes}
                      onChange={() => toggleFlag("removeRedundantNodes")}
                    />
                    Remove redundant nodes
                  </Label>
                </FormGroup>
                <FormGroup check>
                  <Label check>
                    <Input
                      type="checkbox"
                      checked={visOptions.compressedView}
                      disabled={enableCompressedNodes}
                      onChange={() => toggleFlag("compressedView")}
                    />
                    Compressed view
                  </Label>
                </FormGroup>
                <FormGroup check>
                  <Label check>
                    <Input
                      type="checkbox"
                      checked={visOptions.transparentNodes}
                      onChange={() => toggleFlag("transparentNodes")}
                    />
                    Fully transparent nodes
                  </Label>
                </FormGroup>
              </FormGroup>

              <FormGroup>
                <h5>Sequence Reads</h5>
                <FormGroup check>
                  <Label check>
                    <Input
                      type="checkbox"
                      checked={visOptions.showReads}
                      onChange={() => toggleFlag("showReads")}
                    />
                    Show sequence reads
                  </Label>
                </FormGroup>
                {visOptions.showReads && (
                  <React.Fragment>
                    <FormGroup check>
                      <Label check>
                        <Input
                          type="checkbox"
                          checked={visOptions.showSoftClips}
                          onChange={() => toggleFlag("showSoftClips")}
                        />
                        Show soft clips
                      </Label>
                    </FormGroup>
                    <FormGroup check>
                      <Label check>
                        <Input
                          type="checkbox"
                          checked={visOptions.colorReadsByMappingQuality}
                          onChange={() => toggleFlag("colorReadsByMappingQuality")}
                        />
                        Color reads by mapping quality
                      </Label>
                    </FormGroup>
                    <FormGroup check>
                      <Label check>
                        <Input
                          type="checkbox"
                          checked={visOptions.alphaReadsByMappingQuality}
                          onChange={() => toggleFlag("alphaReadsByMappingQuality")}
                        />
                        Transparency of reads by mapping quality
                      </Label>
                    </FormGroup>
                    <Form>
                      <Label className="mr-sm-2 " for="dataSourceSelect">
                        Mapping Quality Cutoff:
                      </Label>
                      <Input
                        type="select"
                        id="dataSourceSelect"
                        className="custom-select"
                        value={visOptions.mappingQualityCutoff}
                        onChange={(e) => handleMappingQualityCutoffChange(e.target.value)}
                      >
                        {mappingQualityOptions}
                      </Input>
                    </Form>
                  </React.Fragment>
                )}
              </FormGroup>
            </CardBody>
          </Collapse>
        </Card>
        <Card>
          <CardHeader id="serverCard">
            <h5 className="mb-0">
              <a href="#collapse" onClick={(e) => { setIsOpenServer(!isOpenServer); e.preventDefault(); }}>
                Backend Configuration
              </a>
            </h5>
          </CardHeader>
          <Collapse isOpen={isOpenServer}>
            <CardBody>
              <Form>
                <Label className="mr-sm-2 " for="dataSourceSelect">
                  Extract tube map data:
                </Label>
                <Input
                  type="select"
                  id="apiSelect"
                  className="custom-select"
                  value={currentAPIMode}
                  onChange={(e) => setAPIMode(e.target.value)}
                >
                  <option value="server">On remote server</option>
                  <option value="local">In-browser (.gbz.db uploads only!)</option>
                </Input>
              </Form>
            </CardBody>
          </Collapse>
        </Card>
      </div>
    </Container>
  );
}

export default VisualizationOptions;
