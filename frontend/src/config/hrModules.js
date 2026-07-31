import {
  Briefcase,
  CalendarClock,
  ClipboardList,
  FileBarChart2,
  Gauge,
  Inbox,
  UserRoundSearch,
} from "lucide-react";

import { ROLE } from "../utils/roles";

export const HR_ROLES = [
  ROLE.SUPER_ADMIN,
  ROLE.ADMIN,
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
