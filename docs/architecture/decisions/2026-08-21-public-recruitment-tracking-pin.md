# 2026-08-21: Public Recruitment Tracking PIN
Status: Accepted
Date: 2026-08-21
Owners: Product Engineering

## Context
Candidates need to track application progress without SynTask employee login. A tracking code alone is guessable enough to require a second proof, and public pages must not expose tenant ids, internal database ids, HR notes, DOB-derived secrets, or cross-company data.

## Decision
Anonymous application submission returns a public tracking code and one-time random temporary password/PIN. The application and a separate temporary `CandidatePortalCredential` document store only hashes of the PIN. Public tracking requires both values and returns a public-safe progress timeline derived from the existing candidate/application lifecycle. DOB can be collected as candidate profile data, but it is not used to generate the tracking password.

## Alternatives considered
Tracking by code only was rejected because it weakens privacy. Employee login was rejected because applicants are not SynTask users. Predictable passwords such as `name.surname@dob` were rejected because they expose a guessable secret derived from personal data. Email-only magic links remain a possible future enhancement but are not required for Phase 1.

## Consequences and risks
Candidates must keep or print the PIN after submission because it is shown only once. Existing applications without a PIN cannot use secure public tracking until a PIN reset or resend flow is added. Temporary portal credential documents are removed when candidates reach rejected, withdrawn, archived, joined, or employee states, while core recruitment records remain for HR audit and reporting.

## Migration and rollback
The added application/candidate credential fields are optional, so old documents remain readable. Rolling back removes PIN verification for new tracking flows and should be paired with disabling the public tracking form and removing `recruitment_candidate_portal_credentials` only after confirming no active public tracking sessions depend on it.

## Verification
Verify anonymous apply returns tracking code plus PIN, wrong or missing PIN returns not found/required, HR lifecycle updates application status, public tracking shows updated milestones without private data, and terminal lifecycle decisions remove temporary portal credentials.
