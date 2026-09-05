import { Navigate } from "react-router-dom";

/**
 * HR Department landing page — redirects to the new HR Dashboard (Phase 10).
 * Keep this file so old bookmarks (/hr) still resolve.
 */
export default function HRDepartment() {
  return <Navigate to="/hr/dashboard" replace />;
}
