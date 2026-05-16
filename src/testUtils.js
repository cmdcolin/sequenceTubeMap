import { fireEvent, screen, within } from '@testing-library/react'

// Open a MUI Select inside `container` and click the option labelled `label`.
export async function selectMuiOption(container, label) {
  fireEvent.mouseDown(within(container).getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: label }))
}

// Read the currently-displayed value of a MUI Select inside `container`.
export function muiSelectValue(container) {
  return within(container).getByRole('combobox').textContent
}
