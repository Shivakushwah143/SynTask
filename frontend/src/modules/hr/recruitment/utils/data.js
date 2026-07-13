import { format } from "date-fns";

export const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

export const totalFrom = (value) => Number(value?.total ?? value?.count ?? toArray(value).length ?? 0);

export const idOf = (item) => item?.id || item?._id;

export const compactParams = (params) =>
  Object.fromEntries(Object.entries(params || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined));

export const fmtDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : format(date, "MMM d, yyyy");
};

export const fmtDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : format(date, "MMM d, yyyy, h:mm a");
};

export const labelize = (value) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
