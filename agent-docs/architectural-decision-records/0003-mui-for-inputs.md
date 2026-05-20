# 0003 — MUI for inputs and dialogs; reactstrap only for layout

Status: Accepted

## Context

The codebase historically mixed react-bootstrap, reactstrap, and Material-UI.
Selects/autocompletes were the worst — three different dropdown styles on one
page.

## Decision

- Inputs, selects, autocompletes, dialogs, toggle groups → **MUI**.
- `Container` / `Row` / `Col` / `Navbar` and Bootstrap CSS utility classes →
  **reactstrap** (kept for layout only).

## Consequences

- New form controls use MUI without debate.
- Tests for selects use `mouseDown + findByRole('option')`, not `change` events.
- reactstrap and bootstrap CSS stay as a dependency for the grid system. Don't
  pull in @material-ui/core (v4) again — fully removed.
