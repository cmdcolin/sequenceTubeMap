// SVG path data for the shapes a layout leaves as coordinates: a curve's
// ribbon and a node's rounded outline. Both are strings so the same geometry
// draws as an SVG `d` attribute or, through Path2D, on a canvas.
import type { Node, TrackCurve, TrackType } from './types.ts'

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group === undefined) {
      groups.set(k, [item])
    } else {
      group.push(item)
    }
  }
  return groups
}

function compareCurvesByXYStartValue(a: TrackCurve, b: TrackCurve): number {
  if (a.xStart < b.xStart) return 1
  else if (a.xStart > b.xStart) return -1
  else if (a.yStart > b.yStart) return 1
  else if (a.yStart < b.yStart) return -1
  return 0
}

// Where a curve leaves and enters: a node, or a gap at an order slot
function curveEnds(curve: TrackCurve): [number, number, number, number] {
  return [
    curve.nodeStart ?? -1,
    curve.nodeEnd ?? -1,
    curve.nodeStart === null ? curve.orderStart : -1,
    curve.nodeEnd === null ? curve.orderEnd : -1,
  ]
}

function compareTuples(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i]! - b[i]!
    if (d !== 0) return d
  }
  return 0
}

// The curves of one track type in draw order, each with its `path` set. Curves
// between the same pair of nodes, or gaps, form a group whose control points
// fan out, so a bundle of tracks changing lanes together stays parallel rather
// than crossing at one x.
export function curvePaths(
  curves: readonly TrackCurve[],
  type: TrackType | undefined,
): TrackCurve[] {
  const groupedCurves = groupBy(
    curves.filter(curve => curve.type === type),
    curve => curveEnds(curve).join(','),
  )

  groupedCurves.forEach(curveGroup => {
    // Control point adjustment range: 30% to 70% of the original x values
    let adjustValue = 0.3
    let adjustIncrement = 0.4 / curveGroup.length

    // Ignore Beziar Curve skewing when a group is not too big
    if (curveGroup.length <= 5) {
      adjustValue = 0.5
      adjustIncrement = 0
    }

    curveGroup.sort(compareCurvesByXYStartValue)

    curveGroup.forEach(curve => {
      let xAdjusted: number
      // NextAdjusted is used to try to draw a parallel curve on the way back
      let xNextAdjusted: number
      if (curve.yStart < curve.yEnd) {
        xAdjusted =
          curve.xStart + (curve.xEnd - curve.xStart) * (1 - adjustValue)
        adjustValue += adjustIncrement
        xNextAdjusted =
          curve.xStart + (curve.xEnd - curve.xStart) * (1 - adjustValue)
      } else {
        xAdjusted = curve.xStart + (curve.xEnd - curve.xStart) * adjustValue
        adjustValue += adjustIncrement
        xNextAdjusted = curve.xStart + (curve.xEnd - curve.xStart) * adjustValue
      }
      let d = `M ${curve.xStart} ${curve.yStart}`
      d += ` C ${xAdjusted} ${curve.yStart} ${xAdjusted} ${curve.yEnd} ${curve.xEnd} ${curve.yEnd}`
      d += ` V ${curve.yEnd + curve.width}`
      d += ` C ${xNextAdjusted} ${curve.yEnd + curve.width} ${xNextAdjusted} ${
        curve.yStart + curve.width
      } ${curve.xStart} ${curve.yStart + curve.width}`
      d += ' Z'
      curve.path = d
    })
  })

  // One flat list ordered by group, then by the within-group sort
  return [...groupedCurves.values()]
    .sort((a, b) => compareTuples(curveEnds(a[0]!), curveEnds(b[0]!)))
    .flat()
}

// A node's outline: a rounded box 9 units outside the node's x extent and its
// content height, the tracks through it inside.
export function nodeOutlinePath(node: Node): string {
  // top left arc
  let d = `M ${node.x - 9} ${node.y} Q ${node.x - 9} ${node.y - 9} ${
    node.x
  } ${node.y - 9}`
  let x = node.x
  let y = node.y - 9

  // top straight
  if (node.width > 1) {
    x += node.pixelWidth
    d += ` L ${x} ${y}`
  }

  // top right arc
  d += ` Q ${x + 9} ${y} ${x + 9} ${y + 9}`
  x += 9
  y += 9

  // right straight
  if (node.contentHeight > 0) {
    y += node.contentHeight
    d += ` L ${x} ${y}`
  }

  // bottom right arc
  d += ` Q ${x} ${y + 9} ${x - 9} ${y + 9}`
  x -= 9
  y += 9

  // bottom straight
  if (node.width > 1) {
    x -= node.pixelWidth
    d += ` L ${x} ${y}`
  }

  // bottom left arc
  d += ` Q ${x - 9} ${y} ${x - 9} ${y - 9}`
  x -= 9
  y -= 9

  // left straight
  if (node.contentHeight > 0) {
    y -= node.contentHeight
    d += ` L ${x} ${y}`
  }
  return d
}
