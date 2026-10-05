# ADR: Safe deployment, release identity and rollback

## Status

Accepted

## Context

The previous deployment workflow ran

```bash
docker compose -f docker-compose.prod.yml down --remove-orphans
docker compose -f docker-compose.prod.yml up -d --build --wait --wait-timeout 300
```

The `down` step guaranteed downtime: every deploy removed the whole stack
(including the observability services) before recreating it. There was no
release identity, no post-deploy verification beyond container health, and no
automated rollback.

The deployment target is a single VPS running Docker Compose. Kubernetes and a
blue/green traffic splitter are out of scope.

## Decision

Introduce a verified deployment path with release identity and rollback:

* `scripts/deployment/deploy.sh` — builds, then updates services with
  `docker compose up -d --remove-orphans` (plus `--wait` when supported) and
  **never** runs `docker compose down`. Volumes, networks and databases are
  preserved. It is idempotent and refuses unsafe environment/compose
  combinations; production requires `--yes`/`DEPLOY_CONFIRM=yes`.
* `scripts/deployment/verify_release.sh` — bounded-retry health gate covering
  `/livez`, `/readyz`, the Prometheus backend target and the frontend. Deployment
  success is only recorded after this gate passes.
* Release identity — `deploy.sh` exports `SYNTASK_RELEASE_{COMMIT,VERSION,BRANCH,BUILT_AT}`;
  the backend exposes them through structured logs (`event=deployment`), the
  `syntask_build_info` and `syntask_release_deployed_timestamp_seconds` metrics,
  `/readyz`, `/debug`, and OTLP resource attributes.
* Deployment markers — each deploy appends one JSON line to
  `.deploy-state/<env>.history.jsonl` (gitignored) and writes
  `.deploy-state/<env>.json`. Backend/worker startup emits the same
  `event=deployment` log line into Loki, and the provisioned deployment
  dashboard annotates deployments from those logs.
* Rollback — before deploying, the previous commit is read from the state file.
  If the update or health gate fails, `deploy.sh` checks out the previous commit,
  rebuilds, updates services and re-verifies (`--rollback` /
  `scripts/deployment/rollback.sh` for manual use).
* CI/CD — `.github/workflows/deploy.yml` now writes env files from GitHub Secrets
  and invokes `deploy.sh`. CI additionally validates shell syntax, the absence of
  `docker compose down` in the deploy path, and both Compose configs.

## Alternatives considered

* **Blue/green or canary with a second stack** — rejected: not compatible with
  the single-VPS Compose architecture without significant new infrastructure.
* **Pre-built image tags + `docker compose up` on the old tag** — a good future
  improvement, but the current stack builds images from source; a git-based
  rollback is simpler and sufficient today.
* **Keeping `down` for a "clean" deploy** — rejected; it guarantees downtime for
  no benefit.

## Consequences and risks

* Updating a container still briefly interrupts that service. This is
  documented as *minimal downtime*, not zero downtime.
* `git`-based rollback restores code and Compose files but not environment files;
  env changes must be reverted manually.
* Rollback rebuilds images (no pre-baked previous-image tag).
* Deployment state files are runtime artifacts and are gitignored.

## Migration and rollback

The new path replaces the `down`/`up` sequence in the workflow. The old commands
remain available for manual infrastructure resets but must not be used for normal
application deployments. Rolling back a release is now a documented, scripted
operation.

## Verification

* `bash -n` on all deployment scripts; CI fails if `deploy.sh` invokes
  `docker compose down`.
* Health-gate success returns `0`; an unreachable release returns non-zero within
  the bounded timeout.
* `deploy.sh --dry-run` shows the plan without executing it.
* `docker compose -f docker-compose.{dev,prod}.yml config` validates both stacks.
