from __future__ import annotations

import csv
import io
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence
from xml.etree import ElementTree as ET

from fastapi import HTTPException, UploadFile, status

from app.timeline.publisher import publish_crm_timeline_event
from app.models.crm_company import CRMCompany
from app.models.sales_contact import SalesContact
from app.models.sales_masters import SalesStage
from app.models.sales_import_job import SalesImportJob
from app.models.ownership_transfer import OwnershipTransfer
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.crm.models import InterestLevel, ProspectStatus, SalesProspect
from app.models.user import User, UserRole, UserStatus


CSV_EMAIL_ALIASES = {"email_address", "email_id", "e_mail"}
DEFAULT_ASSIGNMENT_STRATEGIES = {"round-robin", "evenly", "least-loaded", "manual"}
DEFAULT_SOURCE_LABELS = {
    "manual": "manual",
    "csv": "csv_import",
    "xlsx": "excel_import",
    "excel": "excel_import",
    "api": "api",
    "website": "website_form",
}


def _now() -> datetime:
    return datetime.utcnow()


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _normalize_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _normalize_lead_csv_header(header: str) -> str:
    normalized = (
        str(header or "")
        .lstrip("\ufeff")
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )
    while "__" in normalized:
        normalized = normalized.replace("__", "_")
    if normalized in CSV_EMAIL_ALIASES:
        return "email"
    return normalized


def _parse_multi_value(value: Optional[str]) -> List[str]:
    if not value or not str(value).strip():
        return []
    return [part.strip() for part in str(value).split("|") if part.strip()]


def _parse_interest_level(value: Optional[str]) -> InterestLevel:
    normalized = _normalize_text(value).lower()
    legacy_values = {"high": "hot", "medium": "warm", "low": "cold"}
    return InterestLevel(legacy_values.get(normalized, normalized or InterestLevel.WARM.value))


def _parse_datetime(date_str: Optional[str], time_str: Optional[str] = None) -> Optional[datetime]:
    if not date_str or not str(date_str).strip():
        return None
    try:
        parts = str(date_str).strip().split("-")
        if len(parts) != 3:
            return None
        if len(parts[0]) == 4:
            year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
        else:
            day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
        dt = datetime(year, month, day)
        if time_str:
            time_str_clean = str(time_str).strip().upper()
            if "AM" in time_str_clean or "PM" in time_str_clean:
                time_parts = time_str_clean.split()
                if len(time_parts) >= 2:
                    hours, minutes = map(int, time_parts[0].split(":"))
                    if time_parts[1] == "PM" and hours != 12:
                        hours += 12
                    elif time_parts[1] == "AM" and hours == 12:
                        hours = 0
                    dt = dt.replace(hour=hours, minute=minutes)
            else:
                hours, minutes = map(int, time_str_clean.split(":"))
                dt = dt.replace(hour=hours, minute=minutes)
        return dt
    except Exception:
        return None


def _load_xlsx_rows(file_bytes: bytes) -> tuple[list[str], list[dict[str, str]]]:
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for item in root.findall(".//main:si", ns):
                text_parts = [node.text or "" for node in item.findall(".//main:t", ns)]
                shared_strings.append("".join(text_parts))

        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        workbook_ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
        sheet = workbook_root.find(".//main:sheets/main:sheet", workbook_ns)
        if sheet is None:
            return [], []
        rels_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rels_ns = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_root.findall(".//rel:Relationship", rels_ns)}
        sheet_target = rel_map.get(sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id", ""), "worksheets/sheet1.xml")
        sheet_path = sheet_target if sheet_target.startswith("xl/") else f"xl/{sheet_target}"
        sheet_root = ET.fromstring(archive.read(sheet_path))
        sheet_ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        rows: list[list[str]] = []
        for row in sheet_root.findall(".//main:sheetData/main:row", sheet_ns):
            values: list[str] = []
            for cell in row.findall("main:c", sheet_ns):
                cell_type = cell.attrib.get("t")
                cell_value = cell.findtext("main:v", default="", namespaces=sheet_ns)
                if cell_type == "s" and cell_value.isdigit():
                    values.append(shared_strings[int(cell_value)])
                else:
                    inline_text = cell.findtext(".//main:t", default="", namespaces=sheet_ns)
                    values.append(inline_text or cell_value or "")
            rows.append(values)

    if not rows:
        return [], []

    headers = [str(value or "").strip() for value in rows[0]]
    parsed_rows: list[dict[str, str]] = []
    for row in rows[1:]:
        row_map: dict[str, str] = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            row_map[header] = row[idx] if idx < len(row) else ""
        parsed_rows.append(row_map)
    return headers, parsed_rows


def _parse_tabular_upload(file_name: str, file_bytes: bytes) -> tuple[list[str], list[dict[str, str]]]:
    lowered = file_name.lower()
    if lowered.endswith(".csv"):
        text = file_bytes.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []
        rows = [{str(key): (value or "") for key, value in row.items() if key is not None} for row in reader]
        return headers, rows
    if lowered.endswith(".xlsx"):
        return _load_xlsx_rows(file_bytes)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only CSV and XLSX files are supported")


def _parse_stage_lookup(stage_documents: list[SalesStage]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for stage in stage_documents:
        canonical = _normalize_text(stage.name)
        lookup[canonical.lower()] = canonical
        lookup[canonical.lower().replace(" ", "-")] = canonical
    return lookup


@dataclass
class LeadValidationResult:
    valid: bool
    errors: list[str]
    warnings: list[str]


@dataclass
class LeadImportResult:
    total_rows: int
    total_uploaded: int
    skipped_rows: int
    assigned_breakdown: Dict[str, int]
    warnings: list[dict[str, Any]]


class LeadNormalizer:
    @staticmethod
    def normalize_form_payload(payload: Dict[str, Any], *, source: str = "manual") -> Dict[str, Any]:
        normalized = dict(payload or {})
        normalized["first_name"] = _normalize_text(normalized.get("first_name"))
        normalized["last_name"] = _normalize_text(normalized.get("last_name"))
        normalized["prospect_name"] = _normalize_text(normalized.get("prospect_name") or f"{normalized['first_name']} {normalized['last_name']}")
        normalized["country_code"] = _normalize_text(normalized.get("country_code") or "+91")
        normalized["phone"] = _normalize_text(normalized.get("phone"))
        normalized["email"] = _normalize_text(normalized.get("email")).lower() or None
        normalized["remark"] = _normalize_text(normalized.get("remark")) or None
        normalized["company_name"] = _normalize_text(normalized.get("company_name")) or None
        normalized["crm_company_id"] = _normalize_text(normalized.get("crm_company_id")) or None
        normalized["contact_id"] = _normalize_text(normalized.get("contact_id")) or None
        normalized["category_id"] = _normalize_text(normalized.get("category_id")) or None
        normalized["relationship_type"] = _normalize_text(normalized.get("relationship_type")) or None
        normalized["channel"] = _normalize_text(normalized.get("channel")) or None
        normalized["designation"] = _normalize_text(normalized.get("designation")) or None
        normalized["owner_name"] = _normalize_text(normalized.get("owner_name")) or None
        normalized["owner_contact_no"] = _normalize_text(normalized.get("owner_contact_no")) or None
        normalized["assigned_to"] = _normalize_text(normalized.get("assigned_to")) or None
        normalized["assigned_by"] = _normalize_text(normalized.get("assigned_by")) or None
        normalized["due_date"] = _normalize_text(normalized.get("due_date")) or None
        normalized["due_time"] = _normalize_text(normalized.get("due_time")) or None
        normalized["tag"] = _parse_multi_value(normalized.get("tag")) if isinstance(normalized.get("tag"), str) else list(normalized.get("tag") or [])
        normalized["nationality"] = _parse_multi_value(normalized.get("nationality")) if isinstance(normalized.get("nationality"), str) else list(normalized.get("nationality") or [])
        normalized["language"] = _parse_multi_value(normalized.get("language")) if isinstance(normalized.get("language"), str) else list(normalized.get("language") or [])
        normalized["product_ids"] = list(normalized.get("product_ids") or [])
        normalized["interest_level"] = normalized.get("interest_level") or InterestLevel.WARM.value
        normalized["source"] = normalized.get("source") or source
        normalized["current_stage"] = _normalize_text(normalized.get("current_stage") or "new")
        normalized["status"] = _normalize_text(normalized.get("status") or ProspectStatus.ACTIVE.value).lower()
        return normalized

    @staticmethod
    def normalize_import_row(row: Dict[str, str], *, source: str) -> Dict[str, Any]:
        row_norm = {_normalize_lead_csv_header(key): (value or "").strip() for key, value in row.items() if key is not None}
        name = row_norm.get("name", "")
        first_name = row_norm.get("first_name", "")
        last_name = row_norm.get("last_name", "")
        if not first_name and name:
            parts = name.split()
            first_name = parts[0]
            last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
        return LeadNormalizer.normalize_form_payload(
            {
                "first_name": first_name,
                "last_name": last_name,
                "prospect_name": row_norm.get("prospect_name") or f"{first_name} {last_name}".strip(),
                "country_code": row_norm.get("country_code") or "+91",
                "phone": row_norm.get("phone"),
                "email": row_norm.get("email"),
                "company_name": row_norm.get("company") or row_norm.get("company_name"),
                "category_id": row_norm.get("category_id"),
                "product_ids": _parse_multi_value(row_norm.get("product_ids")) if row_norm.get("product_ids") else [],
                "interest_level": row_norm.get("interest_level") or InterestLevel.WARM.value,
                "estimated_close_date": row_norm.get("estimated_close_date"),
                "status": row_norm.get("status") or ProspectStatus.ACTIVE.value,
                "source": source,
                "current_stage": row_norm.get("stage") or row_norm.get("current_stage") or "new",
                "remark": row_norm.get("remark"),
                "relationship_type": row_norm.get("relationship_type"),
                "channel": row_norm.get("channel"),
                "designation": row_norm.get("designation"),
                "nationality": row_norm.get("nationality"),
                "language": row_norm.get("language"),
                "owner_name": row_norm.get("owner_name"),
                "owner_contact_no": row_norm.get("owner_contact_no"),
                "tag": row_norm.get("tag"),
                "crm_company_id": row_norm.get("crm_company_id"),
                "contact_id": row_norm.get("contact_id"),
            },
            source=source,
        )


class LeadValidator:
    @staticmethod
    def validate_lead_payload(payload: Dict[str, Any]) -> None:
        if not payload.get("first_name"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="First name is required")
        if not payload.get("last_name"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Last name is required")
        if not payload.get("country_code"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Country code is required")
        if not payload.get("phone"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone is required")
        if payload.get("status") and _normalize_text(payload.get("status")).lower() not in {item.value for item in ProspectStatus}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
        try:
            _parse_interest_level(payload.get("interest_level"))
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interest level") from exc

    @staticmethod
    def validate_stage(stage_value: str, stage_lookup: dict[str, str]) -> str:
        normalized = _normalize_text(stage_value).lower()
        if normalized in stage_lookup:
            return stage_lookup[normalized]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown stage")


class DuplicateResolver:
    @staticmethod
    async def find_duplicate(current_user: User, payload: Dict[str, Any]) -> Optional[SalesProspect]:
        query: Dict[str, Any] = {
            "deleted": False,
            "company_id": current_user.company_id,
            "country_code": payload.get("country_code"),
            "phone": payload.get("phone"),
        }
        if current_user.role == UserRole.SUPER_ADMIN and payload.get("company_id"):
            query["company_id"] = payload["company_id"]
        return await SalesProspect.find_one(query)

    @staticmethod
    async def find_by_email(current_user: User, email: Optional[str]) -> Optional[SalesProspect]:
        if not email:
            return None
        query: Dict[str, Any] = {"deleted": False, "email": email.lower()}
        if current_user.role != UserRole.SUPER_ADMIN:
            query["company_id"] = current_user.company_id
        return await SalesProspect.find_one(query)

    @staticmethod
    async def resolve_company(current_user: User, payload: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
        company_id = payload.get("crm_company_id")
        company_name = payload.get("company_name")
        if company_id:
            company = await CRMCompany.get(company_id)
            if not company or company.deleted:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company not found")
            if current_user.role != UserRole.SUPER_ADMIN and company.company_id != current_user.company_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
            return str(company.id), company.name
        if company_name:
            query: Dict[str, Any] = {"deleted": False, "name": company_name.strip()}
            if current_user.role != UserRole.SUPER_ADMIN:
                query["company_id"] = current_user.company_id
            company = await CRMCompany.find_one(query)
            if company:
                return str(company.id), company.name
        return None, company_name

    @staticmethod
    async def resolve_contact(current_user: User, payload: Dict[str, Any]) -> Optional[str]:
        contact_id = payload.get("contact_id")
        if contact_id:
            contact = await SalesContact.get(contact_id)
            if not contact or contact.deleted:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact not found")
            if current_user.role != UserRole.SUPER_ADMIN and contact.company_id != current_user.company_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
            return str(contact.id)
        email = payload.get("email")
        phone = payload.get("phone")
        if email:
            query: Dict[str, Any] = {"deleted": False, "email": email.lower()}
            if current_user.role != UserRole.SUPER_ADMIN:
                query["company_id"] = current_user.company_id
            contact = await SalesContact.find_one(query)
            if contact:
                return str(contact.id)
        if phone:
            query = {"deleted": False, "country_code": payload.get("country_code"), "phone": phone}
            if current_user.role != UserRole.SUPER_ADMIN:
                query["company_id"] = current_user.company_id
            contact = await SalesContact.find_one(query)
            if contact:
                return str(contact.id)
        return None


class AssignmentEngine:
    @staticmethod
    async def load_assignable_users(current_user: User, *, department_id: Optional[str] = None) -> list[User]:
        if not current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
        query: Dict[str, Any] = {
            "company_id": current_user.company_id,
            "status": UserStatus.ACTIVE,
            "role": {"$in": [UserRole.ADMIN.value, UserRole.LEAD.value, UserRole.EMPLOYEE.value]},
        }
        if department_id:
            query["$or"] = [
                {"department_id": department_id},
                {"department": department_id},
            ]
        users = await User.find(
            query
        ).to_list()
        if not users:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No assignable users found in your company")
        return users

    @staticmethod
    def choose_assignee(
        strategy: str,
        assignable_users: Sequence[User],
        *,
        index: int = 0,
        target_user_id: Optional[str] = None,
        assignment_counts: Optional[Dict[str, int]] = None,
        current_user: Optional[User] = None,
    ) -> str:
        if strategy not in DEFAULT_ASSIGNMENT_STRATEGIES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid strategy")
        user_ids = [str(user.id) for user in assignable_users]
        if strategy == "manual":
            if not target_user_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_user_id is required for manual assignment")
            if target_user_id not in user_ids:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target user must be an active Lead or Employee in your company")
            return target_user_id
        if strategy == "round-robin":
            return user_ids[index % len(user_ids)]
        assignment_counts = assignment_counts or {user_id: 0 for user_id in user_ids}
        if strategy == "least-loaded":
            return min(user_ids, key=lambda user_id: (assignment_counts.get(user_id, 0), user_ids.index(user_id)))
        # evenly
        return min(user_ids, key=lambda user_id: (assignment_counts.get(user_id, 0), user_ids.index(user_id)))

    @staticmethod
    def allow_manager_override(current_user: User, target_user_id: Optional[str], assignable_users: Sequence[User]) -> bool:
        if not target_user_id or current_user.role != UserRole.MANAGER:
            return False
        if str(current_user.id) == target_user_id:
            return True
        valid_ids = {str(user.id) for user in assignable_users}
        return target_user_id in valid_ids


class LeadEventPublisher:
    @staticmethod
    async def lead_created(lead: SalesProspect, current_user: User, *, source: str) -> None:
        await publish_crm_timeline_event(
            event_name="LeadCreated",
            aggregate_type="sales_prospect",
            aggregate_id=str(lead.id),
            company_id=str(lead.company_id),
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(lead.id),
                "lead_name": lead.prospect_name,
                "company_id": str(lead.company_id),
                "source": source,
                "assigned_to": lead.assigned_to,
                "assigned_by": lead.assigned_by,
                "current_stage": lead.current_stage,
                "status": lead.status.value,
                "timestamp": lead.updated_at.isoformat(),
            },
            metadata={"surface": "sales", "workflow": "lead_engine"},
        )

    @staticmethod
    async def lead_assigned(lead: SalesProspect, current_user: User, *, previous_assignee: Optional[str], reason: Optional[str] = None) -> None:
        await publish_crm_timeline_event(
            event_name="LeadAssigned",
            aggregate_type="sales_prospect",
            aggregate_id=str(lead.id),
            company_id=str(lead.company_id),
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(lead.id),
                "lead_name": lead.prospect_name,
                "company_id": str(lead.company_id),
                "previous_assignee": previous_assignee,
                "assigned_to": lead.assigned_to,
                "reason": reason,
                "timestamp": lead.updated_at.isoformat(),
            },
            metadata={"surface": "sales", "workflow": "lead_engine"},
        )


class LeadEngine:
    @staticmethod
    async def create_lead(current_user: User, payload: Dict[str, Any], *, source: str = "manual") -> Dict[str, Any]:
        if not current_user.company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
        normalized = LeadNormalizer.normalize_form_payload(payload, source=source)
        LeadValidator.validate_lead_payload(normalized)
        normalized["company_id"] = normalized.get("company_id") or current_user.company_id
        normalized["created_by"] = str(getattr(current_user, "id", ""))
        normalized["assigned_by"] = str(getattr(current_user, "id", ""))
        normalized["updated_at"] = _now()
        normalized["created_at"] = normalized["updated_at"]

        duplicate = await DuplicateResolver.find_duplicate(current_user, normalized)
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prospect with this phone number already exists")

        company_id, company_name = await DuplicateResolver.resolve_company(current_user, normalized)
        contact_id = await DuplicateResolver.resolve_contact(current_user, normalized)
        if company_id:
            normalized["crm_company_id"] = company_id
            normalized["company_name"] = company_name
        if contact_id:
            normalized["contact_id"] = contact_id
        assigned_to = normalized.get("assigned_to")
        department_id = normalized.get("department_id") or getattr(current_user, "department_id", None)
        if assigned_to:
            assignable_users = await AssignmentEngine.load_assignable_users(current_user, department_id=department_id)
            normalized["assigned_to"] = AssignmentEngine.choose_assignee(
                "manual",
                assignable_users,
                target_user_id=str(assigned_to),
            )
        else:
            assignable_users = await AssignmentEngine.load_assignable_users(current_user, department_id=department_id)
            if current_user.role == UserRole.MANAGER and str(current_user.id) in {str(user.id) for user in assignable_users}:
                normalized["assigned_to"] = str(getattr(current_user, "id", ""))
            else:
                normalized["assigned_to"] = AssignmentEngine.choose_assignee(
                    "least-loaded",
                    assignable_users,
                    assignment_counts={str(user.id): 0 for user in assignable_users},
                )

        prospect = SalesProspect(
            first_name=normalized["first_name"],
            last_name=normalized["last_name"],
            prospect_name=normalized["prospect_name"],
            country_code=normalized["country_code"],
            phone=normalized["phone"],
            email=normalized.get("email"),
            contact_id=normalized.get("contact_id"),
            category_id=normalized.get("category_id"),
            product_ids=list(normalized.get("product_ids") or []),
            interest_level=_parse_interest_level(normalized.get("interest_level")),
            estimated_close_date=_parse_datetime(normalized.get("estimated_close_date")),
            assigned_to=str(normalized.get("assigned_to")),
            assigned_by=str(normalized.get("assigned_by")),
            current_stage=normalized.get("current_stage") or "new",
            due_date=_parse_datetime(normalized.get("due_date"), normalized.get("due_time")),
            due_time=normalized.get("due_time"),
            remark=normalized.get("remark"),
            company_name=normalized.get("company_name"),
            crm_company_id=normalized.get("crm_company_id"),
            relationship_type=normalized.get("relationship_type"),
            channel=normalized.get("channel"),
            source=normalized.get("source") or "manual",
            designation=normalized.get("designation"),
            nationality=list(normalized.get("nationality") or []),
            language=list(normalized.get("language") or []),
            owner_name=normalized.get("owner_name"),
            owner_contact_no=normalized.get("owner_contact_no"),
            tag=list(normalized.get("tag") or []),
            greeting_preference=normalized.get("greeting_preference"),
            status=ProspectStatus(normalized.get("status") or ProspectStatus.ACTIVE.value),
            company_id=normalized.get("company_id"),
            created_by=normalized.get("created_by"),
            deleted=False,
            created_at=normalized["created_at"],
            updated_at=normalized["updated_at"],
        )
        await prospect.insert()

        await LeadEventPublisher.lead_created(prospect, current_user, source=normalized.get("source") or source)
        return {
            "id": str(prospect.id),
            "message": "Prospect created successfully",
            "lead": LeadEngine.serialize_lead(prospect),
        }

    @staticmethod
    def serialize_lead(prospect: SalesProspect) -> Dict[str, Any]:
        return {
            "id": str(prospect.id),
            "first_name": prospect.first_name,
            "last_name": prospect.last_name,
            "prospect_name": prospect.prospect_name,
            "country_code": prospect.country_code,
            "phone": prospect.phone,
            "email": prospect.email,
            "contact_id": prospect.contact_id,
            "category_id": prospect.category_id,
            "product_ids": prospect.product_ids,
            "interest_level": prospect.interest_level.value if getattr(prospect, "interest_level", None) else None,
            "estimated_close_date": prospect.estimated_close_date.isoformat() if prospect.estimated_close_date else None,
            "assigned_to": prospect.assigned_to,
            "assigned_by": prospect.assigned_by,
            "current_stage": prospect.current_stage,
            "due_date": prospect.due_date.isoformat() if prospect.due_date else None,
            "due_time": prospect.due_time,
            "remark": prospect.remark,
            "company_name": prospect.company_name,
            "crm_company_id": prospect.crm_company_id,
            "relationship_type": prospect.relationship_type,
            "channel": prospect.channel,
            "designation": prospect.designation,
            "nationality": prospect.nationality or [],
            "language": prospect.language or [],
            "owner_name": prospect.owner_name,
            "owner_contact_no": prospect.owner_contact_no,
            "tag": prospect.tag or [],
            "greeting_preference": prospect.greeting_preference,
            "status": prospect.status.value if getattr(prospect, "status", None) else None,
            "closed_date": prospect.closed_date.isoformat() if prospect.closed_date else None,
            "closed_by": prospect.closed_by,
            "reason_for_lost": prospect.reason_for_lost,
            "won_amount": prospect.won_amount,
            "created_at": prospect.created_at,
            "updated_at": prospect.updated_at,
            "stage_entered_at": prospect.stage_entered_at,
            "stage_last_changed_at": prospect.stage_last_changed_at,
            "days_in_stage": prospect.days_in_stage,
            "department_id": getattr(prospect, "department_id", None),
        }

    @staticmethod
    async def update_lead(current_user: User, lead_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prospect not found")
        if current_user.role != UserRole.SUPER_ADMIN and prospect.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if current_user.role == UserRole.EMPLOYEE:
            if prospect.assigned_to != str(current_user.id) and prospect.assigned_by != str(current_user.id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        update = LeadNormalizer.normalize_form_payload(payload, source=prospect.source or "manual")
        now = _now()
        if "first_name" in payload and payload["first_name"] is not None:
            prospect.first_name = _normalize_text(payload["first_name"])
        if "last_name" in payload and payload["last_name"] is not None:
            prospect.last_name = _normalize_text(payload["last_name"])
        if "country_code" in payload and payload["country_code"] is not None:
            prospect.country_code = _normalize_text(payload["country_code"])
        if "phone" in payload and payload["phone"] is not None:
            prospect.phone = _normalize_text(payload["phone"])
        if "email" in payload:
            prospect.email = _normalize_text(payload["email"]).lower() or None
        if "contact_id" in payload:
            prospect.contact_id = payload["contact_id"] or None
        if "category_id" in payload:
            prospect.category_id = payload["category_id"] or None
        if "product_ids" in payload:
            prospect.product_ids = list(payload.get("product_ids") or [])
        if "interest_level" in payload:
            prospect.interest_level = _parse_interest_level(payload.get("interest_level"))
        if "estimated_close_date" in payload:
            prospect.estimated_close_date = _parse_datetime(payload.get("estimated_close_date"))
        if "assigned_to" in payload:
            target_assignee = payload.get("assigned_to") or prospect.assigned_to
            if target_assignee:
                department_id = getattr(prospect, "department_id", None) or getattr(current_user, "department_id", None)
                assignable_users = await AssignmentEngine.load_assignable_users(current_user, department_id=department_id)
                if str(target_assignee) in {str(user.id) for user in assignable_users}:
                    previous_assignee = prospect.assigned_to
                    prospect.assigned_to = str(target_assignee)
                    if previous_assignee != prospect.assigned_to:
                        await OwnershipTransfer(
                            company_id=str(prospect.company_id),
                            entity_type="lead",
                            entity_id=str(prospect.id),
                            from_user_id=str(previous_assignee) if previous_assignee else None,
                            to_user_id=str(prospect.assigned_to),
                            reason="manual_reassignment",
                            transferred_by=str(current_user.id),
                            notes="Manual reassignment from lead update",
                        ).insert()
        if "due_date" in payload:
            prospect.due_date = _parse_datetime(payload.get("due_date"), payload.get("due_time"))
        if "due_time" in payload:
            prospect.due_time = payload.get("due_time") or None
        if "remark" in payload:
            prospect.remark = _normalize_text(payload.get("remark")) or None
        if "company_name" in payload:
            prospect.company_name = _normalize_text(payload.get("company_name")) or None
        if "crm_company_id" in payload:
            company_id, company_name = await DuplicateResolver.resolve_company(current_user, {"crm_company_id": payload.get("crm_company_id"), "company_name": payload.get("company_name")})
            prospect.crm_company_id = company_id
            prospect.company_name = company_name or prospect.company_name
        if "relationship_type" in payload:
            prospect.relationship_type = _normalize_text(payload.get("relationship_type")) or None
        if "channel" in payload:
            prospect.channel = _normalize_text(payload.get("channel")) or None
        if "designation" in payload:
            prospect.designation = _normalize_text(payload.get("designation")) or None
        if "nationality" in payload:
            prospect.nationality = list(payload.get("nationality") or [])
        if "language" in payload:
            prospect.language = list(payload.get("language") or [])
        if "owner_name" in payload:
            prospect.owner_name = _normalize_text(payload.get("owner_name")) or None
        if "owner_contact_no" in payload:
            prospect.owner_contact_no = _normalize_text(payload.get("owner_contact_no")) or None
        if "tag" in payload:
            prospect.tag = list(payload.get("tag") or [])
        if "greeting_preference" in payload:
            prospect.greeting_preference = _normalize_text(payload.get("greeting_preference")) or None
        if "reason_for_lost" in payload:
            prospect.reason_for_lost = _normalize_text(payload.get("reason_for_lost")) or None
        if "won_amount" in payload:
            prospect.won_amount = float(payload.get("won_amount") or 0) if payload.get("won_amount") is not None else None

        prospect.updated_at = now
        await prospect.save()
        return {"message": "Prospect updated successfully", "lead": LeadEngine.serialize_lead(prospect)}

    @staticmethod
    async def import_leads(
        current_user: User,
        file: UploadFile,
        *,
        strategy: str,
        target_user_id: Optional[str] = None,
        target_department_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not current_user.company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
        if strategy not in DEFAULT_ASSIGNMENT_STRATEGIES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid strategy")
        file_name = file.filename or "upload.csv"
        content = await file.read()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file uploaded")
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large. Max size is 10 MB")

        headers, rows = _parse_tabular_upload(file_name, content)
        normalized_headers = [_normalize_lead_csv_header(header) for header in headers]
        if "email" not in normalized_headers:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must include an 'email' column")
        if not any(header in normalized_headers for header in ["name", "first_name"]):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must include either 'name' or 'first_name' column")

        source_label = DEFAULT_SOURCE_LABELS.get("xlsx" if file_name.lower().endswith(".xlsx") else "csv", "csv_import")
        assignable_users = await AssignmentEngine.load_assignable_users(current_user, department_id=target_department_id)
        if strategy == "manual":
            if not target_user_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_user_id is required for manual assignment")
            if target_user_id not in {str(user.id) for user in assignable_users}:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target user must be an active Lead or Employee in your company")

        seen_emails: set[str] = set()
        all_emails: set[str] = set()
        parsed_rows: list[dict[str, Any]] = []
        skipped_rows: list[dict[str, Any]] = []
        total_input_rows = 0
        for idx, row in enumerate(rows, start=2):
            total_input_rows += 1
            row_norm = { _normalize_lead_csv_header(key): (value or "").strip() for key, value in row.items() if key is not None }
            email = (row_norm.get("email") or "").lower()
            if not email:
                skipped_rows.append({"row": idx, "reason": "Missing email"})
                continue
            if email in seen_emails:
                skipped_rows.append({"row": idx, "reason": "Duplicate email in file"})
                continue
            seen_emails.add(email)
            all_emails.add(email)
            parsed_rows.append({"row": idx, "row_norm": row_norm})

        existing_emails: set[str] = set()
        if all_emails:
            existing_leads = await SalesProspect.find(
                {
                    "company_id": current_user.company_id,
                    "email": {"$in": list(all_emails)},
                    "deleted": False,
                }
            ).to_list()
            existing_emails = {lead.email.lower() for lead in existing_leads if lead.email}

        valid_rows: list[dict[str, Any]] = []
        assignment_counts = defaultdict(int)
        for index, item in enumerate(parsed_rows):
            row_number = item["row"]
            row_norm = item["row_norm"]
            normalized = LeadNormalizer.normalize_import_row(row_norm, source=source_label)
            normalized["company_id"] = current_user.company_id
            normalized["created_by"] = str(current_user.id)
            normalized["assigned_by"] = str(current_user.id)
            normalized["updated_at"] = _now()
            normalized["created_at"] = normalized["updated_at"]
            if normalized["email"] in existing_emails:
                skipped_rows.append({"row": row_number, "reason": "Duplicate email already exists"})
                continue
            try:
                LeadValidator.validate_lead_payload(normalized)
            except HTTPException as exc:
                skipped_rows.append({"row": row_number, "reason": exc.detail})
                continue
            try:
                target_assignee = target_user_id if strategy == "manual" else AssignmentEngine.choose_assignee(strategy, assignable_users, index=index, assignment_counts=assignment_counts)
            except HTTPException as exc:
                skipped_rows.append({"row": row_number, "reason": exc.detail})
                continue
            normalized["assigned_to"] = target_assignee
            assignment_counts[target_assignee] += 1
            valid_rows.append(normalized)

        if not valid_rows:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid leads found after validation")

        prospects = [
            SalesProspect(
                first_name=row["first_name"],
                last_name=row["last_name"],
                prospect_name=row["prospect_name"],
                country_code=row["country_code"],
                phone=row["phone"],
                email=row.get("email"),
                contact_id=row.get("contact_id"),
                category_id=row.get("category_id"),
                product_ids=list(row.get("product_ids") or []),
                interest_level=_parse_interest_level(row.get("interest_level")),
                estimated_close_date=_parse_datetime(row.get("estimated_close_date")),
                assigned_to=str(row.get("assigned_to")),
                assigned_by=str(row.get("assigned_by")),
                current_stage=row.get("current_stage") or "new",
                due_date=_parse_datetime(row.get("due_date"), row.get("due_time")),
                due_time=row.get("due_time"),
                remark=row.get("remark"),
                company_name=row.get("company_name"),
                crm_company_id=row.get("crm_company_id"),
                relationship_type=row.get("relationship_type"),
                channel=row.get("channel"),
                source=row.get("source") or source_label,
                designation=row.get("designation"),
                nationality=list(row.get("nationality") or []),
                language=list(row.get("language") or []),
                owner_name=row.get("owner_name"),
                owner_contact_no=row.get("owner_contact_no"),
                tag=list(row.get("tag") or []),
                greeting_preference=row.get("greeting_preference"),
                status=ProspectStatus(row.get("status") or ProspectStatus.ACTIVE.value),
                company_id=current_user.company_id,
                created_by=str(current_user.id),
                deleted=False,
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in valid_rows
        ]

        await SalesProspect.insert_many(prospects)
        for prospect in prospects:
            await LeadEventPublisher.lead_created(prospect, current_user, source=source_label)

        return LeadImportResult(
            total_rows=total_input_rows,
            total_uploaded=len(prospects),
            skipped_rows=len(skipped_rows),
            assigned_breakdown=dict(assignment_counts),
            warnings=skipped_rows[:50],
        ).__dict__

    @staticmethod
    async def preview_import(
        current_user: User,
        file: UploadFile,
        *,
        strategy: str,
        target_user_id: Optional[str] = None,
        target_department_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not current_user.company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
        file_name = file.filename or "upload.csv"
        if not file_name.lower().endswith((".csv", ".xlsx")) and file.content_type not in {
            "text/csv",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only CSV and XLSX files are supported")

        content = await file.read()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file uploaded")

        headers, rows = _parse_tabular_upload(file_name, content)
        normalized_headers = [_normalize_lead_csv_header(header) for header in headers]
        preview_rows = []
        failed_rows = []
        for idx, row in enumerate(rows, start=2):
            row_norm = {_normalize_lead_csv_header(key): (value or "").strip() for key, value in row.items() if key is not None}
            email = (row_norm.get("email") or "").lower()
            if not email:
                failed_rows.append({"row": idx, "error": "Missing email"})
                continue
            if not any(h in normalized_headers for h in ["name", "first_name"]):
                failed_rows.append({"row": idx, "error": "Missing name"})
                continue
            preview_rows.append(
                {
                    "row": idx,
                    "first_name": row_norm.get("first_name") or row_norm.get("name") or "",
                    "last_name": row_norm.get("last_name") or "",
                    "email": email,
                    "phone": row_norm.get("phone") or "",
                    "company_name": row_norm.get("company") or row_norm.get("company_name") or "",
                    "current_stage": row_norm.get("stage") or row_norm.get("current_stage") or "new",
                    "assigned_to": target_user_id if strategy == "manual" else None,
                    "status": row_norm.get("status") or ProspectStatus.ACTIVE.value,
                }
            )

        job = SalesImportJob(
            company_id=current_user.company_id,
            created_by=str(current_user.id),
            filename=file_name,
            strategy=strategy,
            target_user_id=target_user_id,
            target_department_id=target_department_id,
            status="previewed",
            total_rows=len(rows),
            skipped_rows=len(failed_rows),
            failed_rows=failed_rows,
            preview_rows=preview_rows[:100],
            source_payload={"headers": headers},
        )
        await job.insert()
        return {
            "job_id": str(job.id),
            "total_rows": len(rows),
            "preview_rows": preview_rows[:100],
            "failed_rows": failed_rows[:100],
        }

    @staticmethod
    async def retry_import_job(current_user: User, job_id: str) -> Dict[str, Any]:
        job = await SalesImportJob.get(job_id)
        if not job or job.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import job not found")
        _ = dict(job.source_payload or {})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Retry requires the original uploaded file; use preview to re-upload the file.")

    @staticmethod
    async def move_stage(current_user: User, lead_id: str, target_stage: str, reason: Optional[str] = None) -> Dict[str, Any]:
        from app.crm.pipeline import CRMPipelineService

        return await CRMPipelineService.move_lead(current_user, lead_id, target_stage, reason=reason)
