# Runbook: how to let the build run

This is how the build proceeds without the user present. A session following this runbook can start, work, checkpoint,
and hand over to the next session without the user doing anything except starting it.

---------------------------------------------------------------------------------------------------------------------

## 1. Starting a session

The user (or a scheduled task) starts Claude Code in `/Users/Kamil/code_base/slop_sf` with this prompt:

> Continue the Slop San Francisco build. Follow docs/RUNBOOK.md exactly. Work until the session budget in RUNBOOK §3 is used,
> a phase gate passes, or a hard stop in PLAN.md §7 applies. Then write the handover (RUNBOOK §4) and stop.

Recommended model: the most capable model available. Data and pipeline tasks may use a cheaper model through subagents (§5).

## 2. The loop

1. **Orient (≤ 5% of the session).**
   - Read `PLAN.md` §11 (progress log) and the last handover note in `docs/handover.md`.
   - Read the current phase file. Find the first unchecked task.
   - Run `git status` and `git log --oneline -10`. If the tree is dirty from an interrupted session, inspect the diff. Finish it or revert your own partial work. Never discard work you do not understand: log it and stop (🛑 3).
2. **Check health.** Run the tests (`node --test tests/*.test.cjs tests/*.test.mjs`). If they fail at the start, fixing that is the first task.
3. **Do the task:**
   - Read only the code the task needs (`grep -n` first; line numbers in `docs/research.md` §3).
   - Make the change.
   - Run the task's acceptance check: tests, a probe run, a data report.
   - Commit: `Pn.m: <what>` plus the attribution line.
4. **Repeat** step 3 with the next task.
5. **Gate.** When the phase's tasks are done:
   - Run the gate checklist in the phase file.
   - Run the probe benches.
   - Write the gallery (§7).
   - Tick the phase in `PLAN.md` §11 and continue with the next phase in the same session if budget remains.
6. **Stop** when the budget is used, a hard stop applies, or the work is finished. Write the handover (§4).

## 3. Budgets and stop rules

- **Session budget:** about 4 hours of work or about 15M tokens processed, whichever comes first. Leave room for the handover.
- **Phase budget:** the estimate in `PLAN.md` §5. At 1.5× the estimate, stop (🛑 2) with a status report and options.
- **Task budget:** if one task takes more than 3 attempts at the same failure, step back:
  1. write down what was tried;
  2. pick a different approach, or mark the task as blocked with evidence and move to the next independent task;
  3. if nothing independent remains, stop (🛑 3).
- **Never** relax an acceptance check to make it pass. If a check is wrong, fix the check in the plan file, say why in the decision log, then run it.

## 4. Handover (end of every session)

1. Append a row to `PLAN.md` §11:
   - date, task IDs done, summary;
   - test status;
   - probe numbers (fps / heap / ready / errors);
   - tokens used, if the usage tool or `/usage` shows it; else "unknown";
   - notes.
2. Overwrite `docs/handover.md` with:
   - what the next session should do first;
   - anything half-done, with file paths;
   - open questions;
   - risks noticed;
   - any decision made (also in `PLAN.md` §10).
3. Commit: `Handover: <date>`.

## 5. Context and cost discipline

- Do not read whole NYC files. The biggest are 2–3.5k lines. Grep, then read ±60 lines around the target.
- **Subagents.**
  - Use a read-only subagent for sweeps across many files: "find every place that assumes y = 0 in X, Y, Z".
  - Use a subagent on a cheaper model for data wrangling and report writing.
  - Keep design and integration work in the main session.
- **Data files.** Never print generated geodata or large JSON. Use scripts that summarise (counts, histograms, max/min).
- **Screenshots.** Take 1–3 per check at reduced scale. Look at them yourself; do not describe each pixel in the logs.
- **Long-context compaction.** The handover and the progress log make it safe to compact or end the session at any time.

## 6. Parallel sessions (optional, only if the user says so)

After P3, phases 4 (SF look) and 5 (landmarks) touch mostly different files (`buildings.js` + `sf-buildings.js` + `street-details.js` + `trees.js` vs `landmarks.js` + bridge code). They can run in two worktree sessions, each on its own branch.

The integration risk is in `main.js`, `index.html` (script list) and `tsl-materials.js`. Merge order: P4 first, then P5 rebased onto it.

## 7. Galleries (asynchronous visual review)

At each gate, write `docs/review/pN/index.md` containing:
- the named shots (PNG at 1280×720, about 200–400 KB each, committed under `docs/review/pN/`);
- one line per shot saying what to look at;
- the probe numbers;
- a short list of known visual issues.

The user can review at any time. Feedback arrives as a message in a later session; treat it as the top-priority task.

## 8. Tools

| Need | Command |
|---|---|
| Tests | `node --test tests/*.test.cjs tests/*.test.mjs` |
| Static server | `node tools/serve.mjs` (P1.3), port 8080 |
| Probe and screenshot (headless Chrome, real WebGPU) | `node tools/dev/probe.mjs http://127.0.0.1:8080/?cam=... out.png 120` |
| Benches | `node tools/dev/probe.mjs 'http://127.0.0.1:8080/?bench=street' out.png 120` (P1.4 adds `bench`) |
| Fetch data | `bash tools/fetch-geodata.sh --box slice\|core\|city` (P1.5) |
| Build data | `node --max-old-space-size=8192 tools/build-geodata.mjs` (P1) |
| In-app browser | Only when the user is present (it renders nothing while hidden) |

The probe kills its Chrome when done. If it hangs, find stray processes with `pgrep -f "remote-debugging-port=9333"` and kill only those PIDs.
