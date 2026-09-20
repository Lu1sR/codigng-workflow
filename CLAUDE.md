# CLAUDE.md

Read `.context/index.md` first. It is the maintained description of this
repository: what each plugin does, how the pieces are wired, the conventions,
and the decision log. Prefer it over re-deriving the structure from a file
listing.

This repository uses its own `contextly` plugin. `.context/decisions.md` is
append-only: new entries go through `/contextly:decide`, existing ones are
never rewritten. The other documents are amended in place with
`/contextly:update` when the plugins change behavior.
