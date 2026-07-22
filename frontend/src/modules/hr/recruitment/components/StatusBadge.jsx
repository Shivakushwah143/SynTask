import { Badge } from "../../../../components/ui";
import { labelize } from "../utils/data";

export function StatusBadge({ status }) {
  const normalized = String(status || "unknown").toLowerCase();
  const colorKey = normalized.includes("reject") || normalized.includes("fail") || normalized.includes("cancel")
    ? "cancelled"
    : normalized.includes("publish") || normalized.includes("active") || normalized.includes("accept") || normalized.includes("pass")
      ? "active"
      : normalized.includes("new")
        ? "new"
        : normalized.includes("pending") || normalized.includes("hold")
          ? "pending"
          : normalized;
  return <Badge label={labelize(status)} colorKey={colorKey} />;
}

