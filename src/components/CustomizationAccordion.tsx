import { Fragment, useState } from 'react'
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
} from 'reactstrap'
import TrackSettings from './TrackSettings.tsx'
import type { Palette, PaletteField, Tracks, VisOptions } from '../Types.ts'

interface VisualizationOptionsProps {
  visOptions: VisOptions
  toggleFlag: (flagName: string) => void
  tracks: Tracks
  setColorSetting: (
    key: PaletteField,
    index: number,
    value: Palette,
  ) => void
  setNodeLabelColorSetting: (key: string, value: Palette) => void
  handleMappingQualityCutoffChange: (value: string) => void
  enableCompressedNodes?: boolean
  currentAPIMode: string
  setAPIMode: (mode: string) => void
}

function VisualizationOptions({
  visOptions,
  toggleFlag,
  tracks,
  setColorSetting,
  setNodeLabelColorSetting,
  handleMappingQualityCutoffChange,
  enableCompressedNodes,
  currentAPIMode,
  setAPIMode,
}: VisualizationOptionsProps) {
  const [isOpenLegend, setIsOpenLegend] = useState(false)
  const [isOpenVisualizationOptions, setIsOpenVisualizationOptions] =
    useState(true)
  const [isOpenServer, setIsOpenServer] = useState(false)

  const mappingQualityOptions = Array.from(Array(61).keys()).map(i => (
    <option value={i} key={i}>
      {i}
    </option>
  ))

  let readTrackNumber = 1
  const trackSettingsList: React.ReactNode[] = []
  tracks.forEach((track, idx) => {
    if (!track.trackFile) return
    const type = track.trackType
    if (type === 'graph') {
      trackSettingsList.push(
        <TrackSettings
          key={idx}
          label="Graph Paths"
          fileType={type}
          trackColorSettings={visOptions.colorSchemes[idx]}
          setTrackColorSetting={(k, v) =>
            { setColorSetting(k, idx, v); }
          }
        />,
      )
    } else if (type === 'haplotype' || type === 'node') {
      // Haplotypes get assigned to the graph as their source track for now.
    } else if (type === 'read') {
      if (visOptions.showReads) {
        trackSettingsList.push(
          <TrackSettings
            key={idx}
            label={'Read Track ' + readTrackNumber}
            fileType={type}
            trackColorSettings={visOptions.colorSchemes[idx]}
            setTrackColorSetting={(k, v) =>
              { setColorSetting(k, idx, v); }
            }
          />,
        )
        readTrackNumber++
      }
    } else {
      throw new Error('Unknown track type ' + type)
    }
  })

  return (
    <Container>
      <div id="accordion">
        <Card>
          <CardHeader id="legendCard">
            <h5 className="mb-0">
              <a
                href="#collapse"
                onClick={e => {
                  setIsOpenLegend(!isOpenLegend)
                  e.preventDefault()
                }}
              >
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
              <a
                href="#collapse"
                onClick={e => {
                  setIsOpenVisualizationOptions(!isOpenVisualizationOptions)
                  e.preventDefault()
                }}
              >
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
                      onChange={() => { toggleFlag('removeRedundantNodes'); }}
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
                      onChange={() => { toggleFlag('compressedView'); }}
                    />
                    Compressed view
                  </Label>
                </FormGroup>
                <FormGroup check>
                  <Label check>
                    <Input
                      type="checkbox"
                      checked={visOptions.transparentNodes}
                      onChange={() => { toggleFlag('transparentNodes'); }}
                    />
                    Fully transparent nodes
                  </Label>
                </FormGroup>
                <FormGroup check>
                  <Label check>
                    <Input
                      type="checkbox"
                      checked={visOptions.showNodeLabels}
                      onChange={() => { toggleFlag('showNodeLabels'); }}
                    />
                    Show node labels
                  </Label>
                </FormGroup>
                {visOptions.showNodeLabels && (
                  <TrackSettings
                    fileType="nodeLabel"
                    label="Node Label"
                    trackColorSettings={visOptions.nodeLabelColorScheme}
                    setTrackColorSetting={(k, v) =>
                      { setNodeLabelColorSetting(k, v); }
                    }
                  />
                )}
              </FormGroup>

              <FormGroup>
                <h5>Sequence Reads</h5>
                <FormGroup check>
                  <Label check>
                    <Input
                      type="checkbox"
                      checked={visOptions.showReads}
                      onChange={() => { toggleFlag('showReads'); }}
                    />
                    Show sequence reads
                  </Label>
                </FormGroup>
                {visOptions.showReads && (
                  <Fragment>
                    <FormGroup check>
                      <Label check>
                        <Input
                          type="checkbox"
                          checked={visOptions.showSoftClips}
                          onChange={() => { toggleFlag('showSoftClips'); }}
                        />
                        Show soft clips
                      </Label>
                    </FormGroup>
                    <FormGroup check>
                      <Label check>
                        <Input
                          type="checkbox"
                          checked={visOptions.colorReadsByMappingQuality}
                          onChange={() =>
                            { toggleFlag('colorReadsByMappingQuality'); }
                          }
                        />
                        Color reads by mapping quality
                      </Label>
                    </FormGroup>
                    <FormGroup check>
                      <Label check>
                        <Input
                          type="checkbox"
                          checked={visOptions.alphaReadsByMappingQuality}
                          onChange={() =>
                            { toggleFlag('alphaReadsByMappingQuality'); }
                          }
                        />
                        Transparency of reads by mapping quality
                      </Label>
                    </FormGroup>
                    <Form>
                      <Label
                        className="me-sm-2 "
                        htmlFor="mappingQualitySelect"
                      >
                        Mapping Quality Cutoff:
                      </Label>
                      <Input
                        type="select"
                        id="mappingQualitySelect"
                        className="custom-select"
                        value={visOptions.mappingQualityCutoff}
                        onChange={e =>
                          { handleMappingQualityCutoffChange(e.target.value); }
                        }
                      >
                        {mappingQualityOptions}
                      </Input>
                    </Form>
                  </Fragment>
                )}
              </FormGroup>
            </CardBody>
          </Collapse>
        </Card>
        <Card>
          <CardHeader id="serverCard">
            <h5 className="mb-0">
              <a
                href="#collapse"
                onClick={e => {
                  setIsOpenServer(!isOpenServer)
                  e.preventDefault()
                }}
              >
                Backend Configuration
              </a>
            </h5>
          </CardHeader>
          <Collapse isOpen={isOpenServer}>
            <CardBody>
              <Form>
                <Label className="me-sm-2 " htmlFor="apiSelect">
                  Extract tube map data:
                </Label>
                <Input
                  type="select"
                  id="apiSelect"
                  className="custom-select"
                  value={currentAPIMode}
                  onChange={e => { setAPIMode(e.target.value); }}
                >
                  <option value="server">On remote server</option>
                  <option value="local">
                    In-browser (.gbz.db uploads only!)
                  </option>
                </Input>
              </Form>
            </CardBody>
          </Collapse>
        </Card>
      </div>
    </Container>
  )
}

export default VisualizationOptions
