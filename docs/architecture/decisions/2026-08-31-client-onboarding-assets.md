# Client onboarding assets
Status: Accepted
Date: 2026-08-31
Owners: SynTask platform team

## Context
Client onboarding needs to track requested brand/material assets, manual submissions received through channels such as WhatsApp or email, and internal verification before delivery readiness. SynTask already has Client Onboarding, Client file storage, CRM Contacts, and CRM Activity, so a separate asset file store would duplicate ownership and permissions.

## Decision
Store asset requirements and asset submissions additively under `Client.lifecycle_metadata.onboarding`. Requirements track category, required/optional state, status, timestamps, verifier, and notes. Submissions track source, received contact/user/date, files stored through existing Client document/file references, notes, and many-to-many requirement mappings. The backend calculates required-asset progress from verified requirements only and logs requested, submission, upload, verification, and replacement actions to existing CRM Activity.

## Tenant Isolation
The tenant key is `Client.company_id`. Asset APIs load the Client through existing Client permissions, validate received-from contacts through the linked same-tenant CRM Company contacts, validate internal users by company, and store uploaded files on the same Client. Arbitrary cross-tenant file/contact linking is not supported.

## Consequences
Manual internal collection is the primary workflow and client portal submissions can be added later by writing the same submission shape. Existing Client documents remain visible in Files/Documents; asset submissions reference those stored files instead of copying them into another collection. Legacy onboarding `assets` rows remain readable through a compatibility projection.

## Verification
Regression tests cover WhatsApp/manual submissions, one file mapped to multiple requirements, one requirement with multiple files, received-not-verified readiness, replacement flow, optional asset behavior, activity logging, and unrelated contact rejection. Frontend verification uses the Vite production build.
