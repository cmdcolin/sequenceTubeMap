import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faX } from "@fortawesome/free-solid-svg-icons";

export const PopupDialog = ({
  open,
  children,
  close,
  closeOnDocumentClick = false,
  width = "760px",
  testID = "PopupDialog",
}) => {
  const handleClose = (_event, reason) => {
    if (!closeOnDocumentClick && (reason === "backdropClick" || reason === "escapeKeyDown")) {
      return;
    }
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      data-testid={testID}
      slotProps={{
        paper: {
          sx: width !== null ? { width, maxWidth: "none" } : {},
        },
      }}
    >
      <IconButton
        onClick={() => close()}
        data-testid={testID.concat("CloseButton")}
        size="small"
        sx={{ position: "absolute", top: 8, right: 8 }}
      >
        <FontAwesomeIcon icon={faX} />
      </IconButton>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
};

export default PopupDialog;
