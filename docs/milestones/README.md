# SynTask Milestones

Milestone files use `MILESTONE_<two_digit_number>_<SHORT_NAME>.md`.

Status values:

- `Not Started`
- `In Progress`
- `Conditionally Accepted`
- `Complete`
- `Blocked`

Checklist conventions:

- Use unchecked items for planned work.
- Use checked items only when implementation and verification evidence exist.
- Keep checklist items tied to acceptance criteria.

Completion evidence conventions:

- Record exact commands, dates, pass/fail counts, skipped tests, and known unrelated failures.
- Reference existing verification reports or architecture decisions instead of duplicating long reports.
- Keep release risks visible until individually verified or fixed.

Relationship to canonical documents:

- Product requirements and user stories remain canonical in product documents.
- Implementation sequencing remains canonical in the Agent Platform implementation plan.
- Architecture remains canonical in architecture diagrams and architecture docs.
- Durable technical decisions remain canonical in ADRs under `docs/architecture/decisions/`.
- Milestone files summarize scope, progress, acceptance criteria, evidence, and remaining risks for one delivery milestone.

