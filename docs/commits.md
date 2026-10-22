# Pending commit commands

Sessions don't commit (`docs/RUNBOOK.md` §8). Every 2–4 finished tasks, they append a batch here: one ready-to-run command
per commit, each touching only its own files. Kamil runs them in order.

A batch whose subjects already appear in `git log` is done. Mark superseded batches as such; do not delete them.

---------------------------------------------------------------------------------------------------------------------

<!-- batches go below, newest last -->
