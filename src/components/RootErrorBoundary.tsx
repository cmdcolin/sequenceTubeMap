import { Component, type ErrorInfo, type ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { errorMessage } from '../util/error.ts'

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  error: unknown
  hasError: boolean
}

// React only catches render errors in a class component. Without one, an
// uncaught throw unmounts the whole tree and leaves a blank page.
export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { error: undefined, hasError: false }

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { error, hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          <AlertTitle>Something went wrong</AlertTitle>
          <Box component="pre" sx={{ whiteSpace: 'pre-wrap', m: 0 }}>
            {errorMessage(this.state.error)}
          </Box>
        </Alert>
        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              window.location.reload()
            }}
          >
            Reload
          </Button>
          {/* Reloading the view in the URL may crash the same way. The hash
              picks the backend, so it stays. */}
          <Button
            variant="outlined"
            onClick={() => {
              window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.hash,
              )
              window.location.reload()
            }}
          >
            Start over
          </Button>
        </Box>
      </Box>
    )
  }
}

export default RootErrorBoundary
