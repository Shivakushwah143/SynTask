# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce XSS token-theft risk and require authentication for production MongoDB and Redis.

**Architecture:** Sanitize every frontend HTML render through one helper. Move backend auth toward httpOnly cookies while keeping bearer response compatibility. Require compose-level DB/cache credentials through environment variables.

**Tech Stack:** React, Vitest, DOMPurify, FastAPI, Docker Compose, MongoDB, Redis.

## Global Constraints

- Keep Google login unchanged because it is already implemented.
- Preserve bearer-token API response compatibility during cookie migration.
- Do not hard-code production secrets in compose.

---

### Task 1: Sanitized HTML Rendering

**Files:**
- Create: `frontend/src/utils/sanitizeHtml.js`
- Create: `frontend/src/utils/sanitizeHtml.test.js`
- Modify: `frontend/src/components/EmailComposer.jsx`
- Modify: `frontend/src/pages/crm/leads/ai.jsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `sanitizeHtml(html: unknown): string`
- Consumes: DOMPurify browser/jsdom sanitizer

- [ ] Write a failing test that malicious HTML loses scriptable content.
- [ ] Install or declare `dompurify`.
- [ ] Implement `sanitizeHtml`.
- [ ] Route both `dangerouslySetInnerHTML` call sites through helper.
- [ ] Run targeted Vitest.

### Task 2: Cookie-Compatible Auth Migration

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/api/v1/endpoints/auth.py`
- Modify: `backend/app/api/dependencies.py`
- Modify: `backend/app/core/security.py`
- Modify: `frontend/src/api/axios.js`
- Modify: `frontend/src/utils/storage.js`

**Interfaces:**
- Produces: httpOnly `access_token` and `refresh_token` cookies on login/google/refresh.
- Consumes: existing bearer tokens until frontend migration completes.

- [ ] Add cookie settings.
- [ ] Set auth cookies alongside JSON tokens.
- [ ] Read access token from cookie when Authorization header absent.
- [ ] Refresh via cookie when request body lacks refresh token.
- [ ] Clear cookies on logout.
- [ ] Keep storage helpers compatible during rollout.

### Task 3: Compose DB/Redis Auth

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `REDIS_PASSWORD`.

- [ ] Update MongoDB URL to include credentials and `authSource=admin`.
- [ ] Start Redis with `--requirepass`.
- [ ] Update healthchecks to authenticate.
- [ ] Document required env vars in example.

### Task 4: Verification

**Files:**
- Existing project tests/config.

- [ ] Run targeted frontend tests.
- [ ] Run backend import/syntax checks.
- [ ] Run `docker compose -f docker-compose.prod.yml config`.
