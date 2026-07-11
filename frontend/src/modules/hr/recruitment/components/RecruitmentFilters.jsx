import { Bookmark, Filter, X } from "lucide-react";

import { Button, inputClassName } from "../../../../components/ui";
import { SearchBar } from "./SearchBar";

export function RecruitmentFilters({ search, onSearch, filters = [], values, onChange, onReset }) {
  const activeFilters = Object.entries(values || {}).filter(([, value]) => value);
  const savedFilters = ["Frontend Hiring", "Marketing Hiring", "Urgent Hiring"];

  return (
    <div className="mb-5 rounded-3xl border border-surface-border bg-surface p-4 shadow-card dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200">
            <Filter className="h-4 w-4" />
          </span>
          Advanced filters
        </div>
        <div className="flex flex-wrap gap-2">
          {savedFilters.map((filter) => (
            <button key={filter} type="button" className="inline-flex items-center gap-1 rounded-full border border-surface-border px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-primary-300 hover:text-primary-700 dark:border-gray-800">
              <Bookmark className="h-3.5 w-3.5" /> {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(160px,220px))_auto]">
        <SearchBar value={search || ""} onChange={onSearch} placeholder="Search candidates, jobs, interviews, resumes" />
        {filters.map((filter) => (
          <select
            key={filter.key}
            className={inputClassName}
            value={values?.[filter.key] || ""}
            onChange={(event) => onChange(filter.key, event.target.value)}
            aria-label={filter.label}
          >
            <option value="">{filter.label}</option>
            {filter.options.map((option) => (
              <option key={option} value={option}>{String(option).replace(/_/g, " ")}</option>
            ))}
          </select>
        ))}
        <Button type="button" variant="secondary" onClick={onReset}>Clear all</Button>
      </div>

      {activeFilters.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilters.map(([key, value]) => (
            <button key={key} type="button" onClick={() => onChange(key, "")} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 dark:bg-primary-950/40 dark:text-primary-200">
              {key.replace(/_/g, " ")}: {String(value).replace(/_/g, " ")}
              <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
