import { Link } from "react-router-dom";
import { Briefcase } from "lucide-react";

import { Badge, PageHeader } from "../../components/ui";
import { HR_MODULES } from "../../config/hrModules";

export default function HRDepartment() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="HR Department"
        description="People operations workspace. Recruitment is the first module; future HR modules plug into this department shell."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {HR_MODULES.map((module) => (
          <Link
            key={module.key}
            to={module.basePath}
            className="rounded-3xl border border-surface-border bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-modal dark:border-gray-800 dark:bg-gray-950"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200">
                <module.icon className="h-6 w-6" />
              </div>
              <Badge label="Active" colorKey="active" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">{module.name}</h2>
            <p className="mt-2 text-sm text-text-muted">
              Manage jobs, candidates, interviews and recruitment analytics.
            </p>
          </Link>
        ))}

        <div className="rounded-3xl border border-dashed border-surface-border bg-surface-muted/50 p-6 dark:border-gray-800 dark:bg-gray-900/40">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 dark:bg-gray-800 dark:text-gray-300">
            <Briefcase className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Future HR Modules</h2>
          <p className="mt-2 text-sm text-text-muted">
            Employees, Attendance, Leave, Payroll and Performance will be added as HR module config entries.
          </p>
        </div>
      </div>
    </div>
  );
}
