# Phase 2 RAG Foundation

Status: Milestone 5 partially implemented for continued development; production acceptance remains blocked on full backend unrelated failures, frontend lint debt and real retrieval quality targets
Date: 2026-07-20

## Decision

SynTask will implement the Central RAG and Context Intelligence foundation inside the existing FastAPI modular monolith. Agents must request an authorized context package from the central RAG service and must not query Qdrant or business collections directly.

Milestone 1 implements manual TXT, Markdown and PDF ingestion, governed source/version/chunk registry, OpenAI embeddings through configuration, real Qdrant storage, tenant-filtered retrieval, citations and a read-only retrieval API.

The existing `KnowledgeRecord` model remains unchanged. Existing AI memory models are derived AI memory and do not replace authoritative SynTask business records.

Milestone 2 adds Redis-backed Working Memory and the canonical `ContextPackage` service. Future agents must request context through this service and must not read Redis, Qdrant, MongoDB or business collections directly.

Milestone 2 is conditionally accepted for continued development. The complete RAG platform is not finished. Real Redis and real Qdrant integration tests must pass in CI or a Docker-capable environment before production release. These tests must remain real-service tests and must not be weakened into fake-service tests. The nine unrelated backend failures remain separately tracked release risks and must not be fixed by changing unrelated behavior inside the RAG scope.

Milestone 3 begins Structured Memory and the Central Memory Router. The initial implementation adds a deterministic `MemoryRouter`, a read-only `StructuredMemoryService` thin adapter over existing domain models and permission helpers, safe action proposal objects for mutation intent, and `ContextPackage` support for mixed Structured Memory and RAG evidence with distinct authority labels. Structured Memory is now integrated into context packages, but only for authorized, minimized, read-only facts.

Milestone 3 is conditionally accepted for continued development. Milestone 3 and the full RAG platform are not production-complete.

Milestone 4 preflight evidence on 2026-07-20:

- Docker daemon is available through Docker Desktop 29.2.1.
- Initial `docker compose -f docker-compose.dev.yml up -d qdrant mongo redis` started real `qdrant/qdrant:v1.10.1`, `mongo:7` and `redis:7-alpine` containers, all healthy.
- Initial real Qdrant gate passed with `RUN_QDRANT_INTEGRATION=1`, `QDRANT_URL=http://localhost:6333`: `python -m pytest tests/rag/integration/test_qdrant_rag_flow.py -q` returned `1 passed`. Warning remained: qdrant-client 1.14.3 reported server 1.10.1 compatibility risk; `search` API deprecation warning remained.
- Initial real Redis gate passed with `RUN_REDIS_INTEGRATION=1`, `REDIS_URL=redis://localhost:6379/0`: `python -m pytest tests/rag/integration/test_working_memory_redis.py -q` returned `1 passed`. Warning remained: Redis async `close()` deprecation.

Milestone 4 hardening evidence on 2026-07-20:

- Qdrant server is pinned to `qdrant/qdrant:v1.14.1` in development Compose and CI. The backend remains pinned to `qdrant-client==1.14.3`. This pair is within the supported one-minor compatibility window and supports Query API, named dense vectors, sparse vectors, filtering and RRF fusion queries.
- The existing Qdrant Docker volume and collections were preserved; no destructive downgrade or data deletion was performed.
- `http://localhost:6333/` returned Qdrant server version `1.14.1`.
- Real Qdrant gate passed after version alignment: `RUN_QDRANT_INTEGRATION=1 QDRANT_URL=http://localhost:6333 python -m pytest tests/rag/integration/test_qdrant_rag_flow.py -q` returned `2 passed`, including real named dense/sparse hybrid query. The prior compatibility warning and deprecated `search()` warning were gone.
- Production RAG Qdrant adapter now calls `query_points()` instead of deprecated client `search()`. Remaining `.search(` call sites are wrapper/test-only RAG calls or unrelated IMAP, semantic, recruitment and regex uses.
- Redis Milestone 2 integration and shared Redis shutdown now use async `aclose()`. The real Redis integration test returned `1 passed` without the prior Redis `close()` deprecation warning.
- Real MongoDB Structured Memory integration was added with `RUN_MONGO_INTEGRATION=1` and a dedicated generated database prefix. It creates fabricated tenants, user, lead, project, task and meeting records; proves authorization, cross-tenant denial, module denial, stale Working Memory override, safe action proposal and no RAG/AI log writes; and drops only the exact generated test database.
- Full real-service RAG suite returned `63 passed, 0 failed, 0 skipped`.

Milestone 4 implementation on 2026-07-20:

- Added deterministic `QueryUnderstandingService` with schema-validated output, original-query preservation, route/intent classification, bounded rewriting, bounded decomposition, detected entities, required sources, missing information, confidence and trace id.
- Added versioned deterministic sparse hash encoder `sparse-hash-v1`.
- Added Qdrant hybrid collection support using named `dense` and `sparse` vectors, server-generated filters, `Prefetch`, and `FusionQuery(Fusion.RRF)`.
- Added `HybridRAGRetrievalService` behind a separate service so the existing dense collection remains operational until migration/activation is explicitly performed.
- Added deterministic retrieval profiles for Project Planning, Sales, HR/Recruitment and Marketing. Profiles can narrow scope and source/domain eligibility but do not expand permissions.
- Added `EvidenceDecisionService` for grounded sufficient/partial/conflicting/no-answer/source-unavailable decisions.
- Extended `ContextPackage` and sanitized model context with query-understanding result, retrieval profile summary, fusion/reranking policy metadata and evidence decision.
- Added a fabricated 50-case gold retrieval dataset and static evaluation runner scaffold. Release quality targets are not yet proven by a real seeded retrieval corpus, so Milestone 4 remains partial.

Milestone 5 implementation on 2026-07-20:

- Added governed ingestion support for DOCX, PPTX, XLSX, CSV and HTML in addition to TXT, Markdown and PDF.
- Office parsers enforce decompressed-size, sheet, row and slide limits, reject macro/binary payloads, and mark spreadsheet formulas as not executed.
- HTML parsing extracts visible text only and ignores script, style and embedded object content.
- Added a provider router for OpenAI/Groq selection by task type, tenant policy and risk level, with timeout, retry, fallback metadata, schema validation, token budget guard, sensitive-data blocking and estimated cost metadata.
- Added RAG feedback persistence for useful/not useful ratings, unsafe reports, incorrect citations and version metadata.
- Added RAG governance service and API operations for source listing, chunk preview, rejection, disablement, versions and citation audits.
- Added retrieval evaluation execution metrics for recall@10, precision@1, exact-term retrieval, citation source precision, no-answer precision, tenant leakage, permission enforcement, prompt-injection policy safety and latency.
- Added `docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md` to define the Agent Registry/Runtime direction and Milestone 6 boundaries.

Milestone 5 is not production-complete until the real seeded retrieval evaluation and full release checks pass in CI or a Docker-capable environment.

Product decision for channels and agents:

- WhatsApp, Meta and LinkedIn are secure connectors used by expert departmental agents.
- They are not separate agents and must not duplicate department-specific intelligence, memory, planning or approval logic.
- Connectors may normalize inbound events, preserve delivery/audit metadata and submit approved outbound dispatch requests.
- Departmental agents remain the only owners of business reasoning, context packaging and workflow decisions.

Milestone 1 release gates remain active: criteria 5, 9, 10 and 18 stay blocked until the real Qdrant integration test runs successfully in Docker or CI. The nine unrelated backend failures observed during Milestone 1 verification remain separate release risks and are not part of the RAG implementation scope.

## Authority Order

1. Working Memory resolves current conversational references.
2. Structured Memory means authoritative SynTask business data from existing domain services and repositories.
3. RAG provides governed document knowledge.
4. LLM knowledge is the final fallback.

If Working Memory conflicts with current Structured Memory, Structured Memory wins.

If RAG conflicts with current Structured Memory, Structured Memory wins for transactional business facts.

## Security Rules

Every Qdrant point must include `company_id`, `tenant_id`, source/version/chunk identity, approval status, deletion status and visibility metadata. Retrieval fails closed without tenant scope. Unapproved, deleted, retired, failed or quarantined sources are not searchable.

Raw retrieved context and complete prompts are not permanently logged by default. Retrieved document content is untrusted data and cannot override system or tool instructions.

Working Memory keys are scoped by tenant, user and server-generated session id. Clients cannot provide tenant, company or user identity, cannot choose Redis keys, and cannot write authoritative tool output, citations, permissions or business facts. Idle expiration defaults to 30 minutes and absolute expiration defaults to eight hours; activity may refresh idle TTL but never extend absolute expiration.

Structured Memory reads fail closed when server-side tenant scope or authorization is missing. Client-provided tenant or company identity is ignored for authorization. Authorized results include record type, record id, tenant scope, minimized fields, freshness metadata, authority, authorization status, missing/error status, sensitivity and external-model eligibility. Secrets, credentials, internal permission hashes and prohibited sensitive fields remain server-side.

Mutation requests are not executed by the ContextPackage builder, RAG service or Structured Memory service. Mutation intent returns a typed proposed action with `requires_approval = true` for a future approval gateway.

Agents must not treat channel content from WhatsApp, Meta or LinkedIn as trusted instructions. Channel messages are user or third-party data and must pass through the same context, permission, prompt-injection and approval boundaries as uploaded documents and in-app user prompts.

## Rollback

Disable `RAG_ENABLED`, stop RAG worker tasks, and remove or ignore Qdrant points by source/version. Existing AI and semantic behavior remains backward compatible.
