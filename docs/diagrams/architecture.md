# SynTask Architecture Diagram

```mermaid
flowchart TB
    subgraph Client
        Browser[Browser]
    end

    subgraph Frontend
        Nginx[Nginx]
        React[React 18 SPA]
    end

    subgraph Backend
        FastAPI[FastAPI App]
        Auth[Auth Dependencies]
        Routers[API v1 Routers]
        ContextPackage[Central ContextPackage Service]
        QueryUnderstanding[QueryUnderstanding Service]
        StructuredMemory[Structured Memory Service]
        WorkingMemory[Working Memory Service]
        RAG[Central RAG Retrieval]
        HybridRAG[Hybrid Retrieval Service]
        Profiles[Retrieval Profiles]
        Evidence[Evidence Decision Service]
        ProviderRouter[Provider Router]
        AgentRuntime[Future Agent Runtime]
        ConnectorGateway[Future Connector Gateway]
        Uploads[Local uploads/]
        Deadline[Deadline Checker]
    end

    subgraph Data
        Mongo[(MongoDB Atlas)]
        Redis[(Redis Blacklist / Working Memory)]
        Qdrant[(Qdrant Vector Store)]
    end

    subgraph External
        SMTP[SMTP]
        Zoom[Zoom API]
        Payments[Stripe / Razorpay]
        WhatsApp[WhatsApp Connector]
        Meta[Meta Connector]
        LinkedIn[LinkedIn Connector]
    end

    Browser --> Nginx --> React
    React --> FastAPI
    FastAPI --> Auth --> Routers
    Routers --> ContextPackage
    ContextPackage --> QueryUnderstanding
    ContextPackage --> StructuredMemory
    ContextPackage --> WorkingMemory
    ContextPackage --> RAG
    ContextPackage --> HybridRAG
    HybridRAG --> Profiles
    HybridRAG --> Evidence
    AgentRuntime --> ContextPackage
    AgentRuntime --> ProviderRouter
    ConnectorGateway --> AgentRuntime
    WorkingMemory --> Redis
    RAG --> Qdrant
    HybridRAG --> Qdrant
    RAG --> Mongo
    StructuredMemory --> Mongo
    Routers --> Mongo
    FastAPI --> Redis
    Routers --> Uploads
    FastAPI --> Deadline
    Routers --> SMTP
    Routers --> Zoom
    Routers --> Payments
    WhatsApp --> ConnectorGateway
    Meta --> ConnectorGateway
    LinkedIn --> ConnectorGateway
```

```mermaid
sequenceDiagram
    participant Agent
    participant API as FastAPI RAG API
    participant Auth
    participant CP as ContextPackage Service
    participant QU as QueryUnderstanding
    participant SM as Structured Memory
    participant WM as Redis Working Memory
    participant RAG as Hybrid RAG Retrieval Service
    participant Qdrant
    participant Mongo

    Agent->>API: Request ContextPackage
    API->>Auth: Resolve authenticated user scope
    API->>CP: Build package with server scope
    CP->>WM: Load tenant/user/session memory
    CP->>QU: Classify route and bounded rewrites
    CP->>SM: Read current authorized business facts when required
    SM->>Mongo: Existing domain models and permission checks
    CP->>RAG: Retrieve with current permission scope/profile
    RAG->>Qdrant: Tenant-filtered dense/sparse query_points
    RAG->>Mongo: Re-authorize citations
    CP-->>API: Authorized ContextPackage
    API-->>Agent: Sanitized context boundary
```

```mermaid
flowchart LR
    SuperAdmin[Super Admin] --> Admin[Admin]
    Admin --> Manager[Manager]
    Manager --> Lead[Lead]
    Lead --> Employee[Employee]
```

```mermaid
sequenceDiagram
    participant User
    participant React
    participant API as FastAPI
    participant Redis
    participant Mongo

    User->>React: Login
    React->>API: POST /auth/login
    API->>Mongo: Verify user and bcrypt hash
    API-->>React: Access + refresh token
    React->>API: Bearer token request
    API->>Redis: Check blacklist
    API->>Mongo: Query company-scoped data
    API-->>React: Response
    React->>API: POST /auth/logout
    API->>Redis: Blacklist token until expiry
```
