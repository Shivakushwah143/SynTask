# Executive Operations Agent — Command Center (User Flow)

**Status:** Implemented
**Surface:** `frontend/src/pages/ExecutiveAssistant.jsx`, route `/executive-assistant`
**Backend:** `/api/v1/executive-agent/chat` and `/api/v1/executive-agent/chat/stream`
**Feature gate:** backend `EXECUTIVE_AGENT_ENABLED` (503 when disabled). RBAC and tenant
isolation are unchanged — the agent only ever queries the authenticated user's company.

The Executive Operations Agent is a company-wide command center, not a basic chatbot.
Questions across Employees, Tasks, Projects, Clients, Sales, HR, Attendance, Leave,
Payroll, Finance, Recruitment, and Meetings are answered with streamed operational
states and rendered as structured cards, tables and risk items — never raw Markdown
pipes or Mongo/Object IDs.

## What the user sees

1. **Header** — "Executive Operations Agent" with the subtitle "Company-wide
   intelligence across SynTask" and a live-status badge.
2. **Capability chips** — compact, horizontally scrollable chips (collapsible via
   "All capabilities"); tapping one asks a scoped question.
3. **Empty state** — "What would you like to know about your company?" with four
   example briefs (attention items, clients at risk, highest workload, sales
   performance).
4. **Streaming states** — while the agent works, the UI shows sequential operational
   phases: *Understanding your request… → Checking company data… → Analyzing
   relevant records… → Preparing executive summary…*, then live answer tokens.
5. **Structured answers** — narrative text renders through a safe Markdown-lite
   renderer (headings, bold, lists, real tables, line breaks) and tool results render
   as typed blocks:

   | Block | Renders as |
   |---|---|
   | `count` | Headline KPI card |
   | `summary` | Label/value fact grid |
   | `table` | Real table with status badges |
   | `list` | Record/name list |
   | `detail` | Single-entity field view |
   | `risk` | Severity-badged risk cards with recommended actions |

6. **Contextual actions** below each answer — "View clients", "Show risks", "Check
   overdue tasks", "Compare teams" — plus follow-up chips ("Why?", "Go deeper",
   "What first?") that keep the conversation natural.
7. **Sources checked** — a compact, expandable evidence section listing the data
   areas inspected and timings; internal tool names and ids are never shown.
8. **Composer** — large input ("Ask anything about your company…"), attachment
   button (not yet supported), Send, and Stop while a response is streaming.

## Data contract

Every response carries a narrative `answer` **and** an `answer_blocks` array
(built deterministically by `backend/app/agents/answer_blocks.py` from the tool
results the agent actually used). Deterministic fast-fact answers produce
`count`/`summary` blocks via `build_fast_fact_blocks`.

Streaming (SSE) events: `status` (phase + optional tool progress), `token`,
`done` (final payload incl. `answer_blocks`, `tool_calls_summary`, `usage`),
`error`, `ping`. The page maps backend phases to the user-facing copy above and
aborts the stream with a Stop button (`AbortController`).

## Reusable UI components

- `frontend/src/components/ai/AnswerBlocks.jsx` — block renderers (KPI, summary
  grid, list, table, detail, risk) + friendly tool labels; redacts ObjectId values.
- `frontend/src/components/ai/MarkdownText.jsx` — dependency-free, XSS-safe
  Markdown-lite renderer (headings, bold/italic/code, lists, pipe tables, line
  breaks); strips 24-hex ObjectId tokens unless `showIds`.

## Tests

- `frontend/src/components/ai/MarkdownText.test.jsx`, `AnswerBlocks.test.jsx`
- `backend/tests/agents/test_answer_blocks.py` — block derivation, ObjectId
  redaction, concise-answer post-processing.
