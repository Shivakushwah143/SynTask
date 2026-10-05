# Incident: <short title>

Copy this file to `docs/observability/incidents/YYYY-MM-DD-<slug>.md` (create the
folder on first use). Keep it factual: record what happened, not what should have
happened. Never include secrets, credentials, or personal data.

> **Controlled drills** use the same template but must be labelled
> `Type: controlled drill`. Drill timings measure the *observability stack*, not
> production reliability, and must never be aggregated as historical MTTR.

## Summary

- **Type:** real incident | controlled drill
- **Severity:** critical | major | minor
- **Status:** ongoing | mitigated | resolved
- **Services affected:**
- **User impact:**

## Timings

| Event | Timestamp (UTC) |
|---|---|
| Incident start | |
| Detection | |
| Restoration (service serving normally again) | |

### MTTD and MTTR — defined

Organizations expand these differently, so the definitions used by SynTask are
stated explicitly:

- **MTTD** (Mean Time To Detect) = **detection time − incident start time**.
  How long the failure existed before anyone or anything noticed it.
- **MTTR** (Mean Time To Restore) = **incident start time → service
  restoration time**. SynTask intentionally defines MTTR as time to *restore
  service*, not time to deploy a permanent fix.
- A single incident yields one MTTD and one MTTR. "Mean" applies only when
  averaging across multiple incidents.

| Metric | Value |
|---|---|
| MTTD | detection time − incident start |
| MTTR | restoration time − incident start |

## Detection

- **Detection method:** (Prometheus alert / dashboard / log search / user report)
- **Alert(s) that fired:**
- **Which signal fired first:**

## Impact

- Routes/features degraded or unavailable:
- Tenants/companies affected (no personal data):
- Data loss or corruption: none / describe
- Workaround available:

## Timeline

All timestamps UTC. One line per event.

| Time | Event |
|---|---|
| | |
| | |

## Root cause

What actually broke, and the mechanism that turned it into user impact.

## Mitigation

What was done to restore service (may be temporary).

## Permanent fix

What change removes the root cause (code, config, infrastructure).

## Prevention

- New/altered alert, SLO, or dashboard:
- Test or guard added:
- Runbook updated:

## Follow-up

| Action | Owner | Due |
|---|---|---|
| | | |
