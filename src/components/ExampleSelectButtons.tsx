import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { dataOriginTypes } from '../enums.ts'
import type { ColorPaletteName } from '../Types.ts'

interface ExampleButton {
  id: string
  origin: string
  label: string
  mainPalette: ColorPaletteName
  readPalette?: ColorPaletteName
}

const EXAMPLE_BUTTONS: ExampleButton[] = [
  {
    id: 'example1',
    origin: dataOriginTypes.EXAMPLE_1,
    label: 'Indels and Polymorphisms only',
    mainPalette: 'plainColors',
  },
  {
    id: 'example2',
    origin: dataOriginTypes.EXAMPLE_2,
    label: 'Inversions',
    mainPalette: 'plainColors',
  },
  {
    id: 'example3',
    origin: dataOriginTypes.EXAMPLE_3,
    label: 'Nested Inversions',
    mainPalette: 'plainColors',
  },
  {
    id: 'example4',
    origin: dataOriginTypes.EXAMPLE_4,
    label: 'Duplications',
    mainPalette: 'plainColors',
  },
  {
    id: 'example5',
    origin: dataOriginTypes.EXAMPLE_5,
    label: 'Translocations',
    mainPalette: 'plainColors',
  },
  {
    id: 'example6',
    origin: dataOriginTypes.EXAMPLE_6,
    label: 'Aligned Reads',
    mainPalette: 'greys',
    readPalette: 'reds',
  },
  {
    id: 'example7',
    origin: dataOriginTypes.EXAMPLE_7,
    label: 'Alignments to Reverse Nodes',
    mainPalette: 'greys',
    readPalette: 'reds',
  },
  {
    id: 'example8',
    origin: dataOriginTypes.EXAMPLE_8,
    label: 'Multiple Nodes Cycle 1',
    mainPalette: 'plainColors',
  },
  {
    id: 'example9',
    origin: dataOriginTypes.EXAMPLE_9,
    label: 'Multiple Nodes Cycle 2',
    mainPalette: 'plainColors',
  },
]

interface ExampleSelectButtonsProps {
  showExample: (
    origin: string,
    mainPalette: ColorPaletteName,
    readPalette?: ColorPaletteName,
  ) => void
}

function ExampleSelectButtons({ showExample }: ExampleSelectButtonsProps) {
  return (
    <Box
      component="form"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
      onSubmit={e => { e.preventDefault(); }}
    >
      {EXAMPLE_BUTTONS.map(({ id, origin, label, mainPalette, readPalette }) => (
        <Button
          key={id}
          variant="contained"
          size="small"
          id={id}
          onClick={() => { showExample(origin, mainPalette, readPalette); }}
        >
          {label}
        </Button>
      ))}
    </Box>
  )
}

export default ExampleSelectButtons
