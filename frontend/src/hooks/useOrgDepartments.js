// SynTask v3.0 — Shared org-departments loader (tab sub-nav plan, Phase A).
// Used by BOTH the Sidebar and the SectionTabs bar so the People section's dynamic
// "Your Departments" items resolve identically everywhere. Reuses the existing
// departments API + change event (same behaviour as the old inline Sidebar effect).
import { useEffect, useState } from "react";
import { DEPARTMENTS_CHANGED_EVENT, departmentsAPI } from "../api/departments";
import { useAuthStore } from "../store/authStore";
import { hasCompanyAdminAccess, isSuperAdminRole, normalizeRole } from "../utils/roles";
import { hasModuleAccess } from "../config/navigation";

export const useOrgDepartments = () => {
  const { user } = useAuthStore();
  const userRole = normalizeRole(user?.role);
  const canSeeDepartments =
    (hasCompanyAdminAccess(user?.role) && hasModuleAccess(user, "tasks_projects")) ||
    isSuperAdminRole(userRole);
  const [orgDepartments, setOrgDepartments] = useState([]);

  useEffect(() => {
    if (!canSeeDepartments) {
      setOrgDepartments([]);
      return undefined;
    }

    let cancelled = false;

    const loadDepartments = async () => {
      try {
        const data = await departmentsAPI.listDepartments();
        if (cancelled) return;
        setOrgDepartments(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setOrgDepartments([]);
      }
    };

    const handleDepartmentsChanged = () => {
      if (!cancelled) void loadDepartments();
    };

    void loadDepartments();
    window.addEventListener(DEPARTMENTS_CHANGED_EVENT, handleDepartmentsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(DEPARTMENTS_CHANGED_EVENT, handleDepartmentsChanged);
    };
  }, [canSeeDepartments]);

  return orgDepartments;
};
