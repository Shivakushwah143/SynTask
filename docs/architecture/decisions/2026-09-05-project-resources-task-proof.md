# Project resources and optional task proof

Status: Accepted
Date: 2026-09-05

## Context

Projects need small, user-defined references and task workers need optional
evidence during progress/review without introducing a generic artifact engine.
Quantitative `+/-` controls must not write until the user confirms Update.

## Decision

- Store dynamic project references in `project_resources`, keyed by
  `company_id` and logical `project_id`.
- Store optional evidence in `task_proofs`, keyed by `company_id` and `task_id`,
  with authenticated `submitted_by` and context `progress_update` or
  `review_submission`.
- Keep quantitative draft progress entirely in React state.
- Progress/review succeeds when proof is skipped. If the primary action succeeds
  but optional proof storage fails, return the primary success plus a safe
  `proof_error` warning.
- Reuse project permissions: `view_project` reads resources;
  `manage_project` adds, edits, or deletes them. Task visibility controls proof
  reads; only the assigned worker or an authorized task manager adds proof.

## Security and tests

Every lookup includes `company_id` plus its project/task relationship. Resource
IDs are never sufficient by themselves. Submitter identity always comes from
the authenticated user. Negative tests cover cross-tenant resource/proof access,
and flow tests cover both skip and proof-submission paths.
