import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { JOB_STATUSES } from "../constants";
import { StatusBadge } from "./StatusBadge";
import { labelize } from "../utils/data";

/**
 * Dropdown that lets a user change a job's lifecycle status.
 * Shows every embedded lifecycle status (draft, pending_approval, approved,
 * published, paused, closed, archived) and calls `onChange(status)` on select.
 *
 * The menu is rendered through a portal to document.body so it is never
 * clipped by the table's overflow container.
 */
export function JobStatusDropdown({ job, onChange, disabled = false, loading = false }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const triggerRef = useRef(null);
  const current = job?.lifecycle_status || job?.status || "draft";

  const positionMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 208; // w-52
    const estimatedHeight = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setMenuStyle({
      top: openUp ? rect.top - estimatedHeight : rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - menuWidth - 8),
      width: menuWidth,
    });
  };

  useLayoutEffect(() => {
    if (open) positionMenu();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleScroll = () => setOpen(false);
    const handleResize = () => setOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  const selectStatus = (status) => {
    setOpen(false);
    if (status === current) return;
    onChange?.(status);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-1 py-0.5 transition hover:border-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-gray-700 dark:hover:bg-gray-800"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change job status"
      >
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating…
          </span>
        ) : (
          <StatusBadge status={current} />
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        createPortal(
          <div
            role="listbox"
            style={menuStyle}
            className="fixed z-[100] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Set status
            </p>
            <div className="max-h-64 overflow-y-auto">
              {JOB_STATUSES.map((status) => {
                const isCurrent = status === current;
                return (
                  <button
                    key={status}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={() => selectStatus(status)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      isCurrent
                        ? "bg-indigo-50/60 font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <StatusBadge status={status} />
                      <span>{labelize(status)}</span>
                    </span>
                    {isCurrent ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}