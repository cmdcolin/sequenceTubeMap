import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewMenu } from './ViewMenu.tsx'
import { DEFAULT_VIS_OPTIONS } from '../util/visOptions.ts'

async function openMenu(folded: boolean, foldVariantsBp = 0) {
  const handleFoldVariantsChange = vi.fn<(value: number) => void>()
  render(
    <ViewMenu
      legendVisible={false}
      toggleLegend={() => {}}
      visOptions={{
        ...DEFAULT_VIS_OPTIONS,
        coarsenedHaplotypeView: true,
        foldVariantsBp,
        colorSchemes: [],
      }}
      toggleVisOptionFlag={() => {}}
      handleMappingQualityCutoffChange={() => {}}
      handleFacetByChange={() => {}}
      handleFoldVariantsChange={handleFoldVariantsChange}
      folded={folded}
      bandageJsViewTarget={undefined}
      trackFileBaseURI={undefined}
    />,
  )
  await userEvent.click(screen.getByTestId('viewMenuButton'))
  return handleFoldVariantsChange
}

const item = (name: RegExp) => screen.getByRole('menuitem', { name })
const checkbox = (name: RegExp) =>
  item(name).querySelector('input[type=checkbox]')

describe('the View menu, folding variants', () => {
  it('offers off and three thresholds, off by default', async () => {
    await openMenu(false)
    const select = within(screen.getByTestId('foldVariantsSelect')).getByRole(
      'combobox',
    )

    expect(select).toHaveTextContent('off')
    await userEvent.click(select)
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual(['off', '50 bp', '1 kb', '10 kb'])
  })

  it('hands the picked threshold on in bp', async () => {
    const onChange = await openMenu(false)
    await userEvent.click(
      within(screen.getByTestId('foldVariantsSelect')).getByRole('combobox'),
    )
    await userEvent.click(screen.getByRole('option', { name: '10 kb' }))

    expect(onChange).toHaveBeenCalledWith(10_000)
  })

  it('shows what a folded graph is drawn with, and locks it', async () => {
    await openMenu(true, 1000)

    expect(item(/Compressed view/)).toHaveAttribute('aria-disabled', 'true')
    expect(checkbox(/Compressed view/)).toBeChecked()
    expect(item(/Band haplotypes/)).toHaveAttribute('aria-disabled', 'true')
    expect(checkbox(/Band haplotypes/)).not.toBeChecked()
    expect(item(/Merge node chains/)).toHaveAttribute('aria-disabled', 'true')
  })

  it('leaves them alone on a graph the fold refused', async () => {
    await openMenu(false, 1000)

    expect(item(/Compressed view/)).not.toHaveAttribute('aria-disabled')
    expect(checkbox(/Band haplotypes/)).toBeChecked()
  })
})
