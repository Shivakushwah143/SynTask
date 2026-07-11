import { Button, inputClassName } from "../../../../components/ui";
import { SearchBar } from "./SearchBar";

export function RecruitmentFilters({ search, onSearch, filters = [], values, onChange, onReset }) {
  return (
    <div className="mb-4 rounded-3xl border border-surface-border bg-surface p-4 shadow-card dark:border-gray-800 dark:bg-gray-950">
      <div className="flex flex-col gap-3 lg:flex-row">
        <SearchBar value={search || ""} onChange={onSearch} placeholder="Search recruitment records" />
        {filters.map((filter) => (
          <select
            key={filter.key}
            className={`${inputClassName} lg:max-w-[220px]`}
            value={values?.[filter.key] || ""}
            onChange={(event) => onChange(filter.key, event.target.value)}
          >
            <option value="">{filter.label}</option>
            {filter.options.map((option) => (
              <option key={option} value={option}>{String(option).replace(/_/g, " ")}</option>
            ))}
          </select>
        ))}
        <Button type="button" variant="secondary" onClick={onReset}>Reset</Button>
      </div>
    </div>
  );
}

