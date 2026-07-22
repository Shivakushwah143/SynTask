from typing import List, Optional, Tuple

from beanie import PydanticObjectId
from beanie.exceptions import CollectionWasNotInitialized
from fastapi import HTTPException, status

from app.core.security import get_password_hash
from app.models.user import User, UserRole, UserStatus
from app.schemas.users import CreateUserRequest, UpdateUserRequest


class UserService:
    @staticmethod
    async def create_user(data: CreateUserRequest, company_id: Optional[str], created_by: str) -> User:
        existing = await User.find_one({"email": data.email.lower()})
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        user = User(
            email=data.email.lower(),
            password_hash=get_password_hash(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
            role=UserRole(data.role.value),
            status=UserStatus.ACTIVE,
            company_id=company_id,
            reports_to=data.reports_to,
            created_by=created_by,
            phone=data.phone,
            modules=data.modules or ["task"],
            active_module=(data.modules or ["task"])[0],
        )
        await UserService.update_hierarchy_ancestors(user)
        await user.insert()
        return user

    @staticmethod
    async def update_user(user: User, data: UpdateUserRequest) -> User:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(user, field, value)
        await user.save()
        return user

    @staticmethod
    async def get_user_by_id(user_id: str, company_id: Optional[str] = None) -> User:
        user = await User.get(PydanticObjectId(user_id))
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if company_id and user.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    @staticmethod
    async def list_users(company_id: Optional[str], role: Optional[str] = None, skip: int = 0, limit: int = 20) -> Tuple[List[User], int]:
        query = {}
        if company_id:
            query["company_id"] = company_id
        if role:
            query["role"] = role
        total = await User.find(query).count()
        users = await User.find(query).skip(skip).limit(min(limit, 100)).to_list()
        return users, total

    @staticmethod
    async def update_hierarchy_ancestors(user: User) -> None:
        if not user.reports_to:
            user.ancestors = []
            return

        parent = await User.get(user.reports_to)
        user.ancestors = [*getattr(parent, "ancestors", []), user.reports_to] if parent else []

    @staticmethod
    async def get_all_subordinates_ids(user_id: str, company_id: Optional[str]) -> List[str]:
        query = {"ancestors": user_id}
        if company_id:
            query["company_id"] = company_id
        try:
            users = await User.find(query).to_list()
        except CollectionWasNotInitialized:
            return []
        return [str(user.id) for user in users]

    @staticmethod
    async def get_all_manager_ids(user: User) -> List[str]:
        return list(getattr(user, "ancestors", []) or [])
