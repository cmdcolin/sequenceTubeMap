import PopupDialog from './PopupDialog'

export type InfoAttribute = readonly [label: string, value: React.ReactNode]

interface PopUpInfoDialogProps {
  open: boolean
  attributes?: InfoAttribute[] | null
  close: () => void
}

export const PopUpInfoDialog = ({
  open,
  attributes,
  close,
}: PopUpInfoDialogProps) => {
  return (
    <div>
      <PopupDialog open={open} close={close}>
        <h5>Object Information</h5>
        <table>
          <tbody>
            {(attributes ?? []).map(attribute => (
              <tr key={attribute[0]}>
                <td style={{ fontWeight: 'bold', border: '1px solid black' }}>
                  {attribute[0]}
                </td>
                <td style={{ border: '1px solid black' }}>{attribute[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PopupDialog>
    </div>
  )
}

export default PopUpInfoDialog
