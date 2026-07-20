# Phase 2 RAG Foundation

Status: Milestone 1 conditionally accepted for continued development; production acceptance blocked on real Qdrant integration execution
Date: 2026-07-20

## Decision

SynTask will implement the Central RAG and Context Intelligence foundation inside the existing FastAPI modular monolith. Agents must request an authorized context package from the central RAG service and must not query Qdrant or business collections directly.

Milestone 1 implements manual TXT, Markdown and PDF ingestion, governed source/version/chunk registry, OpenAI embeddings through configuration, real Qdrant storage, tenant-filtered retrieval, citations and a read-only retrieval API.

The existing `KnowledgeRecord` model remains unchanged. Existing AI memory models are derived AI memory and do not replace authoritative SynTask business records.

Milestone 2 adds Redis-backed Working Memory and the canonical `ContextPackage` service. Future agents must request context through this service and must not read Redis, Qdrant, MongoDB or business collections directly. Structured Memory remains explicitly `not_integrated` until Milestone 3 and must not fabricate authoritative business facts.

Milestone 1 release gates remain active: criteria 5, 9, 10 and 18 stay blocked until the real Qdrant integration test runs successfully in Docker or CI. The nine unrelated backend failures observed during Milestone 1 verification remain separate release risks and are not part of the RAG implementation scope.

## Authority Order

1. Working Memory resolves current conversational references.
2. Structured Memory means authoritative SynTask business data from existing domain services.
3. RAG provides governed document knowledge.
4. LLM knowledge is the final fallback.

If Working Memory conflicts with current Structured Memory, Structured Memory wins.

## Security Rules

Every Qdrant point must include `company_id`, `tenant_id`, source/version/chunk identity, approval status, deletion status and visibility metadata. Retrieval fails closed without tenant scope. Unapproved, deleted, retired, failed or quarantined sources are not searchable.

Raw retrieved context and complete prompts are not permanently logged by default. Retrieved document content is untrusted data and cannot override system or tool instructions.

Working Memory keys are scoped by tenant, user and server-generated session id. Clients cannot provide tenant, company or user identity, cannot choose Redis keys, and cannot write authoritative tool output, citations, permissions or business facts. Idle expiration defaults to 30 minutes and absolute expiration defaults to eight hours; activity may refresh idle TTL but never extend absolute expiration.

## Rollback

Disable `RAG_ENABLED`, stop RAG worker tasks, and remove or ignore Qdrant points by source/version. Existing AI and semantic behavior remains backward compatible.
