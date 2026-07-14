import { Search } from "lucide-react";
import { inputClassName } from "../../../../components/ui";

export function SearchBar({ value, onChange, placeholder = "Search" }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input className={`${inputClassName} pl-10`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

