# Distributed tracing (OpenTelemetry + Grafana Tempo)

Status: implemented (Topics 9 & 10 observability phase)
Last reviewed: 2026-09-13

This document describes the distributed tracing pipeline added on top of the
existing metrics, logs and alerting stack. It complements — and never replaces —
the custom AI observability system described in
[`backend/app/ai/observability/`](../../backend/app/ai/observability/).

## Components

| Component | Image (pinned) | Role | Exposure |
|---|---|---|---|
| Tempo | `grafana/tempo:2.6.1` | Trace store, OTLP receivers + query API | internal only |
| Grafana | `grafana/grafana:11.2.2` | Tempo/Loki/Prometheus datasources, Explore, dashboards | loopback only |
| Prometheus | `prom/prometheus:v2.53.3` | Scrapes Tempo/backend; deployment annotations data | loopback only |
| Loki + Alloy | `grafana/loki:3.2.2` / `grafana/alloy:v1.5.1` | Structured logs; `trace_id` correlation link | internal only |

Tempo configuration lives in [`observability/tempo/tempo.yml`](../../observability/tempo/tempo.yml)
(single binary, local persistent volume `tempo_data`, OTLP gRPC `4317` and HTTP
`4318`, 48 h block retention, usage reporting disabled).

## Backend instrumentation

Bootstrap module: [`backend/app/observability/tracing.py`](../../backend/app/observability/tracing.py).

* `setup_tracing(service_name)` builds a `TracerProvider` with an OTLP/gRPC
  `BatchSpanProcessor` and a parent-based ratio sampler. It is idempotent, runs
  once per process and is a safe no-op when the SDK is absent or tracing is
  disabled.
* The API process (`app.main`) claims `service.name = syntask-backend`.
* The worker process (`app.worker.celery_app`, the Celery entrypoint) claims
  `service.name = syntask-worker`.

Resource attributes are bounded and non-identifying:

| Attribute | Source |
|---|---|
| `service.name` | `syntask-backend` / `syntask-worker` |
| `service.version` | `SYNTASK_RELEASE_VERSION` (or `settings.VERSION`) |
| `deployment.environment` | `ENVIRONMENT` |
| `vcs.revision` | `SYNTASK_RELEASE_COMMIT` |
| `vcs.ref.head.name` | `SYNTASK_RELEASE_BRANCH` |

User IDs, emails, company IDs and request IDs are never resource attributes.

## Instrumentation coverage

| Layer | Mechanism | Status |
|---|---|---|
| Incoming HTTP | `FastAPIInstrumentor.instrument_app` (server spans) | enabled |
| Outbound HTTP | `HTTPXClientInstrumentor` (AI providers, Meta, Zoom, eTimeOffice) | enabled |
| Redis | `RedisInstrumentor` (sync + `redis.asyncio`) | enabled |
| MongoDB / Motor / Beanie | `PymongoInstrumentor` (PyMongo command events that Motor uses) | enabled |
| Celery producer + worker | `CeleryInstrumentor` (context propagation API → task) | enabled |
| Business operations | manual `trace_span` (eTimeOffice sync, payroll payslip backfill) | enabled |

Health and probe paths (`/health`, `/livez`, `/readyz`, `/metrics`, OpenAPI
routes) are excluded from tracing to avoid noise.

### Known gaps

* Motor/Beanie spans rely on PyMongo command monitoring; if a future Motor or
  PyMongo upgrade changes that surface, Mongo spans may become coarse. Metrics
  and logs still cover the gap.
* Qdrant has no compatible OpenTelemetry instrumentation and is **not**
  instrumented; RAG vector calls are visible only through HTTP spans and logs.
* Celery beat scheduling is not traced beyond the worker service name.

## Sampling

Sampling is configurable and documented:

| Variable | Default | Purpose |
|---|---|---|
| `OTEL_TRACES_ENABLED` | `true` in production, `false` otherwise | Master switch |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://tempo:4317` | OTLP/gRPC endpoint |
| `OTEL_TRACES_SAMPLER` | `traceidratio` | `always_on` / `always_off` / `traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | `0.1` production, `1.0` otherwise | Root-span ratio (0.0–1.0) |

Production defaults to a **10 %** root-span sample so tracing overhead stays
bounded. Errors remain diagnosable through RED metrics and structured logs even
when a trace is not sampled. Both Compose stacks explicitly enable tracing and
set the ratio (`0.1` in production, `1.0` in development) so behaviour does not
depend on `backend/.env`.

## Log ↔ trace correlation

Stacked logs remain keyed by `request_id`; `trace_id` is attached alongside it
and never replaces it:

* `RequestIDMiddleware` adds `trace_id` to the structured access log line.
* `_TraceContextFilter` (attached to the log handler in
  `app/core/logging_config.py`) injects the active `trace_id` into every record.
* Alloy parses `trace_id` and exposes it as Loki structured metadata.
* The provisioned Loki datasource has a `TraceID` derived field linking to
  Tempo, so a log line opens the matching trace.
* The Tempo datasource links back to Loki logs for a span's time range.

Operator flow: **Grafana log line → click `trace_id` → Tempo trace → Loki logs**.

## Relationship to custom AI observability

The AI trace/span system is unchanged and remains authoritative for LLM/tool
observability. `AITrace.otel_trace_id` stores the OTLP trace id as an optional
cross-reference so an AI trace can be located in Tempo; the AI storage model,
retention and dashboards are not migrated or replaced.

## Privacy and security

* No secrets, prompts, tokens, user IDs, emails or company IDs are placed in
  span attributes or resource attributes.
* Tempo publishes no ports in production; OTLP receivers are reachable only on
  the internal `syntask` Docker network. Grafana/Prometheus/Alertmanager remain
  loopback-bound as before.
* `usage_report.reporting_enabled: false` prevents Tempo phoning home.

## Validation

* Unit tests: `backend/tests/test_observability_tracing.py`.
* Config validation: `docker compose -f docker-compose.prod.yml config`,
  `observability/tempo/tempo.yml` YAML load, Grafana datasource provisioning.
* Runtime trace flow (backend span → `trace_id` in the structured log) is
  exercised with the pinned OTel SDK; see the phase completion report.

## Related

* [SLIs and SLOs](SLOS.md)
* [Deployment and rollback runbook](../runbooks/DEPLOYMENT_ROLLBACK.md)
* [ADR: OpenTelemetry + Tempo tracing](../architecture/decisions/2026-09-13-opentelemetry-tempo-tracing.md)
