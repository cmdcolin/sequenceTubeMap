import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import App from './App.tsx'
import RootErrorBoundary from './components/RootErrorBoundary.tsx'
import { theme } from './theme.ts'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </ThemeProvider>,
)
