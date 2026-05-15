import { Form, Button } from 'reactstrap'
import { dataOriginTypes } from '../enums'

function ExampleSelectButtons({ setDataOrigin, setColorSetting }) {
  const handleClick = (dataOrigin, haploColor, readColor) => {
    setDataOrigin(dataOrigin)
    setColorSetting('mainPalette', 0, haploColor)
    if (readColor) {
      setColorSetting('mainPalette', 1, readColor)
    }
  }

  return (
    <Form>
      <Button
        color="primary"
        id="example1"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_1, 'plainColors')}
      >
        Indels and Polymorphisms only
      </Button>
      <Button
        color="primary"
        id="example2"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_2, 'plainColors')}
      >
        Inversions
      </Button>
      <Button
        color="primary"
        id="example3"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_3, 'plainColors')}
      >
        Nested Inversions
      </Button>
      <Button
        color="primary"
        id="example4"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_4, 'plainColors')}
      >
        Duplications
      </Button>
      <Button
        color="primary"
        id="example5"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_5, 'plainColors')}
      >
        Translocations
      </Button>
      <Button
        color="primary"
        id="example6"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_6, 'greys', 'reds')}
      >
        Aligned Reads
      </Button>
      <Button
        color="primary"
        id="example7"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_7, 'greys', 'reds')}
      >
        Alignments to Reverse Nodes
      </Button>
      <Button
        color="primary"
        id="example8"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_8, 'plainColors')}
      >
        Multiple Nodes Cycle 1
      </Button>
      <Button
        color="primary"
        id="example9"
        onClick={() => handleClick(dataOriginTypes.EXAMPLE_9, 'plainColors')}
      >
        Multiple Nodes Cycle 2
      </Button>
    </Form>
  )
}

export default ExampleSelectButtons
