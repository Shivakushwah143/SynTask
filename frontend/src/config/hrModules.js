import {
  BarChart3,
  Briefcase,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  DollarSign,
  FileBarChart2,
  FileText,
  Gauge,
  Inbox,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserCheck,
  UserRoundSearch,
} from "lucide-react";

import { ROLE } from "../utils/roles";

export const HR_ROLES = [
  ROLE.SUPER_ADMIN,
  ROLE.ADMIN,
  ROLE.SUB_ADMIN,
  ROLE.MANAGER,
  ROLE.LEAD,
  ROLE.EMPLOYEE,
  "hr_manager",
  "recruiter",
  "interviewer",
  "department_manager",
];

export const HR_MODULES = [
  {
    key: "hr_dashboard",
    name: "HR Dashboard",
    basePath: "/hr/dashboard",
    module: "hr",
    roles: HR_ROLES,
    icon: LayoutDashboard,
    navigation: [
      {
        name: "HR Dashboard",
        href: "/hr/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    key: "hr_reports",
    name: "HR Reports",
    basePath: "/hr/reports",
    module: "hr",
    roles: HR_ROLES,
    icon: BarChart3,
    navigation: [
      {
        name: "HR Reports",
        href: "/hr/reports",
        icon: BarChart3,
      },
    ],
  },
  {
    key: "employees",
    name: "Employees",
    basePath: "/hr/employees",
    module: "hr",
    roles: HR_ROLES,
    icon: UserCheck,
    navigation: [
      {
        name: "Employees",
        href: "/hr/employees",
        icon: UserCheck,
      },
    ],
  },
  {
    key: "payroll",
    name: "Payroll",
    basePath: "/hr/payroll",
    module: "hr",
    roles: HR_ROLES,
    icon: DollarSign,
    navigation: [
      {
        name: "Payroll",
        href: "/hr/payroll",
        icon: DollarSign,
      },
    ],
  },
  {
    key: "documents",
    name: "Documents",
    basePath: "/hr/documents",
    module: "hr",
    roles: HR_ROLES,
    icon: FileText,
    navigation: [
      {
        name: "Documents",
        href: "/hr/documents",
        icon: FileText,
      },
    ],
  },
  {
    key: "hr_settings",
    name: "HR Settings",
    basePath: "/hr/settings",
    module: "hr",
    roles: HR_ROLES,
    icon: Settings,
    navigation: [
      {
        name: "Attendance Policy",
        href: "/hr/settings/attendance-policy",
        icon: ShieldCheck,
      },
      {
        name: "Holidays",
        href: "/hr/settings/holidays",
        icon: CalendarDays,
      },
      {
        name: "Salary Components",
        href: "/hr/settings/salary-components",
        icon: DollarSign,
      },
      {
        name: "Document Types",
        href: "/hr/settings/document-types",
        icon: Settings,
      },
      {
        name: "Leave Types",
        href: "/hr/settings/leave-types",
        icon: CalendarDays,
      },
      {
        name: "Leave Allocations",
        href: "/hr/leave-allocations",
        icon: CalendarCheck2,
      },
    ],
  },
  {
    key: "recruitment",
    name: "Recruitment",
    basePath: "/hr/recruitment",
    module: "hr",
    roles: HR_ROLES,
    icon: Briefcase,
    navigation: [
      {
        name: "Recruitment Dashboard",
        href: "/hr/recruitment",
        icon: Gauge,
      },
      {
        name: "Jobs",
        href: "/hr/recruitment/jobs",
        icon: Briefcase,
      },
      {
        name: "Inbox",
        href: "/hr/recruitment/inbox",
        icon: Inbox,
      },
      {
        name: "Candidates",
        href: "/hr/recruitment/candidates",
        icon: UserRoundSearch,
      },
      {
        name: "Resume Pool",
        href: "/hr/recruitment/resume-pool",
        icon: ClipboardList,
      },
      {
        name: "Interviews",
        href: "/hr/recruitment/interviews",
        icon: CalendarClock,
      },
      {
        name: "Offers",
        href: "/hr/recruitment/offers",
        icon: FileText,
      },
      {
        name: "Reports",
        href: "/hr/recruitment/reports",
        icon: FileBarChart2,
      },
      {
        name: "Candidate Interview Screen",
        href: "/hr/recruitment/interview-screen",
        icon: UserRoundSearch,
      },
    ],
  },
];

export const getHrModuleByKey = (key) => HR_MODULES.find((module) => module.key === key);
