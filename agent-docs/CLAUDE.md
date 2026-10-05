# Agent documentation

Everything here is filed by what it is:

- `ideas/` — a proposal parked, one per file with `name:` and `description:`
  frontmatter, in the subfolder naming what it waits on: `ready/` (only the
  work), `waiting-on-a-call/` (a decision), `waiting-on-a-number/` (a
  measurement), `waiting-on-someone-else/` (upstream or data). A verdict leaves
  `ideas/`: an ADR if the decision deserves a record, otherwise deleted.
- `reference/` — settled: how a subsystem works, and measurements with numbers.
- `architecture-decision-records/` — *why*, one per file.
- `todo/` — committed work, one file per item, indexed by `TODO.md`.
- `handoffs/` — live state of an unfinished thread; pointers, not content.
  Delete when the thread lands.

Add a folder when the first doc needs it. Cite a doc by its path, so a move is a
grep, and `pnpm check-docs` fails on a path that no longer exists. What a
session did and which commits is in git.
