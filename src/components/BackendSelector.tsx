import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'

interface BackendSelectorProps {
  currentAPIMode: string
  setAPIMode: (mode: string) => void
  // Show the "self-hosted server" option (only meaningful when BACKEND_URL is configured)
  showServerOption: boolean
}

function BackendSelector({
  currentAPIMode,
  setAPIMode,
  showServerOption,
}: BackendSelectorProps) {
  return (
    <Container sx={{ mt: 1 }}>
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<Box sx={{ fontSize: 18, lineHeight: 1 }}>▾</Box>}>
          Backend configuration
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 320 }}>
              <InputLabel id="apiSelectLabel">Extract tube map data</InputLabel>
              <Select
                labelId="apiSelectLabel"
                id="apiSelect"
                label="Extract tube map data"
                value={currentAPIMode}
                onChange={(e) => { setAPIMode(e.target.value); }}
              >
                <MenuItem value="local">In-browser (.gbz.db uploads only)</MenuItem>
                <MenuItem value="upstream">Upload to vgteam server (api.tubemap.graphs.vg)</MenuItem>
                {showServerOption && (
                  <MenuItem value="server">Self-hosted server</MenuItem>
                )}
              </Select>
            </FormControl>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Container>
  )
}

export default BackendSelector
