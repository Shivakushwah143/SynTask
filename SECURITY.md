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
- [ ] Test super-admin accounts are deleted before launch
