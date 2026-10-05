# SynTask SLIs and SLOs

Status: implemented measurement (Topics 2 + 7). Targets remain **internal
engineering targets**, not contractual promises.

## Definitions used here

| Term | Meaning in SynTask |
|---|---|
| **SLI** | *Service Level Indicator* — a reliability number we actually measure from Prometheus data. |
| **SLO** | *Service Level Objective* — an internal engineering target for an SLI, with an error budget. |
| **SLA** | *Service Level Agreement* — an external, contractual promise to customers, typically with credits/penalties. **No SLA is defined or implied by this document.** |

An SLO is breached when the SLI misses its target. An SLA is a commercial
commitment; it must be negotiated and supported by evidence, and is not created
by writing a number in a dashboard.

## Measurement window

**Rolling 7 days** for both SLOs.

Rationale: Prometheus retains 30 days in production and 15 days in development
(`docker-compose.prod.yml` / `docker-compose.dev.yml`), so a 7-day rolling window
is fully measurable in both environments. A longer window would be truncated in
development and would make the error budget react too slowly for early-stage use.

Data source: the existing Topic 2 RED metrics — no new application metrics:

- `syntask_http_requests_total{method,normalized_route,status_code}`
- `syntask_http_request_duration_seconds_bucket{method,normalized_route,le}`

Health, readiness, `/metrics`, debug and OpenAPI endpoints are already excluded
from these metrics by the Prometheus middleware, so they cannot skew the SLIs.

## SLO 1 — API availability

- **Target:** availability **>= 99.5%** over 7 days.
- **SLI:** successful API requests / all API requests.
  - success = any response that is **not 5xx**. HTTP 5xx responses are treated
    as service failures; 1xx–4xx are not service failures (client/auth errors,
    validation, 404s).
- **Error budget:** 0.5% of requests may fail.

## SLO 2 — API latency

- **Target:** **>= 95%** of API requests complete within **2.5 seconds** over 7 days.
- **SLI:** `syntask_http_request_duration_seconds_bucket{le="2.5"}`
  / `syntask_http_request_duration_seconds_bucket{le="+Inf"}`.
- **Error budget:** 5% of requests may exceed 2.5s.
- 2.5s was chosen because it is already a histogram bucket (no middleware change)
  and because the metric is aggregate (all routes), including reports and AI
  routes that are legitimately slower than ordinary reads/writes.

### Relationship to the existing NFR target

`docs/architecture/NON_FUNCTIONAL_REQUIREMENTS.md` proposes **p95 <= 500 ms for
ordinary reads/writes, with separate budgets for reports/AI**, status *proposed
launch baseline requiring approval and evidence*.

That document is unchanged and remains the aspirational product/performance
target. The implemented SLO above is deliberately looser and aggregate because
the current histogram is not split by route class. The 500 ms p95 target is
**not** implemented as an SLO and is **not** silently redefined. Once per-class
route metrics exist, a separate tighter SLO for ordinary reads/writes can be
added, and the 500 ms proposal can be reconciled with it.

## Error budgets

Allowed bad-event ratio = `1 - SLO target`.

- Availability: `1 - 0.995 = 0.005` (0.5%)
- Latency: `1 - 0.95 = 0.05` (5%)

Budget consumed = `(1 - SLI) / (1 - target)`. Budget remaining =
`1 - consumed`, exposed as a ratio (`1` = full, `0` = exhausted, negative = over
budget).

Availability and latency budgets are independent; a small budget overspend at
this stage is a signal to slow down and investigate, not a paging condition.

## Recording rules

Defined in `observability/prometheus/rules/syntask-slos.yml`, evaluated every
5 minutes (`interval: 5m`) because a 7-day `rate()` at 15s cadence is wasteful.
They aggregate with `sum(...)`, so they produce zero-label series — no
high-cardinality recording rules.

| Recording rule | Meaning |
|---|---|
| `syntask:sli_availability:ratio_7d` | Availability SLI |
| `syntask:sli_latency_le_2_5_seconds:ratio_7d` | Latency SLI |
| `syntask:slo_availability:error_budget_remaining_ratio_7d` | Availability error budget remaining |
| `syntask:slo_latency:error_budget_remaining_ratio_7d` | Latency error budget remaining |

**No-traffic handling:** with no requests in the window there are no failures to
observe, so the SLI falls back to `1` (`or vector(1)`) and the budget shows
100% remaining. This is a *measurement gap*, not evidence of reliability — a
quiet service is not a proven reliable service.

Dashboard: **SynTask SLO Overview** (Grafana folder `SynTask`).

## Public SLA claim inconsistency (documented, not silently accepted)

`frontend/src/pages/NewLanding.jsx` advertises `99.9%  Uptime SLA` and an
Enterprise feature `SLA & Uptime Guarantee`.

This is **unsupported by repository evidence**:

- There is no approved SLA document, no measured 99.9% availability SLI, and no
  contractual commitment recorded anywhere in `docs/`.
- The only internal target is the *proposed* 99.5% availability baseline in the
  NFR document.
- The 99.9% figure is higher than the internal 99.5% proposal and roughly 5×
  the allowed error budget (0.1% vs 0.5%).

Per the scope of this work, the marketing page is **not** modified. The
inconsistency is recorded here so that no reader treats the 99.9% claim as an
engineering SLO. Resolving it is a product/legal decision: either approve a
supported contractual SLA, or correct the public claim. Until then:

- **Engineering target (SLO):** 99.5% availability, rolling 7 days.
- **Public marketing claim (SLA):** 99.9% — unsupported, must not be used as an
  engineering target.
