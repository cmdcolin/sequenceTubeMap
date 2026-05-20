import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'

interface VisualizationOptionsProps {
  currentAPIMode: string
  setAPIMode: (mode: string) => void
  showBackendConfig?: boolean
}

function VisualizationOptions({
  currentAPIMode,
  setAPIMode,
  showBackendConfig = true,
}: VisualizationOptionsProps) {
  return (
    <Container sx={{ mt: 1 }}>
      {showBackendConfig && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<Box sx={{ fontSize: 18, lineHeight: 1 }}>▾</Box>}>
            Backend configuration
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel id="apiSelectLabel">Extract tube map data</InputLabel>
                <Select
                  labelId="apiSelectLabel"
                  id="apiSelect"
                  label="Extract tube map data"
                  value={currentAPIMode}
                  onChange={(e) => { setAPIMode(e.target.value) }}
                >
                  <MenuItem value="server">On remote server</MenuItem>
                  <MenuItem value="local">In-browser (.gbz.db uploads only)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </AccordionDetails>
        </Accordion>
      )}
    </Container>
  )
}

export default VisualizationOptions
