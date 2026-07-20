# SynTask Repository Instructions for Codex

These instructions apply to every change in this repository. Documentation is part of the definition of done.

## Required behavior

For every feature, bug fix, integration, permission change, data-model change, deployment change, or user-visible behavior change:

1. Review documentation impact before declaring the work complete.
2. Update affected documents in the same change.
3. Document implemented behavior only; label future designs `Proposed` or `Target state`.
4. Preserve tenant isolation by documenting tenant key, authorization rule, role/module gates, and negative cross-tenant tests.
5. Update diagrams when components, boundaries, integrations, queues, stores, or request paths change.
6. Update acceptance criteria and tests when behavior changes.
7. Add an ADR under `docs/architecture/decisions/` for a durable technical decision or significant trade-off.
8. Never put secrets, live credentials, personal data, or production values in docs.

## Documentation map

| Change | Review or update |
|---|---|
| Feature/workflow | `docs/product/PRD.md`, relevant `docs/user-flows/*.md`, test plan |
| Permission/module/ownership | PRD access rules, architecture security section, negative tests |
| API/schema/error | OpenAPI behavior, `backend/API_DOCUMENTATION.md`, PRD |
| Model/index/retention | `backend/DATABASE_SCHEMA.md`, architecture data section, migration/rollback notes |
| Integration/job/webhook | Architecture, deployment configuration, failure/retry/idempotency tests |
| Infrastructure/config | Deployment guide, go-live checklist, README setup/prerequisites |
| Security/privacy | Security document, operational controls, security tests |
| Breaking/release change | README, release notes, deployment/rollback, go-live evidence |

## README maintenance

Review `README.md` in every feature or release change. Update it when product scope, prerequisites, setup commands, environment variables, ports, services, repository structure, canonical documentation links, deployment methods, or operational limitations change. Keep it an accurate entry point and link to detailed docs.

## Completion response

State which documentation files were reviewed or changed. If none changed, explicitly state why the implementation had no documentation impact.

