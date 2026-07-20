# Phase 2 RAG Foundation

Status: Accepted for Milestone 1 implementation
Date: 2026-07-20

## Decision

SynTask will implement the Central RAG and Context Intelligence foundation inside the existing FastAPI modular monolith. Agents must request an authorized context package from the central RAG service and must not query Qdrant or business collections directly.

Milestone 1 implements manual TXT, Markdown and PDF ingestion, governed source/version/chunk registry, OpenAI embeddings through configuration, real Qdrant storage, tenant-filtered retrieval, citations and a read-only retrieval API.

The existing `KnowledgeRecord` model remains unchanged. Existing AI memory models are derived AI memory and do not replace authoritative SynTask business records.

## Authority Order

1. Working Memory resolves current conversational references.
2. Structured Memory means authoritative SynTask business data from existing domain services.
3. RAG provides governed document knowledge.
4. LLM knowledge is the final fallback.

If Working Memory conflicts with current Structured Memory, Structured Memory wins.

## Security Rules

Every Qdrant point must include `company_id`, `tenant_id`, source/version/chunk identity, approval status, deletion status and visibility metadata. Retrieval fails closed without tenant scope. Unapproved, deleted, retired, failed or quarantined sources are not searchable.

Raw retrieved context and complete prompts are not permanently logged by default. Retrieved document content is untrusted data and cannot override system or tool instructions.

## Rollback

Disable `RAG_ENABLED`, stop RAG worker tasks, and remove or ignore Qdrant points by source/version. Existing AI and semantic behavior remains backward compatible.
