import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { dataOriginTypes } from '../enums.ts'

interface ExampleButton {
  id: string
  origin: string
  label: string
}

const EXAMPLE_BUTTONS: ExampleButton[] = [
  {
    id: 'example1',
    origin: dataOriginTypes.EXAMPLE_1,
    label: 'Indels and Polymorphisms only',
  },
  {
    id: 'example2',
    origin: dataOriginTypes.EXAMPLE_2,
    label: 'Inversions',
  },
  {
    id: 'example3',
    origin: dataOriginTypes.EXAMPLE_3,
    label: 'Nested Inversions',
  },
  {
    id: 'example4',
    origin: dataOriginTypes.EXAMPLE_4,
    label: 'Duplications',
  },
  {
    id: 'example5',
    origin: dataOriginTypes.EXAMPLE_5,
    label: 'Translocations',
  },
  {
    id: 'example6',
    origin: dataOriginTypes.EXAMPLE_6,
    label: 'Aligned Reads',
  },
  {
    id: 'example7',
    origin: dataOriginTypes.EXAMPLE_7,
    label: 'Alignments to Reverse Nodes',
  },
  {
    id: 'example8',
    origin: dataOriginTypes.EXAMPLE_8,
    label: 'Multiple Nodes Cycle 1',
  },
  {
    id: 'example9',
    origin: dataOriginTypes.EXAMPLE_9,
    label: 'Multiple Nodes Cycle 2',
  },
]

interface ExampleSelectButtonsProps {
  showExample: (origin: string) => void
}

function ExampleSelectButtons({ showExample }: ExampleSelectButtonsProps) {
  return (
    <Box
      component="form"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
      onSubmit={e => { e.preventDefault(); }}
    >
      {EXAMPLE_BUTTONS.map(({ id, origin, label }) => (
        <Button
          key={id}
          variant="contained"
          size="small"
          id={id}
          onClick={() => { showExample(origin); }}
        >
          {label}
        </Button>
      ))}
    </Box>
  )
}

export default ExampleSelectButtons
