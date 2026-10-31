## Tickets: fluss

Tickets live in fluss (https://fluss.sch.tools), project **LESE**, reached over the fluss MCP. Old Backlog.md ids survive as each ticket's `legacyRef`.

## Working a fluss ticket

`/ticket-loop` does all of this itself. A session that builds tickets by hand over the fluss MCP follows the same record.
- **Writes:** pass a lowercase UUID as `sessionRef` on every write (`echo $CLAUDE_CODE_SESSION_ID`, or `${CLAUDE_SESSION_ID}` in a skill; only without either, one `uuidgen` for the whole session). `ticket_claim` before building.
- **After the gate and the review round,** per ticket:
  1. `ac_check` every criterion that is built and tested;
  2. `section_write` the `tech_notes` (what was built, the gate numbers, the changed files);
  3. `section_write` one `review_report` per review role that ran (correctness, tests, conventions, architecture, security, criteria), with `{role, reviewer, findings: [{severity, text, file}]}`; an empty `findings` list when nothing was found. `reviewer` is `{kind: "agent", agentId}`, written by the builder: the `agentId` the Agent tool returned for the review agent (attended), or the label of the review agent's call (workflow); `{kind: "self"}` or none is flagged at review and accept like a missing report, and so is no report at all;
  4. `report_file` with the summary and the handover: `done`, `open` and `decisions` (one short line each) and the one `nextStep`;
  5. `section_write` the `review_brief`, what the user reviews from: `whatChanged` (1–3 sentences from the user's side), `howToSee` (a link or steps), `lookAt` (where a bug would show first), `decisions` (yes/no questions only the user can answer, answered on the ticket page) and `risks` (with what was not tested);
  6. move to `review`; a move to review, done or accepted answers with the record's gaps (a missing brief and an open brief decision only warn).
- **The review round is independent agents, never the builder.** Each role runs as its own agent (Agent tool) with a fresh context, given the diff, the changed files and the ticket's AC, but not the build conversation. The builder only writes the agents' findings into the `review_report`s. A session that can't spawn agents doesn't write a report; it says so in the tech_notes, and the ticket goes to review without one.
- **Accept is the user's,** never the agent's.
- **Batching:** small related tickets may share one round (one plan, gate, review and browser pass), but each still ends with its own AC, notes, reports and stage.
- **Commits:** a `feat` or `fix` commit names its ticket in the subject, body or a `Refs: LESE-12` trailer (`feat: x (LESE-12)`).
