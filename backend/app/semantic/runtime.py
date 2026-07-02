from __future__ import annotations

from app.semantic.cache import SemanticCache
from app.semantic.embeddings import LocalEmbeddingProvider
from app.semantic.retrieval import KnowledgeRetriever
from app.semantic.vector_store import QdrantVectorStore

embedding_provider = LocalEmbeddingProvider()
vector_store = QdrantVectorStore()
semantic_cache = SemanticCache()
knowledge_retriever = KnowledgeRetriever(embedding_provider, vector_store, semantic_cache)

