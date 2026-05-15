import PopupDialog from "./PopupDialog.js";

export const PopUpInfoDialog = ({ open, attributes, close }) => {
  return (
    <div>
      <PopupDialog open={open} close={close}>
        <h5>Object Information</h5>
        <table>
          <tbody>
            {/* Track or Node info here */}
            {(attributes || []).map(function (attribute) {
              return (
                <tr key={attribute[0]}>
                  <td style={{ fontWeight: "bold", border: "1px solid black" }}>
                    {attribute[0]}
                  </td>
                  <td style={{ border: "1px solid black" }}>{attribute[1]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PopupDialog>
    </div>
  );
};

export default PopUpInfoDialog;

