# Content Production Architecture — Implementation Summary

## Overview

The SynTask Content Production Architecture replaces the limited Content Calendar with a full content lifecycle management system. The key principle: **one Content ID for the entire content lifecycle**.

## Architecture Diagram

```
Client
→ Service
→ Project
→ Deliverable
→ Content Item (CNT-XXX)
→ Publishing
```

## Lifecycle States

```
Idea → Briefing → Script → Production → Internal Review → Client Review
                                                              ↓
                                                     Revision Required
                                                          ↓
                                                      Production (loop)
                                                          ↓
                                                      ... → Approved → Ready to Publish → Published
```

### Key Features
- **Bidirectional transitions**: Revision loops work (Internal Review ↔ Revision Required ↔ Production)
- **Backend-owned rules**: Frontend never manipulates status directly
- **Version system**: Immutable snapshots with review feedback
- **Publishing boundary**: Content becomes "Ready to Publish", then Publishing owns execution
- **Audit trail**: Every workflow action is recorded in `history[]`

## Files Created/Modified

### Backend (New)
| File | Purpose |
|---|---|
| `backend/app/models/content_calendar.py` | Extended with new lifecycle fields, versions, reviews, publishing |
| `backend/app/services/content_production_service.py` | Lifecycle engine with state machine, versions, reviews |
| `backend/app/api/v1/endpoints/content_production.py` | Full Content Production API |
| `backend/app/api/v1/endpoints/content_templates.py` | Content Template CRUD API |
| `backend/scripts/migrate_content_lifecycle.py` | Migration script for existing data |

### Backend (Modified)
| File | Change |
|---|---|
| `backend/app/api/v1/router.py` | Registered new `/content` and `/content/templates` routes |
| `backend/app/core/database.py` | Registered `ContentTemplate` model |
| `backend/app/models/__init__.py` | Exported new models and enums |
| `backend/app/marketing/models.py` | Re-exported new models |
| `backend/app/marketing/__init__.py` | Re-exported new models |

### Frontend (New)
| File | Purpose |
|---|---|
| `frontend/src/api/contentProduction.js` | API client for Content Production endpoints |
| `frontend/src/pages/ContentWorkspace.jsx` | Main workspace with lifecycle tabs + overview |
| `frontend/src/pages/ContentItemDetail.jsx` | Full content item detail page |

### Frontend (Modified)
| File | Change |
|---|---|
| `frontend/src/App.jsx` | Added `/content` and `/content/:itemId` routes |
| `frontend/src/config/navigation.js` | Added "Content" nav item to Content section |

## API Endpoints

### Content Production (`/api/v1/content`)
| Method | Path | Description |
|---|---|---|
| `GET` | `/content` | Main workspace — lifecycle tabs, overview, filtered items |
| `GET` | `/content/calendar` | Calendar view (backward-compatible) |
| `GET` | `/content/library` | Content Library — completed/approved items |
| `GET` | `/content/{id}` | Single content item with all details |
| `GET` | `/content/{id}/allowed-transitions` | Allowed next statuses |
| `POST` | `/content` | Create content item |
| `PATCH` | `/content/{id}` | Update content item fields |
| `POST` | `/content/{id}/transition` | Transition status |
| `POST` | `/content/{id}/internal-review` | Internal review action |
| `POST` | `/content/{id}/client-review` | Client review action |
| `POST` | `/content/{id}/versions` | Create new version |
| `DELETE` | `/content/{id}` | Delete content item |

### Content Templates (`/api/v1/content/templates`)
| Method | Path | Description |
|---|---|---|
| `GET` | `/content/templates` | List templates |
| `POST` | `/content/templates` | Create template |
| `PATCH` | `/content/templates/{id}` | Update template |
| `DELETE` | `/content/templates/{id}` | Deactivate template |

## Backend Transition Rules

```python
ALLOWED_TRANSITIONS = {
    IDEA → {BRIEFING}
    BRIEFING → {SCRIPT, IDEA}
    SCRIPT → {PRODUCTION, BRIEFING}
    PRODUCTION → {INTERNAL_REVIEW}
    INTERNAL_REVIEW → {CLIENT_REVIEW, REVISION_REQUIRED}
    CLIENT_REVIEW → {APPROVED, REVISION_REQUIRED}
    REVISION_REQUIRED → {PRODUCTION}
    APPROVED → {READY_TO_PUBLISH}
    READY_TO_PUBLISH → {PUBLISHED}
    PUBLISHED → {}  # Terminal
}
```

## Content Item Model — New Fields

### Identity
- `content_id`: Human-readable ID (CNT-001)
- `service_id`: ClientService reference
- `deliverable_id`: ClientDeliverable reference

### Briefing
- `objective`, `target_audience`, `key_message`, `hook`, `cta`, `tone`

### Content Body
- `caption`, `script`, `creative_brief`

### Versioning
- `current_version`: Current version number
- `versions[]`: Array of immutable ContentVersion snapshots

### Review & Approval
- `internal_reviews[]`: Internal review audit trail
- `client_approvals[]`: Client review audit trail

### Publishing
- `publishing`: ContentPublishingRecord (platform, status, scheduled/published dates)

### Audit
- `history[]`: Generic audit trail of all workflow actions

## Frontend — Content Workspace

The `/content` page shows:
1. **Overview cards**: Due Today, Overdue, In Production, Internal Review, Client Review, Revision, Ready, Total
2. **Lifecycle tabs**: All | Idea | Briefing | Script | Production | Internal Review | Client Review | Revision Required | Approved | Ready to Publish | Published
3. **Filtered content list**: Table rows (status-color-coded left border) showing Content ID, title, status, priority, platform, assignee, deadline, next action
4. **Secondary filters**: Platform, Priority (narrow within selected lifecycle tab)

### Content Item Detail (`/content/:itemId`)
- **Lifecycle progress bar**: Visual indicator of current position
- **Detail tabs**: Overview, Brief, Script/Copy, Versions, Reviews, History
- **Actions**: Edit, Update Status (transition via target-stage picker + confirm button), Review (internal/client)
- **Review modal**: Approve / Request Revision / Reject with feedback

## Backward Compatibility

- **Old `/api/v1/content-calendar` endpoint**: Preserved exactly as-is
- **Old Content Calendar page**: Still accessible at `/content-calendar`
- **Legacy statuses**: Supported in enum (draft, planned, shoot_scheduled, shot, editing, scheduled)
- **Legacy data**: Migration script maps old statuses to new canonical lifecycle
- **All existing callers**: Continue to work — model is extended, not replaced

## Migration

Run the migration script after deployment:
```bash
cd backend
python -m scripts.migrate_content_lifecycle
```

This maps:
- `draft` → `idea`
- `planned` → `briefing`
- `shoot_scheduled` → `production`
- `shot` → `production`
- `editing` → `production`
- `scheduled` → `ready_to_publish`

And generates `content_id` (CNT-XXX) for all existing items.

## RBAC

Uses existing `content_calendar` module gate. No new permission system created.

## Publishing Boundary

When Content reaches `Ready to Publish`:
1. A `ContentPublishingRecord` is created/activated on the Content Item
2. Publishing execution is handled by the Publishing system (not Content)
3. `Published` tab reflects the Publishing record's state
4. Content must NOT directly perform publication

## What Was NOT Changed

Per the PRD requirements:
- ✅ Sales module untouched
- ✅ Clients module untouched
- ✅ Work module untouched
- ✅ Projects module untouched
- ✅ Tasks module untouched
- ✅ Deliverables module untouched
- ✅ Existing Content Calendar preserved
- ✅ No duplicate records created
- ✅ One Content ID per lifecycle
