# Security Policy - SynTask

## Supported Versions
SynTask is in active development. The current codebase is the supported version.

## Reporting a Vulnerability
Report vulnerabilities to `security@alphanexis.com`.

Expected response time: 48 hours. Coordinated disclosure target: 90 days after a fix is deployed.

## Security Architecture
### Authentication
- JWT bearer access and refresh tokens.
- Server-side token revocation through Redis blacklist.
- bcrypt password hashing.
- Optional TOTP 2FA.
- Password reset tokens are stored as hashes.

### Authorization
- Five-level RBAC: Super Admin, Admin, Manager, Lead, Employee.
- Module-based access via the user `modules` field.
- Company-scoped data isolation via `company_id`.

### Data Protection
- MongoDB Atlas connections use TLS.
- TOTP secrets are encrypted with Fernet using `ENCRYPTION_KEY`.
- Passwords are bcrypt hashes and are never reversible.
- `.env` files are gitignored and must not be committed.

### Transport and Browser Security
- Production should terminate HTTPS at Nginx or another reverse proxy.
- Frontend Nginx config includes CSP, HSTS, Referrer-Policy, X-Frame-Options, and X-Content-Type-Options.
- JWTs are not persisted in frontend localStorage.

### Observability and Telemetry Security
- The observability stack is never publicly exposed: Grafana, Prometheus and Alertmanager bind to `127.0.0.1`; Loki, Alloy and Tempo publish no ports at all and are reachable only on the internal `syntask` Docker network.
- Tempo's OTLP receivers (`4317` gRPC / `4318` HTTP) are internal only; `usage_report.reporting_enabled` is disabled.
- Traces never contain secrets, credentials, prompts, user IDs, emails or company IDs. OpenTelemetry resource/span attributes are limited to bounded release and environment identities.
- Structured logs keep the existing credential redaction, and `trace_id` is added alongside `request_id` without exposing request payloads.
- `GRAFANA_ADMIN_PASSWORD` is required for the production Grafana service and supplied via GitHub Secrets; it is never committed.

## Known Limitations
- Chat messages are not end-to-end encrypted.
- Local file uploads are not encrypted at rest.
- Audit logs are ordinary MongoDB documents and are not tamper-proof.
- Redis availability is required for effective token revocation; if Redis is unavailable, blacklist checks fail open as currently implemented.

## Deployment Security Checklist
- [ ] `ENVIRONMENT=production`
- [ ] `SECRET_KEY` is a random 64-character hex value or stronger
- [ ] `ENCRYPTION_KEY` is a valid Fernet key
- [ ] MongoDB Atlas credentials are rotated and least-privilege
- [ ] Redis is running and reachable from the backend
- [ ] `ALLOWED_ORIGINS` contains only trusted frontend origins
- [ ] `ALLOWED_HOSTS` contains only trusted hostnames
- [ ] HTTPS certificate is active
- [ ] SMTP, Zoom, Stripe, Razorpay credentials are set only when needed
- [ ] `GRAFANA_ADMIN_PASSWORD` is set and Grafana/Prometheus/Alertmanager remain loopback-bound
- [ ] Tempo OTLP endpoints are internal-only (no published ports)
- [ ] Test super-admin accounts are deleted before launch
