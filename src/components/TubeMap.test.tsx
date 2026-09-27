import { render } from '@testing-library/react'
import TubeMap from './TubeMap.tsx'
import { computeExampleData } from './tubeMapData.ts'
import { dataOriginTypes } from '../enums.ts'
import * as demo from '../util/demo-data.js'
import { DEFAULT_VIS_OPTIONS, exampleColorSchemes } from '../util/visOptions.ts'

const example = computeExampleData(dataOriginTypes.EXAMPLE_1, demo)
const visOptions = {
  ...DEFAULT_VIS_OPTIONS,
  colorSchemes: exampleColorSchemes(dataOriginTypes.EXAMPLE_1),
}

function wheelIsCancelled(target: Element): boolean {
  const event = new WheelEvent('wheel', { cancelable: true })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

function tubeMap() {
  return (
    <TubeMap
      nodes={example.nodes}
      tracks={example.tracks}
      reads={example.reads}
      visOptions={visOptions}
    />
  )
}

describe('TubeMap', () => {
  it('releases the wheel listener and hover tooltip when it unmounts', () => {
    const { container, rerender, unmount } = render(tubeMap())
    rerender(tubeMap())
    const tooltips = () =>
      [...document.body.children].filter(child => child !== container)
    container
      .querySelector('[trackID]')!
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(tooltips()).toHaveLength(1)
    expect(wheelIsCancelled(container)).toBe(true)

    unmount()
    expect(tooltips()).toEqual([])
    expect(wheelIsCancelled(container)).toBe(false)
  })

  it('draws again after a redraw released the previous bindings', () => {
    const { container, rerender } = render(tubeMap())
    rerender(
      <TubeMap
        nodes={example.nodes}
        tracks={example.tracks}
        reads={example.reads}
        visOptions={{ ...visOptions, showNodeLabels: true }}
      />,
    )
    expect(container.querySelectorAll('.node-label-group').length).toBe(
      example.nodes.length,
    )
    expect(wheelIsCancelled(container)).toBe(true)
  })
})
