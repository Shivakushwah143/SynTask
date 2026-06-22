"""
User Models - Base and Role-specific
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import EmailStr, Field
from enum import Enum
from pymongo import ASCENDING, IndexModel


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"  # Company Admin (renamed for clarity)
    MANAGER = "manager"
    LEAD = "lead"
    EMPLOYEE = "employee"
    
    # Legacy support - COMPANY_ADMIN maps to ADMIN
    @classmethod
    def from_legacy(cls, role_str: str) -> 'UserRole':
        """Convert legacy COMPANY_ADMIN to ADMIN"""
        if role_str == "company_admin":
            return cls.ADMIN
        return cls(role_str)


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"


class User(Document):
    """Base User Model with Hierarchical RBAC"""
    email: Indexed(EmailStr, unique=True)
    password_hash: str
    first_name: str
    last_name: str
    role: UserRole
    status: UserStatus = UserStatus.PENDING
    # Modules the user can access (e.g., task management, sales tracker)
    modules: List[str] = Field(default_factory=lambda: ["task"])
    # Preferred/last active module for UI landing
    active_module: Optional[str] = Field(default="task")
    phone: Optional[str] = None
    avatar: Optional[str] = None
    company_id: Optional[str] = None  # For company users
    
    # Hierarchical Reporting Structure
    reports_to: Optional[str] = None  # User ID of the person this user reports to
    created_by: Optional[str] = None  # User ID who created this user
    ancestors: List[str] = Field(default_factory=list)  # Root-to-parent user IDs for hierarchy lookups
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    is_email_verified: bool = False
    two_factor_enabled: bool = False
    two_factor_secret: Optional[str] = None  # Encrypted with ENCRYPTION_KEY
    # Password reset token hash (replaces OTP)
    password_reset_token: Optional[str] = None
    password_reset_token_expires_at: Optional[datetime] = None
    password_reset_token_used: bool = False
    # Notification preferences
    notification_preferences: dict = Field(default_factory=lambda: {
        "email_notifications": True,
        "in_app_notifications": True,
        "task_assignment_alerts": True,
        "ticket_updates": True
    })
    
    class Settings:
        name = "users"
        indexes = [
            "email",
            "company_id",
            "role",
            "status",
            "reports_to",
            "created_by",
            "ancestors",
            "password_reset_token",
            IndexModel([("company_id", ASCENDING), ("role", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("role", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("reports_to", ASCENDING), ("role", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("reports_to", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("ancestors", ASCENDING)]),
        ]
    
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"
    
    async def get_all_subordinates(self) -> List['User']:
        """Get all users that report directly or indirectly to this user."""
        from app.models.user import User
        query = {"ancestors": str(self.id)}
        if self.company_id:
            query["company_id"] = self.company_id
        return await User.find(query).to_list()
    
    async def get_all_managers(self) -> List['User']:
        """Get all managers in the chain using the denormalized ancestors array."""
        from app.models.user import User
        if not self.ancestors:
            return []
        return await User.find({"_id": {"$in": self.ancestors}}).to_list()
    
    def can_create_role(self, target_role: UserRole) -> bool:
        """Check if this user can create a user with target_role"""
        # Super Admin can create Admin
        if self.role == UserRole.SUPER_ADMIN:
            return target_role == UserRole.ADMIN
        
        # Admin can create Manager, Lead, Employee
        if self.role == UserRole.ADMIN:
            return target_role in [UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE]
        
        # Manager can create Manager, Lead
        if self.role == UserRole.MANAGER:
            return target_role in [UserRole.MANAGER, UserRole.LEAD]
        
        # Lead can create Employee
        if self.role == UserRole.LEAD:
            return target_role == UserRole.EMPLOYEE
        
        # Employee cannot create anyone
        return False
    
    def can_report_to(self, manager_id: str, manager_role: UserRole) -> bool:
        """Check if this user can report to the given manager"""
        # Super Admin doesn't report to anyone
        if self.role == UserRole.SUPER_ADMIN:
            return False
        
        # Admin doesn't report to anyone
        if self.role == UserRole.ADMIN:
            return False
        
        # Manager can report to Admin or another Manager
        if self.role == UserRole.MANAGER:
            return manager_role in [UserRole.ADMIN, UserRole.MANAGER]
        
        # Lead can report only to Manager
        if self.role == UserRole.LEAD:
            return manager_role == UserRole.MANAGER
        
        # Employee can report only to Lead
        if self.role == UserRole.EMPLOYEE:
            return manager_role == UserRole.LEAD
        
        return False


class SuperAdmin(User):
    """Super Admin - Manages the entire platform"""
    role: UserRole = UserRole.SUPER_ADMIN
    permissions: List[str] = [
        "manage_companies",
        "manage_subscriptions",
        "view_analytics",
        "manage_billing",
        "manage_super_admins",
    ]


class Admin(User):
    """Admin - Manages company operations (formerly Company Admin)"""
    role: UserRole = UserRole.ADMIN
    permissions: List[str] = [
        "manage_company_users",
        "create_managers",
        "create_leads",
        "create_employees",
        "manage_tasks",
        "manage_tickets",
        "view_company_reports",
    ]
    department: Optional[str] = None


# Alias for backward compatibility
CompanyAdmin = Admin


class Manager(User):
    """Manager - Manages teams and can have nested managers"""
    role: UserRole = UserRole.MANAGER
    permissions: List[str] = [
        "create_managers",
        "create_leads",
        "assign_tasks",
        "manage_team",
        "view_team_reports",
        "manage_tickets",
    ]
    department: Optional[str] = None
    team_name: Optional[str] = None


class Lead(User):
    """Lead - Manages employees and delegates tasks"""
    role: UserRole = UserRole.LEAD
    permissions: List[str] = [
        "create_employees",
        "create_tasks",
        "assign_tasks",
        "manage_team",
        "view_team_reports",
        "manage_tickets",
    ]
    team_name: Optional[str] = None
    department: Optional[str] = None
    managed_employee_ids: List[str] = []


class Employee(User):
    """Employee - Executes tasks"""
    role: UserRole = UserRole.EMPLOYEE
    permissions: List[str] = [
        "view_tasks",
        "update_task_status",
        "create_tickets",
        "comment_on_tasks",
    ]
    lead_id: Optional[str] = None  # Legacy field - use reports_to instead
    department: Optional[str] = None
    designation: Optional[str] = None

