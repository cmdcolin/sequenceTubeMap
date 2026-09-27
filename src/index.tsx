import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import RootErrorBoundary from './components/RootErrorBoundary.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
)
