import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material'
import * as tubeMap from '../util/tubemap.ts'
import type { TrackVisibilityItem } from '../util/tubemap.ts'

// Tracks visibility checklist — populated by tubemap.ts via subscribeTrackVisibility.
// Visibility state lives in tubemap.ts (mutable inputTracks[i].hidden);
// toggling here calls back into tubemap, which redraws and re-emits the
// updated snapshot so the checkbox reflects the new state.
function TrackVisibilityPanel() {
  const [items, setItems] = useState<TrackVisibilityItem[]>([])
  useEffect(() => tubeMap.subscribeTrackVisibility(setItems), [])

  if (items.length === 0) {
    return <Box sx={{ color: 'text.secondary', fontSize: 13 }}>No tracks</Box>
  }
  return (
    <Stack spacing={1} sx={{ minWidth: 220 }}>
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => { tubeMap.changeAllTracksVisibility(true) }}
        >
          Select all
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => { tubeMap.changeAllTracksVisibility(false) }}
        >
          Deselect all
        </Button>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 24 }}>Color</TableCell>
            <TableCell>Track</TableCell>
            <TableCell sx={{ width: 24 }} padding="checkbox">Show</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.id}>
              <TableCell>
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    border: '1px solid #ccc',
                    borderRadius: 0.5,
                    background: item.color,
                  }}
                />
              </TableCell>
              <TableCell>{item.name}</TableCell>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={!item.hidden}
                  onChange={() => { tubeMap.changeTrackVisibility(item.id) }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  )
}

export default TrackVisibilityPanel
