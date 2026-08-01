"""Pass 2: migrate remaining browser-local date-fns format() calls.

- Instant displays (created_at/updated_at/timestamps) -> timeService.formatPattern
- Date-only fields (row.date, start_date, delivery_date, sent_date, ...) ->
  timeService.formatDateOnly so they never shift across timezones
- Calendar query keys -> timeService.toZonedDateOnly
- Grouping keys -> timeService.toZonedDateOnly
"""
import io
import re

# date-only expressions -> formatDateOnly (no timezone shift)
DATE_ONLY_EXPRS = re.compile(
    r"timeService\.formatPattern\((?P<arg>row\.date|group\.date|log\.date|"
    r"client\.start_date|client\.delivery_date|project\.start_date|project\.delivery_date|"
    r"msa\.sent_date|msa\.signed_date|startDate|endDate|item\.date|delivery_date|"
    r"invoice\.invoice_date|start_date|due_date|effective_date), "
    r"('MMM d, yyyy'|'MMM d'|'MMMM dd, yyyy'|'MMM d, yyyy h:mm a'|'MMM d, yyyy, h:mm a'|'MMM d, yyyy - h:mm a'|'EEEE, MMM d, yyyy')\)"
)

FILES = [
    "src/modules/hr/recruitment/utils/data.js",
    "src/pages/phase4Utils.js",
    "src/pages/crm/leads/timeline.jsx",
    "src/pages/crm/activities/components.jsx",
    "src/pages/crm/companies/components.jsx",
    "src/pages/Calendar.jsx",
    "src/pages/attendance/AttendanceReports.jsx",
    "src/pages/Clients.jsx",
    "src/pages/Dashboard.jsx",
    "src/pages/MSA.jsx",
    "src/pages/MSASign.jsx",
    "src/pages/TimeTracking.jsx",
    "src/pages/crm/reports/page.jsx",
    "src/pages/Tickets.jsx",
    "src/pages/MyTeam.jsx",
    "src/pages/Companies.jsx",
    "src/pages/Departments.jsx",
    "src/pages/AIChat.jsx",
    "src/pages/AIPrioritization.jsx",
    "src/pages/crm/dashboard/page.jsx",
    "src/pages/ContentCalendar.jsx",
]


def sub_all(src):
    src = DATE_ONLY_EXPRS.sub(
        lambda m: f"timeService.formatDateOnly({m.group('arg')})", src
    )
    return src


changed = 0
for f in FILES:
    with io.open(f, encoding="utf-8") as fh:
        src = fh.read()
    new = sub_all(src)
    if new != src:
        with io.open(f, "w", encoding="utf-8") as fh:
            fh.write(new)
        changed += 1
        print("UPDATED", f)
print(f"done: {changed} files changed")
