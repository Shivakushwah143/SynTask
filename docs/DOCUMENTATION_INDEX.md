# SynTask Documentation Index

Status: living documentation
Last reviewed: 2026-07-16

This is the canonical entry point. **Observed** means supported by repository evidence. **Verified** means exercised in a named environment. **Target** is intended design and is not proof of deployment.

## Core documents

| Document | Purpose | Owner | Review trigger |
|---|---|---|---|
| [Product requirements](product/PRD.md) | Canonical product scope, including proposed AI-enabled Phase 2 agents, notifications, Microsoft 365, user stories, acceptance criteria and measures | Product | Feature/priority change |
| [SOP Library user flow](user-flows/sop-library.md) | Implemented in-app user manual flow, universal sidebar access, role-aware article visibility and tests | Product + Engineering | User-facing module or permission change |
| [Detailed architecture](architecture/DETAILED_ARCHITECTURE.md) | Current and target design, boundaries, data and risks | Engineering | Component/dependency/data-flow change |
| [Non-functional requirements](architecture/NON_FUNCTIONAL_REQUIREMENTS.md) | Security, availability, performance and recovery targets | Product + Engineering | Release/operational change |
| [Production deployment guide](infrastructure/PRODUCTION_DEPLOYMENT_GUIDE.md) | Preparation, deployment, verification and rollback | Platform | Infrastructure/config change |
| [Master test plan](quality/TEST_PLAN.md) | Strategy, coverage, evidence and exit criteria | QA + Engineering | Requirement/risk change |
| [Go-live readiness](operations/GO_LIVE_READINESS.md) | Evidence-based launch gate | Release owner | Every production launch |

## Supporting documents

- [Security](infrastructure/SECURITY.md)
- [CI/CD](infrastructure/CI_CD.md)
- [Startup guide](infrastructure/STARTUP_GUIDE.md)
- [User flows](user-flows/README.md)
- [API documentation](../backend/API_DOCUMENTATION.md)
- [Database schema](../backend/DATABASE_SCHEMA.md)
- [PRD template](product/PRD_TEMPLATE.md)
- [Architecture decisions](architecture/decisions/README.md)
- [Phase 1 Work Foundation Report](../PHASE1_WORK_FOUNDATION_REPORT.md)
- [Phase 2 Task Execution Report](../PHASE2_TASK_EXECUTION_REPORT.md)
- [Phase 3 Work Experience Report](../PHASE3_WORK_EXPERIENCE_REPORT.md)
- [Phase 4 Work Requests and Scheduled Work Report](../PHASE4_REQUESTS_SCHEDULED_WORK_REPORT.md)
- [Phase 5 Time Project Control Report](../PHASE5_TIME_PROJECT_CONTROL_REPORT.md)
- Repository maintenance rules: [`AGENTS.md`](../AGENTS.md)

## Ownership

Product owns problems, scope, priority and acceptance. Engineering owns architecture and operations accuracy. QA owns evidence and release-quality reporting. Security owns security acceptance. The release owner owns go/no-go.
