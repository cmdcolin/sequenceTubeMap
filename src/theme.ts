import { createTheme } from '@mui/material/styles'

// The density follows JBrowse's theme: a 12px base type size, a 4px grid, and
// dense or small defaults for the controls that crowd a toolbar or a menu.
export const theme = createTheme({
  typography: {
    fontSize: 12,
  },
  spacing: 4,
  motion: {
    reducedMotion: 'always',
  },
  components: {
    MuiAutocomplete: { defaultProps: { size: 'small' } },
    MuiButton: { defaultProps: { size: 'small' } },
    MuiCheckbox: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiIconButton: { defaultProps: { size: 'small' } },
    MuiListItem: { defaultProps: { dense: true } },
    MuiListSubheader: { styleOverrides: { root: { lineHeight: '32px' } } },
    MuiMenuItem: { defaultProps: { dense: true } },
    MuiRadio: { defaultProps: { size: 'small' } },
    MuiSwitch: { defaultProps: { size: 'small' } },
    MuiTable: { defaultProps: { size: 'small' } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiToggleButtonGroup: { defaultProps: { size: 'small' } },
    MuiToolbar: { defaultProps: { variant: 'dense' } },
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: 12 } } },
  },
})
