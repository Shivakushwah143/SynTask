"""
One-time operational fix for the eTimeOffice -> SynTask employee mapping.

Background: the original integration inferred SynTask employees from the
numeric suffix of ``EmployeeProfile.employee_number`` (e.g. ``EMP-2026-0001``
-> ``0001``). That silently attached eTimeOffice punches to the wrong people
(e.g. external code 0001 is really Kavita Borse, not whoever holds the
``-0001`` suffix). This script replaces those inferred links with EXPLICIT,
HR-confirmed mappings and repairs the biometric attendance rows that were
written under the wrong employee.

The explicit mapping is the only link the sync honors from now on; this script
runs once per company to seed it and reconcile existing rows.

Run from ``backend/``:

    python -m scripts.reconcile_etimeoffice_mappings --company <company_id>            # dry-run report
    python -m scripts.reconcile_etimeoffice_mappings --company <company_id> --apply    # apply
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import init_db  # noqa: E402
from app.models.company import Company  # noqa: E402
from app.services.etimeoffice_mapping_service import (  # noqa: E402
    company_employee_candidates,
    list_etimeoffice_mappings,
    reconcile_etimeoffice_attendance,
    set_etimeoffice_mapping,
    suggest_employee,
)
from app.services.etimeoffice_sync_service import refresh_etimeoffice_directory  # noqa: E402


async def _run(company_id: str, apply: bool) -> int:
    company = await Company.get(company_id)
    if not company:
        print(f"Company not found: {company_id}")
        return 2

    if apply:
        print("Refreshing eTimeOffice directory from the provider (read-only)...")
        entries = await refresh_etimeoffice_directory(company_id)
        print(f"Directory refresh: {len(entries)} external employees seen.")
    else:
        print("DRY RUN — nothing is written. Re-run with --apply to seed mappings "
              "and reconcile attendance rows.")

    candidates = await company_employee_candidates(company_id)
    print(f"\nSynTask mappable employees: {len(candidates)}")

    payload = await list_etimeoffice_mappings(company_id, refresh=False)
    print(f"\n{'Code':<6}{'eTimeOffice Name':<28}{'Current':<28}{'Suggested':<28}Action")
    picks = {}
    for row in payload["rows"]:
        code = row["external_employee_code"]
        current = row["employee"]["name"] if row["employee"] else "-"
        suggestion = row["suggestion"]
        suggested = suggestion["name"] if suggestion else "-"
        print(f"{code:<6}{row['external_employee_name'] or '-':<28}{current:<28}{suggested:<28}")
        if suggestion and not row["employee"]:
            picks[code] = suggestion["id"]

    mapped = [r for r in payload["rows"] if r["employee"]]
    if apply:
        for code, employee_id in picks.items():
            result = await set_etimeoffice_mapping(
                company_id, code, employee_id, actor_id="reconcile-script"
            )
            print(f"  seeded mapping: {code} -> {result.get('employee_id')}")
        confirmed_after = len(mapped) + len(picks)
        total = len(payload["rows"])
        print(f"\nMappings after seeding: {confirmed_after} confirmed / "
              f"{total - confirmed_after} left unmapped "
              f"(directory placeholders, pending HR).")
    else:
        print(f"\nWould seed {len(picks)} mapping(s) where a unique confident "
              f"SynTask match exists. Codes without a match stay unmapped.")

    print("\nReconciling biometric attendance rows...")
    stats = await reconcile_etimeoffice_attendance(company_id, dry_run=not apply)
    if not apply:
        stats.pop("changes", None)
    print(f"\nReconciliation summary ({'APPLIED' if apply else 'DRY-RUN'}):")
    for key in ("rows_checked", "already_correct", "reassigned", "merged_duplicate",
                "kept_existing", "unresolved"):
        print(f"  {key}: {stats.get(key, 0)}")
    if apply:
        for change in stats.get("changes", []):
            print(f"  {change.get('date')} code {change.get('external_employee_code')} "
                  f"from={change.get('from_employee_id')} "
                  f"to={change.get('to_employee_id')} "
                  f"action={change.get('action')}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company", required=True, help="SynTask company id")
    parser.add_argument("--apply", action="store_true",
                        help="Seed explicit mappings and reconcile rows (default: dry-run)")
    args = parser.parse_args()

    async def bootstrap() -> int:
        await init_db()
        return await _run(args.company, args.apply)

    try:
        return asyncio.run(bootstrap())
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
