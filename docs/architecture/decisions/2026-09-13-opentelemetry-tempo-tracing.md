# ADR: OpenTelemetry + Grafana Tempo distributed tracing

## Status

Accepted

## Context

SynTask already had production structured logs with `request_id`, Prometheus RED
metrics, Grafana dashboards, Loki/Alloy log shipping, Alertmanager, SLOs and
incident tooling. Those answer "what failed" and "how much", but not "where did
this one request spend its time" across the FastAPI backend, MongoDB/Redis, and
Celery.

A separate custom AI observability system already stores per-request LLM/tool
traces (`AITrace`/`AISpan`). It must keep working; the infrastructure tracing
must not duplicate or replace it.

## Decision

Add OpenTelemetry tracing to the backend and worker, exported over OTLP/gRPC to
a single-binary Grafana Tempo instance, with Grafana auto-provisioned as the
trace UI.

* A dedicated backend module (`app/observability/tracing.py`) configures the
  `TracerProvider`, OTLP exporter, sampler and instrumentations. Everything is
  guarded so a missing SDK, disabled flag or unreachable collector degrades to a
  no-op and never breaks startup or requests.
* FastAPI, HTTPX, Redis (sync + asyncio), PyMongo (also used by Motor/Beanie)
  and Celery are auto-instrumented. Instrumentation is applied only when tracing
  is enabled so development and CI stay quiet by default.
* The API and worker processes claim distinct, bounded `service.name` values
  (`syntask-backend`, `syntask-worker`).
* Resource attributes are limited to release/environment identities. No user,
  tenant or request identifiers are used as resource or span attributes.
* Sampling is configurable (`OTEL_TRACES_SAMPLER_ARG`), defaulting to 10 % in
  production to bound overhead while errors remain visible via metrics/logs.
* `trace_id` is added to structured logs alongside `request_id`; Loki exposes it
  as structured metadata and Grafana links logs to Tempo and back.
* A small number of manual business spans are added around expensive operations
  (eTimeOffice attendance sync, payroll payslip backfill) instead of instrumenting
  every function.
* The existing AI observability system is preserved; `AITrace.otel_trace_id`
  stores an optional cross-reference to the OTLP trace.
* Tempo runs internal-only (no published ports in production), backed by a
  persistent volume, with 48 h block retention and usage reporting disabled.

## Alternatives considered

* **OpenTelemetry Collector sidecar** — rejected as unnecessary for a single-VPS
  Compose deployment; the backend can export OTLP directly to Tempo.
* **Jaeger** — rejected to stay within the existing Grafana stack and its
  log↔trace correlation.
* **Reusing the AI trace store for infra tracing** — rejected: different data
  model, retention and blast radius; would risk the AI telemetry pipeline.
* **Instrumenting every function** — rejected as tracing noise.

## Consequences and risks

* Adds OpenTelemetry/`grpcio`/`protobuf` dependencies to the backend image.
* Tempo becomes an additional internal service and volume on the host
  (disk growth bounded by 48 h retention).
* Traces are sampled at 10 % in production; not every request is traceable by
  design. Metrics and logs remain complete.
* `request_id` and `trace_id` coexist intentionally; neither replaces the other.

## Migration and rollback

Tracing is additive and feature-flagged (`OTEL_TRACES_ENABLED`). Disabling it or
removing the Tempo service restores prior behaviour with no data migration.
Tempo data is disposable; the AI trace store is untouched.

## Verification

* `backend/tests/test_observability_tracing.py` (configuration, no-op safety,
  log correlation, release identity, sampling, additive AI field).
* `docker compose -f docker-compose.{dev,prod}.yml config` and Tempo YAML load.
* Runtime check: an API request produces a server span and the structured access
  log contains both `request_id` and a valid `trace_id`.
