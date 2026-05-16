import { fireEvent, screen, within } from '@testing-library/react'

// Open a MUI Select inside `container` and click the option labelled `label`.
export async function selectMuiOption(container: HTMLElement, label: string) {
  fireEvent.mouseDown(within(container).getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: label }))
}

// Read the currently-displayed value of a MUI Select inside `container`.
export function muiSelectValue(container: HTMLElement) {
  return within(container).getByRole('combobox').textContent
}
