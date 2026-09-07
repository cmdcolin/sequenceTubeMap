import { useState, useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

import TubeMap from './TubeMap.tsx'
import * as tubeMap from '../util/tubemap.ts'
import { dataOriginTypes } from '../enums.ts'
import PopUpInfoDialog, { type InfoAttribute } from './PopUpInfoDialog.tsx'
import ReadContextMenu from './ReadContextMenu.tsx'
import NodeContextMenu from './NodeContextMenu.tsx'
import PendingPanel from './PendingPanel.tsx'
import DownloadProgressPanel from './DownloadProgressPanel.tsx'
import ReadGroupsPanel, { type ReadGroup } from './ReadGroupsPanel.tsx'
import Legend from './Legend.tsx'
import type { TubeMapData } from './tubeMapData.ts'
import { useKeyboardShortcuts } from './useKeyboardShortcuts.ts'
import type {
  ColorPaletteName,
  Palette,
  Tracks,
  ViewTarget,
  VisOptions,
} from '../Types.ts'
import { mergeUnique } from '../util/array.ts'
import { errorMessage } from '../util/error.ts'

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

// Subsample reads to at most `limit` by taking every k-th read (k chosen so
// the output count lands at `limit`). Preserves the original ordering, which
// for indexed gam queries is roughly node-position-sorted, so the subsample
// stays spatially representative rather than biasing to one end of the
// region (which `slice(0, limit)` would do).
export function subsampleReads<T>(reads: T[], limit: number): T[] {
  if (reads.length <= limit) return reads
  const stride = reads.length / limit
  const out: T[] = []
  for (let i = 0; out.length < limit && Math.floor(i) < reads.length; i += stride) {
    const r = reads[Math.floor(i)]
    if (r !== undefined) out.push(r)
  }
  return out
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
        onChange={e => { setDraft(e.target.value); }}
        onBlur={() => { commitDraft(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitDraft()
          }
        }}
        style={{ width: 90, fontSize: 13 }}
      />
      {' '}reads.{' '}
      {READ_LIMIT_CHOICES.map(choice => (
        <button
          key={choice ?? 'all'}
          type="button"
          onClick={() => { onChange(choice); }}
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

const EXAMPLE_TRACKS: Tracks = [
  { trackType: 'graph', trackFile: 'fakeGraph' },
  { trackType: 'read', trackFile: 'fakeReads' },
]

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
  onLegendClose: () => void
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
  onLegendClose,
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
  // Render-time cap on reads. Deep-coverage regions can produce 5k+ reads,
  // which inflate the tube-map layout to ~150k SVG elements and freeze the
  // browser. `null` means render all.
  const [readRenderLimit, setReadRenderLimit] = useState<number | null>(
    readRenderLimitPreference,
  )
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
  }

  const changeReadRenderLimit = (limit: number | null) => {
    setReadRenderLimit(limit)
    onReadRenderLimitChange(limit)
  }

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

  // Rendered above the tube map rather than in place of it, so a failed
  // fetch doesn't throw away the staged read/node sets, the read groups and
  // the legend.
  // Nothing has ever rendered for this view, so the loader takes the place of
  // the map instead of covering it.
  const loader = (
    <div id="loaderContainer">
      <div id="loader" />
      <DownloadProgressPanel />
    </div>
  )

  const status = error ? (
    <Box sx={{ px: 2 }}>
      <Alert
        severity="error"
        action={
          <Button
            color="error"
            variant="outlined"
            size="small"
            sx={{ flexShrink: 0 }}
            onClick={() => { onRetry(); }}
          >
            Retry
          </Button>
        }
      >
        {errorMessage(error)}
      </Alert>
    </Box>
  ) : data === undefined && isValidating ? (
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
    addNamesToPendingSet(
      tubeMap.getReadNamesThroughNodes(pendingNodeSet, mode),
    )
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
    setReadGroups(prev => [...prev, { id, name: `Group ${n}`, color: paletteForIndex(groupCounter), reads }])
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

  const legendTracks =
    dataOrigin === dataOriginTypes.API ? viewTarget.tracks : EXAMPLE_TRACKS

  return (
    <div id="tubeMapContainer" style={{ position: 'relative' }}>
      {status}
      <PopUpInfoDialog
        open={infoDialogContent !== undefined}
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
            { setPendingNodeSet(prev => prev.filter(n => n !== nodeName)); }
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
            { setPendingReadSet(prev => prev.filter(n => n !== name)); }
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
      {reads !== undefined &&
      reads.length > READ_LIMIT_PRESETS[0] &&
      !visOptions.coarsenedReadView ? (
        <ReadRenderLimitBanner
          totalReads={reads.length}
          limit={readRenderLimit}
          onChange={limit => { changeReadRenderLimit(limit); }}
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
        {nodes !== undefined && tracks !== undefined ? (
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
          onAddReadsAsNewGroup={names => { addReadsAsNewGroup(names); }}
          onAddNodeToNodeSet={name => { addNodeToNodeSet(name); }}
          onClose={() => { setNodeContextMenu(null); }}
        />
      ) : null}
      {legendVisible && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
          }}
        >
          <Legend
            tracks={legendTracks}
            colorSchemes={visOptions.colorSchemes}
            readGroups={readGroups}
            otherReadsColor={otherReadsColor}
            ignoreStrand={visOptions.ignoreStrand}
            onClose={onLegendClose}
          />
        </div>
      )}
    </div>
  )
}

export default TubeMapContainer
