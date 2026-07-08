/*
 * Seed a small Phase 3 demo dataset through mongosh.
 *
 * Run from backend/:
 * mongosh "<MONGODB_URL>" scripts/seed_phase3_demo.mongodb.js
 */

const demoPasswordHash = "$2b$12$fuoXXpbJbOHt0sK7NgFgKu14lqDFj7p6wWYXN3EODRgle0HmQy9Py";
const demoPassword = "Demo@123456";
const databaseName = "alphanexis_task_management";
const companyEmail = "phase3-demo-company@example.com";
const adminEmail = "phase3admin@example.com";
const taskOnlyEmail = "phase3taskonly@example.com";
const projectId = "P3-DEMO-001";
const projectKey = "P3D";
const taskTitle = "Phase 3 Demo Task";
const now = new Date();

const demoDb = db.getSiblingDB(databaseName);

function upsertByFilter(collectionName, filter, onInsert, updates) {
  demoDb[collectionName].updateOne(
    filter,
    {
      $setOnInsert: { _id: new ObjectId(), ...onInsert },
      $set: { ...updates, updated_at: now },
    },
    { upsert: true }
  );
  return demoDb[collectionName].findOne(filter);
  
}

const company = upsertByFilter(
  "companies",
  { email: companyEmail },
  {
    name: "Phase 3 Demo Company",
    email: companyEmail,
    phone: "+10000000000",
    website: "https://example.com",
    industry: "Software",
    company_size: "1-10",
    max_users: 25,
    max_projects: 25,
    max_storage_gb: 10,
    created_at: now,
  },
  {
    status: "active",
    approved_at: now,
  }
);

const companyId = company._id.toString();

const admin = upsertByFilter(
  "users",
  { email: adminEmail },
  {
    _class_id: "User",
    email: adminEmail,
    created_at: now,
    notification_preferences: {
      email_notifications: true,
      in_app_notifications: true,
      task_assignment_alerts: true,
      ticket_updates: true,
    },
  },
  {
    password_hash: demoPasswordHash,
    first_name: "Phase3",
    last_name: "Admin",
    role: "admin",
    status: "active",
    modules: ["task", "sales"],
    active_module: "task",
    phone: null,
    avatar: null,
    company_id: companyId,
    reports_to: null,
    created_by: null,
    ancestors: [],
    is_email_verified: true,
    two_factor_enabled: false,
  }
);

const adminId = admin._id.toString();

const employee = upsertByFilter(
  "users",
  { email: taskOnlyEmail },
  {
    _class_id: "User",
    email: taskOnlyEmail,
    created_at: now,
    notification_preferences: {
      email_notifications: true,
      in_app_notifications: true,
      task_assignment_alerts: true,
      ticket_updates: true,
    },
  },
  {
    password_hash: demoPasswordHash,
    first_name: "Phase3",
    last_name: "TaskOnly",
    role: "employee",
    status: "active",
    modules: ["task"],
    active_module: "task",
    phone: null,
    avatar: null,
    company_id: companyId,
    reports_to: adminId,
    created_by: adminId,
    ancestors: [adminId],
    is_email_verified: true,
    two_factor_enabled: false,
  }
);

const employeeId = employee._id.toString();

demoDb.companies.updateOne(
  { _id: company._id },
  { $set: { admin_id: adminId, updated_at: now } }
);

upsertByFilter(
  "subscriptions",
  { company_id: companyId },
  {
    company_id: companyId,
    plan: "free",
    amount: 0,
    currency: "USD",
    billing_cycle: "monthly",
    start_date: now,
    created_at: now,
    auto_renew: true,
  },
  {
    status: "active",
    current_users: 2,
    current_projects: 1,
    current_storage_gb: 0,
    trial_end_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  }
);

const project = upsertByFilter(
  "projects",
  { company_id: companyId, project_id: projectId },
  {
    name: "Phase 3 Demo Project",
    key: projectKey,
    project_id: projectId,
    company_id: companyId,
    created_at: now,
    created_by: adminId,
    files: [],
    board_columns: [
      { id: "todo", label: "TO DO", color: "bg-gray-100", order: 0 },
      { id: "in_progress", label: "IN PROGRESS", color: "bg-blue-100", order: 1 },
      { id: "in_review", label: "IN REVIEW", color: "bg-yellow-100", order: 2 },
      { id: "completed", label: "COMPLETED", color: "bg-green-100", order: 3 },
    ],
  },
  {
    description: "Demo project for Phase 3 architecture QA.",
    type: "software",
    status: "active",
    lead_id: adminId,
    assigned_to: adminId,
    assigned_by: adminId,
    assigned_at: now,
    team_member_ids: [adminId, employeeId],
    default_assignee: employeeId,
    notification_settings: {},
    start_date: now,
    delivery_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    category: "QA",
  }
);

const projectObjectId = project._id.toString();

const epic = upsertByFilter(
  "epics",
  { company_id: companyId, project_id: projectId, name: "Phase 3 Demo Epic" },
  {
    name: "Phase 3 Demo Epic",
    project_id: projectId,
    company_id: companyId,
    created_at: now,
    created_by: adminId,
  },
  {
    description: "Demo epic for project endpoint tests.",
    owner_id: adminId,
    status: "in_progress",
    progress_percentage: 0,
    color: "#2563eb",
  }
);

const sprint = upsertByFilter(
  "sprints",
  { company_id: companyId, project_id: projectId, name: "Phase 3 Demo Sprint" },
  {
    name: "Phase 3 Demo Sprint",
    project_id: projectId,
    company_id: companyId,
    created_at: now,
    created_by: adminId,
  },
  {
    goal: "Verify Phase 3 project and task endpoints.",
    start_date: now,
    end_date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    state: "active",
    team_member_ids: [adminId, employeeId],
  }
);

const task = upsertByFilter(
  "tasks",
  { company_id: companyId, title: taskTitle, project_id: projectId },
  {
    title: taskTitle,
    company_id: companyId,
    project_id: projectId,
    created_at: now,
    created_by: adminId,
    attachments: [],
    affects_version_ids: [],
  },
  {
    description: "A seeded task used for Phase 3 manual testing.",
    project_object_id: projectObjectId,
    assigned_to: employeeId,
    assigned_by: adminId,
    status: "todo",
    priority: "medium",
    due_date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    start_date: now,
    tags: ["phase3", "demo"],
    parent_task_id: null,
    epic_id: epic._id.toString(),
    sprint_id: sprint._id.toString(),
    story_points: 3,
    estimated_hours: 4,
  }
);

print("Phase 3 demo seed complete.");
print(`Admin login:      ${adminEmail} / ${demoPassword}`);
print(`Task-only login:  ${taskOnlyEmail} / ${demoPassword}`);
print(`Company ID:       ${companyId}`);
print(`Admin User ID:    ${adminId}`);
print(`Employee User ID: ${employeeId}`);
print(`Project ID:       ${projectId}`);
print(`Project Object:   ${projectObjectId}`);
print(`Epic ID:          ${epic._id}`);
print(`Sprint ID:        ${sprint._id}`);
print(`Task ID:          ${task._id}`);
