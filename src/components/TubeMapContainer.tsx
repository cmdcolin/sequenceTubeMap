import { useState, useEffect, useSyncExternalStore } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

import TubeMap from './TubeMap.tsx'
import * as tubeMap from '../util/tubemap.ts'
import PopUpInfoDialog, { type InfoAttribute } from './PopUpInfoDialog.tsx'
import ReadContextMenu from './ReadContextMenu.tsx'
import NodeContextMenu from './NodeContextMenu.tsx'
import PendingPanel from './PendingPanel.tsx'
import DownloadProgressPanel from './DownloadProgressPanel.tsx'
import ReadGroupsPanel, { type ReadGroup } from './ReadGroupsPanel.tsx'
import Legend from './Legend.tsx'
import type { TubeMapData } from './tubeMapData.ts'
import type { InputTrack } from '../util/tubemap.ts'
import { useKeyboardShortcuts } from './useKeyboardShortcuts.ts'
import type {
  ColorPaletteName,
  Palette,
  Tracks,
  ViewTarget,
  VisOptions,
} from '../Types.ts'
import { mergeUnique, subsampleReads } from '../util/array.ts'
import { errorMessage } from '../util/error.ts'
import { dataOriginTypes } from '../enums.ts'

const GROUP_PALETTE_CYCLE: ColorPaletteName[] = [
  'reds',
  'blues',
  'ygreys',
  'greys',
  'lightColors',
  'plainColors',
]

function paletteForIndex(idx: number): ColorPaletteName {
  return GROUP_PALETTE_CYCLE[idx % GROUP_PALETTE_CYCLE.length] ?? 'greys'
}

// User-pickable caps for read rendering. The smallest value is the default;
// anything larger surfaces a "may freeze the browser" warning next to the
// chooser. `null` means render every read. Defaults are aggressive (100) so
// even pathological coverage stays interactive on first render — the user
// can always opt into more via the chooser.
const READ_LIMIT_PRESETS = [100, 500, 2000, 10000] as const

// Default cap, exported so PathsPanel's "heavy" badge fires at the same
// threshold the renderer will actually subsample at — otherwise the badge's
// meaning ("this will be subsampled by default") drifts from reality.
export const DEFAULT_READ_RENDER_LIMIT = READ_LIMIT_PRESETS[0]

// The presets plus "render everything", as offered by the banner's buttons.
const READ_LIMIT_CHOICES: (number | null)[] = [...READ_LIMIT_PRESETS, null]

// Cap on the graph itself. Drawing cost tracks how many nodes the haplotype
// walks visit between them, because the renderer emits a ribbon segment per
// visit — nodes alone say little, since one node visited by 464 haplotypes
// costs 464 segments.
//
// Measured in Chrome on the HPRC v2.1 graph, which draws every haplotype: the
// chr20 microsatellite in the README is 14,518 visits; a 10 kb MHC window is
// 73,282, draws in a second and then takes 400 ms per zoom step; a 50 kb one is
// 495,391 and takes 10 s to draw. So the cap sits above the first and below the
// second. Cost is superlinear in the window — the same locus at 2 kb is only
// 2,146 visits — which is why this counts what arrived rather than predicting
// from the region.
export const GRAPH_RENDER_LIMIT = 30_000

// The coarsened view draws a haplotype-only graph as one band per edge, not a
// ribbon per visit. Coarsened, a 50 kb MHC window draws in 1.3 s and zooms at
// 85 ms a step; a 150 kb one (1,975,561 visits) takes 4 s and 300 ms or more.
export const COARSENED_GRAPH_RENDER_LIMIT = 1_000_000

export function graphNodeVisits(tracks: InputTrack[]): number {
  return tracks.reduce((sum, track) => sum + track.sequence.length, 0)
}

// The layout coarsens the haplotypes themselves only when there are no reads
// for the coarsened view to collapse instead.
export function graphRenderLimit(
  visOptions: Pick<VisOptions, 'showReads' | 'coarsenedReadView'>,
  readCount: number,
): number {
  return visOptions.showReads && visOptions.coarsenedReadView && readCount === 0
    ? COARSENED_GRAPH_RENDER_LIMIT
    : GRAPH_RENDER_LIMIT
}

function LargeGraphNotice({
  nodeVisits,
  walks,
  limit,
  onCoarsen,
  onDrawAnyway,
}: {
  nodeVisits: number
  walks: number
  limit: number
  onCoarsen: (() => void) | undefined
  onDrawAnyway: () => void
}) {
  return (
    <Box sx={{ px: 2 }}>
      <Alert
        severity="warning"
        sx={{ '& .MuiAlert-action': { flexShrink: 0 } }}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {onCoarsen ? (
              <Button
                color="warning"
                variant="contained"
                size="small"
                onClick={() => {
                  onCoarsen()
                }}
              >
                Coarsen
              </Button>
            ) : null}
            <Button
              color="warning"
              variant="outlined"
              size="small"
              onClick={() => {
                onDrawAnyway()
              }}
            >
              Draw anyway
            </Button>
          </Box>
        }
      >
        <strong>
          This region is {nodeVisits.toLocaleString()} node visits across{' '}
          {walks.toLocaleString()} haplotype{walks === 1 ? '' : 's'}
        </strong>{' '}
        — more than the {limit.toLocaleString()} this draws without asking, past
        which the map is slow to draw and slower to zoom.{' '}
        {onCoarsen
          ? 'Coarsen the view to draw the haplotypes as one band per edge, which handles windows many times wider, or narrow the region.'
          : 'Narrow the region and it will draw straight away; a graph with many haplotypes gets expensive within a few kb.'}
      </Alert>
    </Box>
  )
}

function ReadRenderLimitBanner({
  totalReads,
  limit,
  onChange,
}: {
  totalReads: number
  limit: number | null
  onChange: (limit: number | null) => void
}) {
  // Local draft so the user can type freely without each keystroke retriggering
  // a 5k-read re-layout. Committed on Enter or blur. Synced from the canonical
  // `limit` prop when it changes externally (e.g. region change resets it, or
  // the "Render all" button is clicked).
  const [draft, setDraft] = useState(limit === null ? '' : String(limit))
  const [lastLimitProp, setLastLimitProp] = useState(limit)
  if (limit !== lastLimitProp) {
    setLastLimitProp(limit)
    setDraft(limit === null ? '' : String(limit))
  }

  const shown = limit === null ? totalReads : Math.min(limit, totalReads)
  const capped = limit !== null && totalReads > limit

  function commitDraft() {
    if (draft.trim() === '') {
      onChange(null)
      return
    }
    const n = Number(draft)
    if (Number.isFinite(n) && n > 0) {
      onChange(Math.floor(n))
    } else {
      setDraft(limit === null ? '' : String(limit))
    }
  }

  return (
    <Alert
      severity={capped ? 'warning' : 'info'}
      sx={{ margin: '0 20px 8px', padding: '0 12px', fontSize: 13 }}
    >
      <strong>
        Showing {shown.toLocaleString()} of {totalReads.toLocaleString()} reads
      </strong>
      {capped
        ? ' (subsampled to keep the browser responsive). '
        : ' (all reads). '}
      Subsample to:{' '}
      <input
        type="number"
        min={1}
        value={draft}
        placeholder="all"
        onChange={e => {
          setDraft(e.target.value)
        }}
        onBlur={() => {
          commitDraft()
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitDraft()
          }
        }}
        style={{ width: 90, fontSize: 13 }}
      />{' '}
      reads.{' '}
      {READ_LIMIT_CHOICES.map(choice => (
        <button
          key={choice ?? 'all'}
          type="button"
          onClick={() => {
            onChange(choice)
          }}
          style={{
            marginLeft: 4,
            padding: '0 6px',
            fontSize: 12,
            background: limit === choice ? '#cce5ff' : 'transparent',
            border: '1px solid #999',
            borderRadius: 3,
            cursor: 'pointer',
          }}
          title={
            choice === null
              ? 'Render every read (may freeze the browser for high-coverage regions)'
              : undefined
          }
        >
          {choice === null ? 'all' : choice.toLocaleString()}
        </button>
      ))}
    </Alert>
  )
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
  // The fetch lives in App (see its useSWR call) so the Go button can show
  // that a load is in flight and the previous region can stay on screen while
  // the next one arrives.
  data: TubeMapData | undefined
  error: Error | undefined
  isValidating: boolean
  onRetry: () => void
  // Cap on how many reads get rendered, persisted by App as a preference.
  // Each new region starts from it again.
  readRenderLimit: number | null
  onReadRenderLimitChange: (limit: number | null) => void
  legendVisible: boolean
  // What the legend describes, chosen by App so the panel and a saved figure
  // agree.
  legendTracks: Tracks
  onLegendClose: () => void
  // Switches on the coarsened view, offered when a region is too big to draw
  // without it
  onCoarsen: () => void
}

function TubeMapContainer({
  viewTarget,
  dataOrigin,
  visOptions,
  data,
  error,
  isValidating,
  onRetry,
  readRenderLimit: readRenderLimitPreference,
  onReadRenderLimitChange,
  legendVisible,
  legendTracks,
  onLegendClose,
  onCoarsen,
}: TubeMapContainerProps) {
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
  const [otherReadsColor, setOtherReadsColor] = useState<Palette>('greys')
  // The legend describes the drawing, so it reads what the last draw used
  const renderedColoring = useSyncExternalStore(
    tubeMap.subscribeRenderedColoring,
    tubeMap.getRenderedColoringSnapshot,
  )
  // Render-time cap on reads. Deep-coverage regions can produce 5k+ reads,
  // which inflate the tube-map layout to ~150k SVG elements and freeze the
  // browser. `null` means render all.
  const [readRenderLimit, setReadRenderLimit] = useState<number | null>(
    readRenderLimitPreference,
  )
  // Set by "Draw anyway" on the size notice, for this view only.
  const [drawLargeGraph, setDrawLargeGraph] = useState(false)
  const { nodes, tracks, reads, region, coloredNodes } = data ?? {}

  // Everything the user staged for the region they were looking at (read
  // groups, the pending read/node sets, the read filter and the render cap)
  // describes that region's reads, so a different dataset starts over.
  // Adjusted during render rather than in an effect, and rather than by
  // remounting on a key, which would also throw away the previous render and
  // defeat keepPreviousData. See
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const datasetKey = [
    dataOrigin,
    viewTarget.region,
    ...viewTarget.tracks.map(t => t.trackFile ?? ''),
  ].join('|')
  const [lastDatasetKey, setLastDatasetKey] = useState(datasetKey)
  if (datasetKey !== lastDatasetKey) {
    setLastDatasetKey(datasetKey)
    setPendingReadSet([])
    setPendingNodeSet([])
    setFocusReadNames(null)
    setReadGroups([])
    setActiveGroupId(null)
    setGroupCounter(0)
    setReadContextMenu(null)
    setNodeContextMenu(null)
    setReadRenderLimit(readRenderLimitPreference)
    setDrawLargeGraph(false)
  }

  const changeReadRenderLimit = (limit: number | null) => {
    setReadRenderLimit(limit)
    onReadRenderLimitChange(limit)
  }

  useEffect(() => {
    tubeMap.setInfoCallback((text: InfoAttribute[]) => {
      setInfoDialogContent(text)
    })
    tubeMap.setReadContextMenuCallback((menu: ReadContextMenuState | null) => {
      setReadContextMenu(menu)
    })
    tubeMap.setNodeContextMenuCallback((menu: NodeContextMenuState | null) => {
      setNodeContextMenu(menu)
    })
  }, [])

  // Whether anything is selected to look at. Freshly uploaded files and a
  // backend with nothing mounted both land here, and a blank page reads as a
  // broken app rather than as a waiting one.
  const hasView =
    dataOrigin !== dataOriginTypes.API || viewTarget.tracks.length > 0

  // Name what is being fetched, so a slow load says what it is waiting on
  // instead of spinning anonymously.
  const loader = (
    <div id="loaderContainer" role="status" aria-live="polite">
      <div id="loader" />
      <div id="loaderLabel">
        {dataOrigin === dataOriginTypes.API
          ? `Loading ${viewTarget.region}…`
          : 'Loading example data…'}
      </div>
      <DownloadProgressPanel />
    </div>
  )

  // Rendered above the tube map rather than in place of it, so a failed
  // fetch doesn't throw away the staged read/node sets, the read groups and
  // the legend. Nothing has ever rendered for this view when the loader shows
  // here, so it takes the place of the map instead of covering it.
  const status = !hasView ? (
    <Box sx={{ px: 2, py: 6, textAlign: 'center', color: 'text.secondary' }}>
      Nothing loaded. Pick a dataset from the <strong>Examples</strong> menu, or
      choose your own files under <strong>File</strong> and press{' '}
      <strong>Go</strong>.
    </Box>
  ) : error ? (
    <Box sx={{ px: 2 }}>
      <Alert
        severity="error"
        action={
          <Button
            color="error"
            variant="outlined"
            size="small"
            sx={{ flexShrink: 0 }}
            onClick={() => {
              onRetry()
            }}
          >
            Retry
          </Button>
        }
      >
        {errorMessage(error)}
      </Alert>
    </Box>
  ) : data === undefined ? (
    <Box sx={{ px: 2 }}>{loader}</Box>
  ) : null

  // When the user starts editing a fresh set while a filter is active, seed
  // pending with the active filter so adding/removing reads extends the
  // current filter instead of replacing it.
  const editingBase =
    pendingReadSet.length === 0 && focusReadNames !== null
      ? focusReadNames
      : pendingReadSet

  const addNamesToPendingSet = (names: string[]) => {
    setPendingReadSet(mergeUnique(editingBase, names))
    setReadContextMenu(null)
    setNodeContextMenu(null)
  }

  const addNodeToNodeSet = (nodeName: string) => {
    setPendingNodeSet(prev => mergeUnique(prev, [nodeName]))
    setNodeContextMenu(null)
  }

  const addReadsThroughNodeSet = (mode: 'all' | 'any') => {
    addNamesToPendingSet(tubeMap.getReadNamesThroughNodes(pendingNodeSet, mode))
  }

  const addReadsToGroup = (groupId: string, names: string[]) => {
    setReadGroups(prev =>
      prev.map(g =>
        g.id === groupId ? { ...g, reads: mergeUnique(g.reads, names) } : g,
      ),
    )
  }

  function appendNewGroup(reads: string[]) {
    const n = groupCounter + 1
    const id = `g${n}`
    setReadGroups(prev => [
      ...prev,
      { id, name: `Group ${n}`, color: paletteForIndex(groupCounter), reads },
    ])
    setActiveGroupId(id)
    setGroupCounter(n)
  }

  const saveSetAsNewGroup = () => {
    if (pendingReadSet.length > 0) {
      appendNewGroup(pendingReadSet)
      setPendingReadSet([])
    }
  }

  const addNamesToActiveGroup = (names: string[]) => {
    if (activeGroupId !== null && names.length > 0) {
      addReadsToGroup(activeGroupId, names)
      setReadContextMenu(null)
      setNodeContextMenu(null)
    }
  }

  const addReadsAsNewGroup = (names: string[]) => {
    if (names.length > 0) {
      appendNewGroup(names)
      setNodeContextMenu(null)
    }
  }

  const renameGroup = (id: string, name: string) => {
    setReadGroups(prev => prev.map(g => (g.id === id ? { ...g, name } : g)))
  }

  const recolorGroup = (id: string, color: Palette) => {
    setReadGroups(prev => prev.map(g => (g.id === id ? { ...g, color } : g)))
  }

  const deleteGroup = (id: string) => {
    setReadGroups(prev => prev.filter(g => g.id !== id))
    if (activeGroupId === id) setActiveGroupId(null)
  }

  const menuOpen = readContextMenu !== null || nodeContextMenu !== null
  useKeyboardShortcuts(
    menuOpen
      ? {
          Escape: () => {
            setReadContextMenu(null)
            setNodeContextMenu(null)
          },
        }
      : {},
  )

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
      onClick: () => {
        saveSetAsNewGroup()
      },
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
      onClick: () => {
        setPendingReadSet([])
      },
    },
  ]

  // What arrived is drawable unless the walks through it are too many, and
  // then only until the user says to draw it anyway.
  const nodeVisits = tracks === undefined ? 0 : graphNodeVisits(tracks)
  const readCount = reads?.length ?? 0
  const renderLimit = graphRenderLimit(visOptions, readCount)
  const graphTooLarge = nodeVisits > renderLimit && !drawLargeGraph
  const coarseningWouldDraw =
    renderLimit < COARSENED_GRAPH_RENDER_LIMIT &&
    readCount === 0 &&
    nodeVisits <= COARSENED_GRAPH_RENDER_LIMIT
  // A cap set below the smallest preset still drops reads, so it still needs
  // the banner that says so.
  const readBannerThreshold = Math.min(
    READ_LIMIT_PRESETS[0],
    readRenderLimit ?? Infinity,
  )

  return (
    <div id="tubeMapContainer" style={{ position: 'relative' }}>
      {status}
      <PopUpInfoDialog
        open={infoDialogContent !== undefined}
        attributes={infoDialogContent}
        close={() => {
          setInfoDialogContent(undefined)
        }}
      />
      {pendingNodeSet.length > 0 ? (
        <PendingPanel
          variant="node"
          title={`Node set (${pendingNodeSet.length}):`}
          titleHint="Nodes you've selected; use the actions below to stage reads that travel through them."
          items={pendingNodeSet}
          onRemove={nodeName => {
            setPendingNodeSet(prev => prev.filter(n => n !== nodeName))
          }}
          actions={[
            {
              label: `Add reads through all ${pendingNodeSet.length} node${pendingNodeSet.length === 1 ? '' : 's'} (intersection)`,
              hint: 'Only reads whose path visits every node in this set.',
              onClick: () => {
                addReadsThroughNodeSet('all')
              },
            },
            {
              label: 'Add reads through any (union)',
              hint: 'Any read whose path visits at least one node in this set.',
              onClick: () => {
                addReadsThroughNodeSet('any')
              },
            },
            {
              label: 'Clear node set',
              onClick: () => {
                setPendingNodeSet([])
              },
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
          onRemove={name => {
            setPendingReadSet(prev => prev.filter(n => n !== name))
          }}
          actions={pendingReadActions}
        />
      ) : null}
      {readGroups.length > 0 ? (
        <ReadGroupsPanel
          groups={readGroups}
          activeGroupId={activeGroupId}
          otherReadsColor={otherReadsColor}
          onSetActive={id => {
            setActiveGroupId(id)
          }}
          onRename={(id, name) => {
            renameGroup(id, name)
          }}
          onRecolor={(id, color) => {
            recolorGroup(id, color)
          }}
          onDelete={id => {
            deleteGroup(id)
          }}
          onRecolorOther={color => {
            setOtherReadsColor(color)
          }}
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
              onClick: () => {
                setFocusReadNames(null)
              },
            },
          ]}
        />
      ) : null}
      {reads !== undefined &&
      reads.length > readBannerThreshold &&
      !visOptions.coarsenedReadView &&
      !graphTooLarge ? (
        <ReadRenderLimitBanner
          totalReads={reads.length}
          limit={readRenderLimit}
          onChange={limit => {
            changeReadRenderLimit(limit)
          }}
        />
      ) : null}
      <div id="tubeMapSVG">
        {data !== undefined && isValidating ? (
          <Box
            data-testid="tubeMapLoadingOverlay"
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // Translucent so the region still on screen stays readable
              // while the next one loads.
              background: 'rgba(255, 255, 255, 0.6)',
            }}
          >
            {loader}
          </Box>
        ) : null}
        {nodes !== undefined && tracks !== undefined && graphTooLarge ? (
          <LargeGraphNotice
            nodeVisits={nodeVisits}
            walks={tracks.length}
            limit={renderLimit}
            onCoarsen={coarseningWouldDraw ? onCoarsen : undefined}
            onDrawAnyway={() => {
              setDrawLargeGraph(true)
            }}
          />
        ) : null}
        {nodes !== undefined && tracks !== undefined && !graphTooLarge ? (
          <TubeMap
            nodes={nodes}
            tracks={tracks}
            reads={
              // Coarsened (Sankey) mode collapses reads to one band per edge,
              // so the per-read render cap doesn't apply — pass the full set.
              reads !== undefined &&
              readRenderLimit !== null &&
              !visOptions.coarsenedReadView
                ? subsampleReads(reads, readRenderLimit)
                : reads
            }
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
        {legendVisible &&
        nodes !== undefined &&
        tracks !== undefined &&
        !graphTooLarge ? (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              maxHeight: 'calc(100% - 16px)',
              overflowY: 'auto',
            }}
          >
            <Legend
              tracks={legendTracks}
              coloring={renderedColoring}
              onClose={onLegendClose}
            />
          </div>
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
          onAddToSet={name => {
            addNamesToPendingSet([name])
          }}
          onAddToActiveGroup={name => {
            addNamesToActiveGroup([name])
          }}
          onClose={() => {
            setReadContextMenu(null)
          }}
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
          onAddReadsToSet={names => {
            addNamesToPendingSet(names)
          }}
          onAddReadsToActiveGroup={names => {
            addNamesToActiveGroup(names)
          }}
          onAddReadsAsNewGroup={names => {
            addReadsAsNewGroup(names)
          }}
          onAddNodeToNodeSet={name => {
            addNodeToNodeSet(name)
          }}
          onClose={() => {
            setNodeContextMenu(null)
          }}
        />
      ) : null}
    </div>
  )
}

export default TubeMapContainer
