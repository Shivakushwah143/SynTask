# SynTask Non-Functional Requirements

Status: proposed launch baseline requiring approval and evidence  
Last reviewed: 2026-07-16

These targets make “production ready” measurable. They are not service-level promises until approved and verified.

| Area | Initial target | Evidence |
|---|---|---|
| Availability | 99.5% monthly for authenticated core APIs, excluding approved maintenance | Synthetic checks and incident log |
| API latency | p95 <= 500 ms for ordinary reads/writes; separate budgets for reports/AI | Route metrics |
| Error rate | <1% unexpected 5xx over 15 minutes | Central metrics/logs |
| Capacity | Launch concurrency with 30% headroom and no tenant leakage | Versioned load report |
| Recovery | Proposed RTO 4h and RPO 24h until business approval | Timed restore drill |
| Jobs | 99% ordinary jobs start within 5m; terminal failures visible/replayable | Queue metrics |
| Security | No unresolved exploitable critical/high issue | Security reports |
| Tenant isolation | Zero known cross-tenant disclosure | Automated isolation suite |
| Accessibility | Core journeys meet WCAG 2.1 AA | Scan plus manual evidence |
| Browsers | Latest two Chrome, Edge, Firefox; current Safari after validation | Compatibility matrix |
| Observability | API/job correlation and alerts with owners/runbooks | Demonstration |
| Integrity | Financial/provider callbacks idempotent; material changes audited | Reconciliation tests |

## Security and privacy

- Deny by default when identity, tenant, hierarchy or entitlement cannot be established.
- Never trust client `company_id` without binding it to authorized scope.
- Encrypt transport; keep secrets outside source control; rotate compromised credentials.
- Do not log tokens, passwords, signing links, raw AI secrets or unnecessary personal content.
- Approve retention, export and deletion rules by domain before contractual launch.
- Rate-limit authentication, public forms, signing links, AI and expensive reports.

## Reliability

- Distinguish liveness from dependency readiness.
- External calls use timeouts and bounded jittered retries; unsafe writes require idempotency.
- One logical scheduler owns recurring work; workers scale independently.
- A backup is not accepted until restoration is demonstrated.
- Deployments require compatible data change, verification and rollback.

## Performance profiles

Before testing, approve active tenants, users/tenant, peak sessions, requests/second, record counts, file sizes, job rate, report range and AI concurrency. Test ordinary, peak, burst, soak and degraded-dependency profiles.

