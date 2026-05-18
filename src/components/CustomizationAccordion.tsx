import { Fragment, useState, type ReactNode } from 'react'
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
import type { Palette, VisOptions } from '../Types.ts'

interface CollapsibleCardProps {
  title: string
  headerId: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}

const CollapsibleCard = ({
  title,
  headerId,
  isOpen,
  onToggle,
  children,
}: CollapsibleCardProps) => (
  <Card>
    <CardHeader id={headerId}>
      <h5 className="mb-0">
        <a
          href="#collapse"
          onClick={e => {
            e.preventDefault()
            onToggle()
          }}
        >
          {title}
        </a>
      </h5>
    </CardHeader>
    <Collapse isOpen={isOpen}>
      <CardBody>{children}</CardBody>
    </Collapse>
  </Card>
)

interface VisualizationOptionsProps {
  visOptions: VisOptions
  toggleFlag: (flagName: string) => void
  setNodeLabelColorSetting: (key: string, value: Palette) => void
  handleMappingQualityCutoffChange: (value: string) => void
  enableCompressedNodes?: boolean
  currentAPIMode: string
  setAPIMode: (mode: string) => void
}

function VisualizationOptions({
  visOptions,
  toggleFlag,
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

  const mappingQualityOptions = Array.from({ length: 61 }, (_, i) => (
    <option value={i} key={i}>
      {i}
    </option>
  ))

  return (
    <Container>
      <div id="accordion">
        <CollapsibleCard
          title="Legend"
          headerId="legendCard"
          isOpen={isOpenLegend}
          onToggle={() => { setIsOpenLegend(o => !o); }}
        >
          <div id="legendDiv" />
        </CollapsibleCard>

        <CollapsibleCard
          title="Visualization Options"
          headerId="visOptionsCard"
          isOpen={isOpenVisualizationOptions}
          onToggle={() => { setIsOpenVisualizationOptions(o => !o); }}
        >
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
                          checked={visOptions.bundleReadsByPath}
                          onChange={() => { toggleFlag('bundleReadsByPath'); }}
                        />
                        Bundle reads by path
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
        </CollapsibleCard>
        <CollapsibleCard
          title="Backend Configuration"
          headerId="serverCard"
          isOpen={isOpenServer}
          onToggle={() => { setIsOpenServer(o => !o); }}
        >
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
        </CollapsibleCard>
      </div>
    </Container>
  )
}

export default VisualizationOptions
