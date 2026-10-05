"""Canonical, configurable business permission catalog.

This is deliberately backend-owned.  The administration UI consumes the
serialized catalog instead of keeping a second list of action keys.
"""
from __future__ import annotations

from typing import Any

SCOPES = ("self", "created", "assigned", "project", "team", "department", "company")


def _actions(module: str, label: str, actions: list[tuple[str, str, tuple[str, ...]]]) -> list[dict[str, Any]]:
    return [
        {"module_id": module, "module_label": label, "action_id": action,
         "key": f"{module}.{action}", "label": action_label,
         "configurable": True, "supported_scopes": list(scopes)}
        for action, action_label, scopes in actions
    ]


PERMISSION_CATALOG = [
    *_actions("projects", "Projects", [
        ("view", "View projects", SCOPES), ("create", "Create projects", ("department", "team", "company")),
        ("update", "Edit projects", ("created", "project", "team", "department", "company")),
        ("delete", "Delete projects", ("created", "project", "team", "department", "company")),
        ("assign_members", "Assign members", ("project", "team", "department", "company")),
        ("change_owner", "Change owner", ("project", "team", "department", "company")),
        ("change_status", "Change status", ("project", "team", "department", "company")),
        ("board.manage", "Manage board", ("project", "team", "department", "company")),
        ("sprints.manage", "Manage sprints", ("project", "team", "department", "company")),
        ("epics.manage", "Manage epics", ("project", "team", "department", "company")),
        ("resources.view", "View resources", SCOPES), ("resources.manage", "Manage resources", ("project", "team", "department", "company")),
        ("pages.manage", "Manage files and pages", ("project", "team", "department", "company")),
    ]),
    *_actions("tasks", "Tasks", [
        ("view", "View tasks", SCOPES), ("create", "Create tasks", ("project", "team", "department", "company")),
        ("update", "Edit tasks", SCOPES), ("delete", "Delete tasks", ("created", "assigned", "project", "team", "department", "company")),
        ("assign", "Assign tasks", ("project", "team", "department", "company")), ("reassign", "Reassign tasks", ("project", "team", "department", "company")),
        ("update_status", "Change status", ("self", "created", "assigned", "project", "team", "department", "company")),
        ("comment", "Comment", SCOPES), ("checklist.manage", "Manage checklist", SCOPES),
        ("dependencies.manage", "Manage dependencies", ("created", "project", "team", "department", "company")),
        ("proof.submit", "Submit proof", ("self", "assigned", "project", "team", "department", "company")),
        ("review", "Review", ("assigned", "project", "team", "department", "company")),
        ("approve", "Approve", ("project", "team", "department", "company")), ("reject", "Reject", ("project", "team", "department", "company")),
        ("complete", "Complete", ("self", "assigned", "project", "team", "department", "company")),
        ("reopen", "Reopen", ("project", "team", "department", "company")),
    ]),
    *_actions("permissions", "Administration", [("delegate", "Delegate permissions", ("team", "department", "company"))]),
]

# Existing capability families are also catalogued. They retain their established
# endpoint enforcement while becoming editable through the same API.
for _module, _label, _actions_list in [
    ("employee_management", "Employees", ["view", "manage"]), ("leave_management", "Leave", ["view", "manage"]),
    ("attendance_policy", "Attendance", ["view", "manage"]), ("attendance_corrections", "Attendance corrections", ["view", "manage"]),
    ("salary_management", "Salary", ["view", "manage"]), ("payroll", "Payroll", ["view", "manage", "approve"]),
    ("employee_lifecycle", "Employee lifecycle", ["view", "manage", "separation"]),
    ("recruitment", "Recruitment", ["view", "convert_employee"]), ("content", "Content", ["view", "create", "edit", "delete", "transition", "comment", "internal_review", "client_review", "view_publishing", "update_publishing"]),
]:
    PERMISSION_CATALOG.extend(_actions(_module, _label, [(action, action.replace("_", " ").title(), ("department", "company")) for action in _actions_list]))

PERMISSION_BY_KEY = {entry["key"]: entry for entry in PERMISSION_CATALOG}


def is_known_permission(key: str) -> bool:
    # Legacy, pre-catalog capabilities continue to resolve but cannot be newly
    # configured unless listed above. This prevents arbitrary capability input.
    return key in PERMISSION_BY_KEY


def catalog_payload() -> list[dict[str, Any]]:
    return PERMISSION_CATALOG
