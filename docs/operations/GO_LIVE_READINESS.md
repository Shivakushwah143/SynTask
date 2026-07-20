# SynTask Go-Live Readiness

Status: reusable evidence-based release gate  
Release/version:  
Target date:  
Release owner:

Do not check an item without evidence. `N/A` requires an owner and rationale. Any unresolved critical item is an automatic no-go.

## Scope and governance

- [ ] Release commit/tag and change summary are frozen.
- [ ] PRDs and acceptance criteria are approved; deferrals are explicit.
- [ ] Product, Engineering, QA, Security, Operations, and Support owners are named.
- [ ] Dependencies, provider changes, and maintenance window are confirmed.
- [ ] Residual risks/waivers have approvers and expiry/review dates.

## Product and users

- [ ] Critical journeys pass UAT for applicable roles/plans/modules.
- [ ] Permission and entitlement matrix is reviewed.
- [ ] Empty/loading/validation/failure/recovery states are acceptable.
- [ ] Onboarding, admin instructions, and support knowledge are ready.
- [ ] Analytics and success/guardrail dashboards are verified.

## Quality and security

- [ ] CI, regression, E2E, and tenant-isolation suites pass on the release build.
- [ ] No critical defects; high defects are fixed or explicitly accepted.
- [ ] Dependency, source, container, and secret scans meet policy.
- [ ] Auth, hierarchy, module, and direct-API negative tests pass.
- [ ] Public endpoints, uploads, signing links, webhooks, and rate limits are tested.
- [ ] Privacy, retention/deletion, audit, and AI data-sharing decisions are approved.

## Performance and reliability

- [ ] NFR targets and launch capacity assumptions are approved.
- [ ] Load/burst/soak results meet thresholds with headroom.
- [ ] Health/readiness checks and alerts are demonstrated.
- [ ] Worker retry, terminal failure, backlog, and scheduler behavior are verified.
- [ ] Database indexes and high-volume queries are reviewed.
- [ ] Provider timeout, rate-limit, and unavailable behavior are tested.

## Infrastructure and data

- [ ] DNS, TLS, firewall, CORS, hosts, and headers are verified.
- [ ] Production secrets are external, least-privilege, and rotated where needed.
- [ ] MongoDB, Redis, object/file storage, and capacity are production-approved.
- [ ] Backup completed and restore drill meets approved RTO/RPO.
- [ ] Migration/backfill is timed, observable, resumable, and rollback-aware.
- [ ] Telemetry avoids secrets and provides safe correlation.

## Deployment and rollback

- [ ] Deployment was rehearsed in staging.
- [ ] Compatibility and rollout order are confirmed.
- [ ] Rollback commit/images and commands are accessible.
- [ ] Data/external side-effect reconciliation is approved.
- [ ] Smoke tests and stabilization monitoring have executors.

## Operations and support

- [ ] Alert ownership, escalation contacts, and incident channel are active.
- [ ] Runbooks cover API, database, Redis, worker, storage, provider, and certificate failures.
- [ ] Support has release notes, known issues, workarounds, and messaging.
- [ ] Status-page/incident communication owners are assigned.
- [ ] Post-launch monitoring and handoff are scheduled.

## Go/no-go record

| Function | Name | Decision | Evidence/comments | Time |
|---|---|---|---|---|
| Product | | | | |
| Engineering | | | | |
| QA | | | | |
| Security | | | | |
| Operations | | | | |
| Release owner | | GO / NO-GO | | |

## Post-launch

- [ ] Run smoke tests and compare metrics to baseline.
- [ ] Monitor errors, latency, auth failures, queue, database, storage, and callbacks.
- [ ] Confirm analytics and audit events.
- [ ] Reconcile financial/provider events and failed jobs.
- [ ] Record incidents, feedback, and rollback checkpoints.
- [ ] Complete release review with owners and dates.

