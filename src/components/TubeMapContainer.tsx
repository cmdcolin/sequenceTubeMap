import { useState, useEffect } from 'react'
import { Container, Row, Alert } from 'reactstrap'

import TubeMap from './TubeMap'
import * as tubeMap from '../util/tubemap'
import type {
  InputNode,
  InputRegion,
  InputTrack,
  VgJson,
  VgRead,
} from '../util/tubemap'
import { dataOriginTypes } from '../enums'
import PopUpInfoDialog, { type InfoAttribute } from './PopUpInfoDialog'
import ReadContextMenu from './ReadContextMenu'
import NodeContextMenu from './NodeContextMenu'
import PendingPanel from './PendingPanel'
import ReadGroupsPanel, { type ReadGroup } from './ReadGroupsPanel'
import { computeExampleData } from './tubeMapData'
import type { APIInterface } from '../api/APIInterface'
import type { ViewTarget, VisOptions } from '../Types'

const GROUP_PALETTE_CYCLE = [
  'reds',
  'blues',
  'ygreys',
  'greys',
  'lightColors',
  'plainColors',
] as const

function paletteForIndex(idx: number): string {
  const palette = GROUP_PALETTE_CYCLE[idx % GROUP_PALETTE_CYCLE.length]
  if (palette === undefined) {
    throw new Error('GROUP_PALETTE_CYCLE indexing failed')
  }
  return palette
}

interface ReadContextMenuState {
  readName: string
  x: number
  y: number
}

interface NodeContextMenuState {
  nodeName: string
  readNames: string[]
  x: number
  y: number
}

interface TubeMapContainerProps {
  viewTarget: ViewTarget
  dataOrigin: string
  visOptions: VisOptions
  APIInterface: APIInterface
}

function TubeMapContainer({
  viewTarget,
  dataOrigin,
  visOptions,
  APIInterface,
}: TubeMapContainerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | string | null>(null)
  const [infoDialogContent, setInfoDialogContent] = useState<
    InfoAttribute[] | undefined
  >(undefined)
  const [readContextMenu, setReadContextMenu] =
    useState<ReadContextMenuState | null>(null)
  const [nodeContextMenu, setNodeContextMenu] =
    useState<NodeContextMenuState | null>(null)
  const [pendingReadSet, setPendingReadSet] = useState<string[]>([])
  const [pendingNodeSet, setPendingNodeSet] = useState<string[]>([])
  const [focusReadNames, setFocusReadNames] = useState<string[] | null>(null)
  const [readGroups, setReadGroups] = useState<ReadGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [groupCounter, setGroupCounter] = useState(0)
  const [otherReadsColor, setOtherReadsColor] = useState('greys')
  const [nodes, setNodes] = useState<InputNode[] | undefined>(undefined)
  const [tracks, setTracks] = useState<InputTrack[] | undefined>(undefined)
  const [reads, setReads] = useState<InputTrack[] | undefined>(undefined)
  const [region, setRegion] = useState<InputRegion | undefined>(undefined)
  const [coloredNodes, setColoredNodes] = useState<string[] | undefined>(
    undefined,
  )

  useEffect(() => {
    const abortController = new AbortController()
    const cancelSignal = abortController.signal

    if (dataOrigin === dataOriginTypes.API) {
      if (Object.keys(viewTarget.tracks).length === 0) {
        // No-tracks case: clear previously-fetched data. setState in effect is
        // intentional here — these values are populated only by this effect's
        // fetches, so the effect is also the right place to clear them.
        /* eslint-disable react-hooks/set-state-in-effect */
        setNodes(undefined)
        setTracks(undefined)
        setReads(undefined)
        setRegion(undefined)
        setColoredNodes(undefined)
        setIsLoading(false)
        setError(null)
        /* eslint-enable react-hooks/set-state-in-effect */
        return
      }
      setIsLoading(true)
      setError(null)
      APIInterface.getChunkedData(viewTarget, cancelSignal)
        .then(json => {
          if (json.graph === undefined) {
            throw new Error('Fetching remote data returned error')
          }
          const readTrackIDs: number[] = []
          let graphTrackID = 0
          let haplotypeTrackID = 0
          for (const i in viewTarget.tracks) {
            const track = viewTarget.tracks[i]
            const trackType = track?.trackType
            if (trackType === 'read') readTrackIDs.push(Number(i))
            else if (trackType === 'graph') graphTrackID = Number(i)
            else if (trackType === 'haplotype') haplotypeTrackID = Number(i)
          }
          const newNodes = tubeMap.vgExtractNodes(json.graph, json.nameMap)
          const newTracks = tubeMap.vgExtractTracks(
            json.graph,
            graphTrackID,
            haplotypeTrackID,
          )
          const readsArr: InputTrack[][] = []
          let totalReads = 0
          for (const gam of json.gam ?? []) {
            const readSourceTrackID = readTrackIDs[readsArr.length] ?? 0
            const newReads = tubeMap.vgExtractReads(
              newNodes,
              newTracks,
              gam,
              totalReads,
              readSourceTrackID,
            )
            readsArr.push(newReads)
            totalReads += newReads.length
          }
          setNodes(newNodes)
          setTracks(newTracks)
          setReads(readsArr.flat())
          setRegion(json.region)
          setColoredNodes(json.coloredNodes)
          setIsLoading(false)
        })
        .catch((err: unknown) => {
          if (!cancelSignal.aborted) {
            console.error('Fetching and parsing getChunkedData failed:', err)
            setError(err instanceof Error ? err : String(err))
            setIsLoading(false)
          }
        })
    } else {
      setIsLoading(true)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      import('../util/demo-data').then(data => {
        const result = computeExampleData(dataOrigin, data)
        setNodes(result.nodes)
        setTracks(result.tracks)
        setReads(result.reads)
        setRegion([])
        setIsLoading(false)
      })
    }

    return () => { abortController.abort(); }
  }, [dataOrigin, viewTarget, APIInterface])

  useEffect(() => {
    tubeMap.setInfoCallback((text: InfoAttribute[]) =>
      { setInfoDialogContent(text); },
    )
    tubeMap.setReadContextMenuCallback((menu: ReadContextMenuState | null) =>
      { setReadContextMenu(menu); },
    )
    tubeMap.setNodeContextMenuCallback((menu: NodeContextMenuState | null) =>
      { setNodeContextMenu(menu); },
    )
  }, [])

  if (error) {
    const message = error instanceof Error ? error.message : String(error)
    return (
      <div id="tubeMapContainer">
        <Container>
          <Row>
            <Alert color="danger">{message}</Alert>
          </Row>
        </Container>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div id="tubeMapContainer">
        <Container>
          <Row>
            <div id="loaderContainer">
              <div id="loader" />
            </div>
          </Row>
        </Container>
      </div>
    )
  }

  // When the user starts editing a fresh set while a filter is active, seed
  // pending with the active filter so adding/removing reads extends the
  // current filter instead of replacing it.
  const editingBase =
    pendingReadSet.length === 0 && focusReadNames !== null
      ? focusReadNames
      : pendingReadSet

  const mergeUnique = (a: string[], b: string[]) => [
    ...a,
    ...b.filter(x => !a.includes(x)),
  ]

  const addNamesToPendingSet = (names: string[]) => {
    setPendingReadSet(mergeUnique(editingBase, names))
    setReadContextMenu(null)
    setNodeContextMenu(null)
  }

  const addNodeToNodeSet = (nodeName: string) => {
    setPendingNodeSet(mergeUnique(pendingNodeSet, [nodeName]))
    setNodeContextMenu(null)
  }

  const addReadsThroughNodeSet = (mode: 'all' | 'any') => {
    addNamesToPendingSet(
      tubeMap.getReadNamesThroughNodes(pendingNodeSet, mode),
    )
  }

  const addReadsToGroup = (groupId: string, names: string[]) => {
    setReadGroups(
      readGroups.map(g =>
        g.id === groupId ? { ...g, reads: mergeUnique(g.reads, names) } : g,
      ),
    )
  }

  const saveSetAsNewGroup = () => {
    if (pendingReadSet.length === 0) return
    const n = groupCounter + 1
    const id = `g${n}`
    setReadGroups([
      ...readGroups,
      {
        id,
        name: `Group ${n}`,
        color: paletteForIndex(groupCounter),
        reads: pendingReadSet,
      },
    ])
    setActiveGroupId(id)
    setGroupCounter(n)
    setPendingReadSet([])
  }

  const addNamesToActiveGroup = (names: string[]) => {
    if (activeGroupId === null || names.length === 0) return
    addReadsToGroup(activeGroupId, names)
    setReadContextMenu(null)
    setNodeContextMenu(null)
  }

  const renameGroup = (id: string, name: string) => {
    setReadGroups(readGroups.map(g => (g.id === id ? { ...g, name } : g)))
  }

  const recolorGroup = (id: string, color: string) => {
    setReadGroups(readGroups.map(g => (g.id === id ? { ...g, color } : g)))
  }

  const deleteGroup = (id: string) => {
    setReadGroups(readGroups.filter(g => g.id !== id))
    if (activeGroupId === id) setActiveGroupId(null)
  }

  const activeGroup = readGroups.find(g => g.id === activeGroupId) ?? null
  const pendingReadActions = [
    {
      label: `Filter to these ${pendingReadSet.length} read${pendingReadSet.length === 1 ? '' : 's'}`,
      hint: 'Hide every other read; show only these.',
      onClick: () => {
        setFocusReadNames(pendingReadSet)
        setPendingReadSet([])
      },
    },
    {
      label: 'Save as group',
      hint: "Color these reads distinctly. Other reads stay visible but use the 'Other' color.",
      onClick: () => { saveSetAsNewGroup(); },
    },
    ...(activeGroup
      ? [
          {
            label: `Add to "${activeGroup.name}"`,
            hint: `Merge these reads into the active group "${activeGroup.name}".`,
            onClick: () => {
              addNamesToActiveGroup(pendingReadSet)
              setPendingReadSet([])
            },
          },
        ]
      : []),
    {
      label: 'Clear set',
      hint: 'Discard the staged reads without filtering or grouping.',
      onClick: () => { setPendingReadSet([]); },
    },
  ]

  const isOpen = infoDialogContent !== undefined

  return (
    <div id="tubeMapContainer">
      <PopUpInfoDialog
        open={isOpen}
        attributes={infoDialogContent}
        close={() => { setInfoDialogContent(undefined); }}
      />
      {pendingNodeSet.length > 0 ? (
        <PendingPanel
          variant="node"
          title={`Node set (${pendingNodeSet.length}):`}
          titleHint="Nodes you've selected; use the actions below to stage reads that travel through them."
          items={pendingNodeSet}
          onRemove={nodeName =>
            { setPendingNodeSet(pendingNodeSet.filter(n => n !== nodeName)); }
          }
          actions={[
            {
              label: `Add reads through all ${pendingNodeSet.length} node${pendingNodeSet.length === 1 ? '' : 's'} (intersection)`,
              hint: 'Only reads whose path visits every node in this set.',
              onClick: () => { addReadsThroughNodeSet('all'); },
            },
            {
              label: 'Add reads through any (union)',
              hint: 'Any read whose path visits at least one node in this set.',
              onClick: () => { addReadsThroughNodeSet('any'); },
            },
            {
              label: 'Clear node set',
              onClick: () => { setPendingNodeSet([]); },
            },
          ]}
        />
      ) : null}
      {pendingReadSet.length > 0 ? (
        <PendingPanel
          variant="read"
          title={`Read set (${pendingReadSet.length}):`}
          titleHint="Reads staged for an action: filter to only these, save as a color group, or merge into the active group."
          items={pendingReadSet}
          onRemove={name =>
            { setPendingReadSet(pendingReadSet.filter(n => n !== name)); }
          }
          actions={pendingReadActions}
        />
      ) : null}
      {readGroups.length > 0 ? (
        <ReadGroupsPanel
          groups={readGroups}
          activeGroupId={activeGroupId}
          otherReadsColor={otherReadsColor}
          onSetActive={id => { setActiveGroupId(id); }}
          onRename={(id, name) => { renameGroup(id, name); }}
          onRecolor={(id, color) => { recolorGroup(id, color); }}
          onDelete={id => { deleteGroup(id); }}
          onRecolorOther={color => { setOtherReadsColor(color); }}
        />
      ) : null}
      {focusReadNames ? (
        <PendingPanel
          variant="filter"
          title={`Showing ${focusReadNames.length} read${focusReadNames.length === 1 ? '' : 's'}:`}
          items={focusReadNames}
          actions={[
            {
              label: 'Clear filter',
              onClick: () => { setFocusReadNames(null); },
            },
          ]}
        />
      ) : null}
      <div id="tubeMapSVG">
        {nodes !== undefined && tracks !== undefined ? (
          <TubeMap
            nodes={nodes}
            tracks={tracks}
            reads={reads}
            region={region}
            visOptions={{
              coloredNodes,
              ...visOptions,
              focusReadNames,
              readGroups,
              otherReadsColor,
            }}
            nodeSequences={!viewTarget.removeSequences}
          />
        ) : null}
      </div>
      {readContextMenu ? (
        <ReadContextMenu
          readName={readContextMenu.readName}
          x={readContextMenu.x}
          y={readContextMenu.y}
          alreadyInSet={editingBase.includes(readContextMenu.readName)}
          activeGroup={activeGroup}
          alreadyInActiveGroup={
            activeGroup
              ? activeGroup.reads.includes(readContextMenu.readName)
              : false
          }
          onFilter={name => {
            setFocusReadNames([name])
            setReadContextMenu(null)
          }}
          onAddToSet={name => { addNamesToPendingSet([name]); }}
          onAddToActiveGroup={name => { addNamesToActiveGroup([name]); }}
          onClose={() => { setReadContextMenu(null); }}
        />
      ) : null}
      {nodeContextMenu ? (
        <NodeContextMenu
          nodeName={nodeContextMenu.nodeName}
          readNames={nodeContextMenu.readNames}
          alreadyInNodeSet={pendingNodeSet.includes(nodeContextMenu.nodeName)}
          x={nodeContextMenu.x}
          y={nodeContextMenu.y}
          activeGroup={activeGroup}
          onAddReadsToSet={names => { addNamesToPendingSet(names); }}
          onAddReadsToActiveGroup={names => { addNamesToActiveGroup(names); }}
          onAddNodeToNodeSet={name => { addNodeToNodeSet(name); }}
          onClose={() => { setNodeContextMenu(null); }}
        />
      ) : null}
    </div>
  )
}

export default TubeMapContainer
