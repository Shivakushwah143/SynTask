"""
Internal Chat System Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, File, UploadFile, Query, Body
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
import logging
from pydantic import BaseModel

from app.models.chat import Conversation, ChatMessage, MessageType
from app.models.user import User, UserRole
from app.api.dependencies import (
    get_current_user,
    check_company_access,
)
from app.core.config import settings
from app.core.clock import utc_now

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/conversations")
async def create_or_get_conversation(
    participant_id: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Create a new conversation or get existing one between two users"""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    
    # Validate participant
    participant = await User.get(participant_id)
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found"
        )
    
    if participant.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot chat with users from different companies"
        )
    
    if participant_id == str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create conversation with yourself"
        )
    
    # Check if conversation already exists
    participants = sorted([str(current_user.id), participant_id])
    existing_conversation = await Conversation.find_one({
        "company_id": current_user.company_id,
        "participants": participants,
        "is_group": False,
    })
    
    if existing_conversation:
        return {
            "id": str(existing_conversation.id),
            "participants": existing_conversation.participants,
            "last_message": existing_conversation.last_message,
            "last_message_at": existing_conversation.last_message_at,
            "unread_count": existing_conversation.unread_count.get(str(current_user.id), 0),
            "created_at": existing_conversation.created_at,
        }
    
    # Create new conversation
    conversation = Conversation(
        company_id=current_user.company_id,
        participants=participants,
        created_by=str(current_user.id),
        is_group=False,
    )
    
    await conversation.save()
    
    return {
        "id": str(conversation.id),
        "participants": conversation.participants,
        "last_message": None,
        "last_message_at": None,
        "unread_count": 0,
        "created_at": conversation.created_at,
    }


@router.get("/conversations")
async def list_conversations(
    current_user: User = Depends(get_current_user),
):
    """Get all conversations for the current user"""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    
    # Get all conversations where user is a participant
    conversations = await Conversation.find({
        "company_id": current_user.company_id,
        "participants": str(current_user.id),
    }).sort("-last_message_at").to_list()
    
    result = []
    for conv in conversations:
        # Get other participant(s) info
        other_participants = [p for p in conv.participants if p != str(current_user.id)]
        participants_info = []
        
        if conv.is_group:
            # For groups, show all participants
            for participant_id in conv.participants:
                participant = await User.get(participant_id)
                if participant:
                    participants_info.append({
                        "id": str(participant.id),
                        "name": participant.full_name(),
                        "email": participant.email,
                        "role": participant.role.value,
                        "avatar": participant.avatar,
                    })
        else:
            # For 1-on-1 chats, show only other participant
            for participant_id in other_participants:
                participant = await User.get(participant_id)
                if participant:
                    participants_info.append({
                        "id": str(participant.id),
                        "name": participant.full_name(),
                        "email": participant.email,
                        "role": participant.role.value,
                        "avatar": participant.avatar,
                    })
        
        result.append({
            "id": str(conv.id),
            "participants": participants_info,
            "is_group": conv.is_group,
            "group_name": conv.group_name,
            "group_admins": conv.group_admins if conv.is_group else [],
            "last_message": conv.last_message,
            "last_message_at": conv.last_message_at,
            "unread_count": conv.unread_count.get(str(current_user.id), 0),
            "created_at": conv.created_at,
        })
    
    return {"conversations": result}


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Get messages for a conversation"""
    conversation = await Conversation.get(conversation_id)
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    check_company_access(current_user, conversation.company_id)
    
    # Check if user is a participant
    if str(current_user.id) not in conversation.participants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this conversation"
        )
    
    # Get messages
    messages = await ChatMessage.find({
        "conversation_id": conversation_id,
        "is_deleted": False,
    }).sort("-created_at").skip(skip).limit(limit).to_list()
    
    # Mark messages as read
    user_id_str = str(current_user.id)
    for message in messages:
        if user_id_str not in message.read_by and message.sender_id != user_id_str:
            message.read_by.append(user_id_str)
            message.read_at[user_id_str] = utc_now()
            await message.save()
    
    # Update conversation unread count
    if user_id_str in conversation.unread_count:
        conversation.unread_count[user_id_str] = 0
        await conversation.save()
    
    # Reverse to show oldest first
    messages.reverse()
    
    return {
        "messages": [
            {
                "id": str(msg.id),
                "sender_id": msg.sender_id,
                "sender_name": msg.sender_name,
                "sender_role": msg.sender_role,
                "message_type": msg.message_type.value,
                "content": msg.content,
                "file_url": msg.file_url,
                "file_name": msg.file_name,
                "file_size": msg.file_size,
                "file_type": msg.file_type,
                "read_by": msg.read_by,
                "created_at": msg.created_at,
                "is_edited": msg.is_edited,
            }
            for msg in messages
        ],
        "total": len(messages),
    }


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
):
    """Send a message in a conversation (text or file)"""
    conversation = await Conversation.get(conversation_id)
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    check_company_access(current_user, conversation.company_id)
    
    # Check if user is a participant
    if str(current_user.id) not in conversation.participants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this conversation"
        )
    
    # Validate: must have either content or file
    if not content and not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either content or file must be provided"
        )
    
    message_type = MessageType.TEXT
    file_url = None
    file_name = None
    file_size = None
    file_type = None
    
    # Handle file upload
    if file:
        # Determine message type
        if file.content_type and file.content_type.startswith('image/'):
            message_type = MessageType.IMAGE
        else:
            message_type = MessageType.FILE
        
        # Save file
        import os
        import uuid
        from pathlib import Path
        from app.core.config import settings
        
        # Create uploads directory if it doesn't exist
        upload_dir = Path(settings.UPLOAD_DIR) / "chat"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_ext = Path(file.filename).suffix if file.filename else ""
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = upload_dir / unique_filename
        
        # Save file
        file_content = await file.read()
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        # Store file info - use relative path for serving
        file_url = f"/uploads/chat/{unique_filename}"
        file_name = file.filename
        file_size = len(file_content)
        file_type = file.content_type
        
        # If no content provided, use file name as content
        if not content:
            content = f"📎 {file.filename}"
    
    # Create message
    message = ChatMessage(
        conversation_id=conversation_id,
        company_id=conversation.company_id,
        sender_id=str(current_user.id),
        sender_name=current_user.full_name(),
        sender_role=current_user.role.value,
        message_type=message_type,
        content=content or "",
        file_url=file_url,
        file_name=file_name,
        file_size=file_size,
        file_type=file_type,
    )
    
    await message.save()
    
    # Update conversation
    conversation.last_message = content[:100] if content else f"📎 {file_name}"
    conversation.last_message_at = utc_now()
    conversation.last_message_by = str(current_user.id)
    conversation.updated_at = utc_now()
    
    # Update unread counts for other participants and create notifications
    for participant_id in conversation.participants:
        if participant_id != str(current_user.id):
            if participant_id not in conversation.unread_count:
                conversation.unread_count[participant_id] = 0
            conversation.unread_count[participant_id] += 1
            
            # Create notification for the recipient
            try:
                from app.models.notification import Notification, NotificationType
                notification = Notification(
                    company_id=conversation.company_id,
                    user_id=participant_id,
                    type=NotificationType.MESSAGE,
                    title="New Message",
                    message=f"{current_user.full_name()} sent you a message: {content[:100] if content else '📎 File' if file_name else 'Message'}",
                    related_id=str(message.id),
                    related_type="chat_message",
                    action_url=f"/chat?conversation={conversation_id}",
                )
                await notification.insert()
                logger.info(f"Notification created for message from {current_user.email} to participant {participant_id}")
            except Exception as e:
                logger.error(f"Error creating notification for message: {str(e)}")
    
    await conversation.save()
    
    return {
        "id": str(message.id),
        "sender_id": message.sender_id,
        "sender_name": message.sender_name,
        "sender_role": message.sender_role,
        "message_type": message.message_type.value,
        "content": message.content,
        "file_url": message.file_url,
        "file_name": message.file_name,
        "file_size": message.file_size,
        "file_type": message.file_type,
        "created_at": message.created_at,
    }


@router.get("/users/search")
async def search_users_for_chat(
    query: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Search users in the same company for starting a chat"""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    
    # Base query for same company and not current user
    search_criteria = {
        "company_id": current_user.company_id,
        "_id": {"$ne": ObjectId(current_user.id)},
    }
    
    # Add text search if query provided
    if query:
        search_criteria["$or"] = [
            {"first_name": {"$regex": query, "$options": "i"}},
            {"last_name": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}},
        ]
    
    # Execute query
    users = await User.find(search_criteria).limit(20).to_list()
    
    return {
        "users": [
            {
                "id": str(user.id),
                "name": user.full_name(),
                "email": user.email,
                "role": user.role.value,
                "avatar": user.avatar,
            }
            for user in users
        ]
    }


@router.patch("/messages/{message_id}/read")
async def mark_message_read(
    message_id: str,
    current_user: User = Depends(get_current_user),
):
    """Mark a message as read"""
    message = await ChatMessage.get(message_id)
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    check_company_access(current_user, message.company_id)
    
    user_id_str = str(current_user.id)
    
    # Mark as read if not already read
    if user_id_str not in message.read_by and message.sender_id != user_id_str:
        message.read_by.append(user_id_str)
        message.read_at[user_id_str] = utc_now()
        await message.save()
    
    return {"status": "read"}


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a message (soft delete)"""
    message = await ChatMessage.get(message_id)
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    check_company_access(current_user, message.company_id)
    
    # Only sender can delete
    if message.sender_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own messages"
        )
    
    message.is_deleted = True
    message.content = "[Message deleted]"
    message.updated_at = utc_now()
    await message.save()
    
    return {"status": "deleted"}


# Group Management Endpoints

class CreateGroupRequest(BaseModel):
    group_name: str
    participant_ids: List[str]


class AddMembersRequest(BaseModel):
    user_ids: List[str]


@router.post("/groups")
async def create_group(
    request: CreateGroupRequest = Body(...),
    current_user: User = Depends(get_current_user),
):
    """Create a new group chat"""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    
    if not request.group_name or not request.group_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group name is required"
        )
    
    # Validate participants
    participant_ids = list(set(request.participant_ids))  # Remove duplicates
    if str(current_user.id) not in participant_ids:
        participant_ids.append(str(current_user.id))  # Add creator if not present
    
    # Validate all participants exist and are in same company
    participants = []
    for user_id in participant_ids:
        user = await User.get(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {user_id} not found"
            )
        if user.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User {user.full_name()} is not in the same company"
            )
        participants.append(user)
    
    # Create group conversation
    conversation = Conversation(
        company_id=current_user.company_id,
        participants=participant_ids,
        created_by=str(current_user.id),
        is_group=True,
        group_name=request.group_name.strip(),
        group_admins=[str(current_user.id)],  # Creator is admin
    )
    
    await conversation.save()
    
    # Get participants info for response
    participants_info = []
    for participant in participants:
        participants_info.append({
            "id": str(participant.id),
            "name": participant.full_name(),
            "email": participant.email,
            "role": participant.role.value,
            "avatar": participant.avatar,
        })
    
    return {
        "id": str(conversation.id),
        "group_name": conversation.group_name,
        "is_group": True,
        "participants": participants_info,
        "group_admins": conversation.group_admins,
        "created_at": conversation.created_at,
    }


@router.get("/groups/{group_id}")
async def get_group_details(
    group_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get group details including members and admins"""
    conversation = await Conversation.get(group_id)
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    if not conversation.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is not a group conversation"
        )
    
    check_company_access(current_user, conversation.company_id)
    
    # Check if user is a participant
    if str(current_user.id) not in conversation.participants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group"
        )
    
    # Get all participants info
    participants_info = []
    for participant_id in conversation.participants:
        participant = await User.get(participant_id)
        if participant:
            participants_info.append({
                "id": str(participant.id),
                "name": participant.full_name(),
                "email": participant.email,
                "role": participant.role.value,
                "avatar": participant.avatar,
                "is_admin": participant_id in conversation.group_admins,
            })
    
    return {
        "id": str(conversation.id),
        "group_name": conversation.group_name,
        "is_group": True,
        "participants": participants_info,
        "group_admins": conversation.group_admins,
        "created_by": conversation.created_by,
        "created_at": conversation.created_at,
    }


@router.get("/groups/{group_id}/members")
async def get_group_members(
    group_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get list of group members"""
    conversation = await Conversation.get(group_id)
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    if not conversation.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is not a group conversation"
        )
    
    check_company_access(current_user, conversation.company_id)
    
    # Check if user is a participant
    if str(current_user.id) not in conversation.participants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group"
        )
    
    # Get all participants info
    members = []
    for participant_id in conversation.participants:
        participant = await User.get(participant_id)
        if participant:
            members.append({
                "id": str(participant.id),
                "name": participant.full_name(),
                "email": participant.email,
                "role": participant.role.value,
                "avatar": participant.avatar,
                "is_admin": participant_id in conversation.group_admins,
            })
    
    return {"members": members}


@router.post("/groups/{group_id}/members")
async def add_members_to_group(
    group_id: str,
    request: AddMembersRequest = Body(...),
    current_user: User = Depends(get_current_user),
):
    """Add members to a group (only admins can add)"""
    conversation = await Conversation.get(group_id)
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    if not conversation.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is not a group conversation"
        )
    
    check_company_access(current_user, conversation.company_id)
    
    # Check if user is a participant
    if str(current_user.id) not in conversation.participants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group"
        )
    
    # Check if user is admin or company admin/super admin
    is_admin = str(current_user.id) in conversation.group_admins
    is_company_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    
    if not (is_admin or is_company_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins or company admins can add members"
        )
    
    # Validate new members
    new_member_ids = list(set(request.user_ids))  # Remove duplicates
    existing_participants = set(conversation.participants)
    
    # Filter out already existing members
    new_member_ids = [uid for uid in new_member_ids if uid not in existing_participants]
    
    if not new_member_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All users are already members of this group"
        )
    
    # Validate all new members exist and are in same company
    new_members = []
    for user_id in new_member_ids:
        user = await User.get(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {user_id} not found"
            )
        if user.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User {user.full_name()} is not in the same company"
            )
        new_members.append(user)
    
    # Add new members
    conversation.participants.extend(new_member_ids)
    conversation.updated_at = utc_now()
    await conversation.save()
    
    # Create system message about new members
    new_member_names = ", ".join([user.full_name() for user in new_members])
    system_message = ChatMessage(
        conversation_id=str(conversation.id),
        company_id=conversation.company_id,
        sender_id=str(current_user.id),
        sender_name=current_user.full_name(),
        sender_role=current_user.role.value,
        message_type=MessageType.TEXT,
        content=f"{current_user.full_name()} added {new_member_names} to the group",
    )
    await system_message.save()
    
    # Update conversation
    conversation.last_message = system_message.content
    conversation.last_message_at = utc_now()
    conversation.last_message_by = str(current_user.id)
    
    # Initialize unread count for new members
    for user_id in new_member_ids:
        if user_id not in conversation.unread_count:
            conversation.unread_count[user_id] = 0
    
    await conversation.save()
    
    # Get added members info
    added_members_info = []
    for member in new_members:
        added_members_info.append({
            "id": str(member.id),
            "name": member.full_name(),
            "email": member.email,
            "role": member.role.value,
            "avatar": member.avatar,
        })
    
    return {
        "message": "Members added successfully",
        "added_members": added_members_info,
    }


@router.delete("/groups/{group_id}/members/{user_id}")
async def remove_member_from_group(
    group_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a member from a group (admins can remove anyone, users can leave themselves)"""
    conversation = await Conversation.get(group_id)
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    if not conversation.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is not a group conversation"
        )
    
    check_company_access(current_user, conversation.company_id)
    
    # Check if user is a participant
    if str(current_user.id) not in conversation.participants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group"
        )
    
    # Check if target user is a member
    if user_id not in conversation.participants:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this group"
        )
    
    # Get target user info
    target_user = await User.get(user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check permissions
    is_admin = str(current_user.id) in conversation.group_admins
    is_company_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    is_self = str(current_user.id) == user_id
    
    if not (is_admin or is_company_admin or is_self):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only remove yourself or be an admin to remove others"
        )
    
    # Prevent removing the last admin
    if user_id in conversation.group_admins and len(conversation.group_admins) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last admin from the group"
        )
    
    # Remove member
    conversation.participants.remove(user_id)
    if user_id in conversation.group_admins:
        conversation.group_admins.remove(user_id)
    
    conversation.updated_at = utc_now()
    await conversation.save()
    
    # Create system message
    if is_self:
        action_text = f"{current_user.full_name()} left the group"
    else:
        action_text = f"{current_user.full_name()} removed {target_user.full_name()} from the group"
    
    system_message = ChatMessage(
        conversation_id=str(conversation.id),
        company_id=conversation.company_id,
        sender_id=str(current_user.id),
        sender_name=current_user.full_name(),
        sender_role=current_user.role.value,
        message_type=MessageType.TEXT,
        content=action_text,
    )
    await system_message.save()
    
    # Update conversation
    conversation.last_message = system_message.content
    conversation.last_message_at = utc_now()
    conversation.last_message_by = str(current_user.id)
    
    # Remove unread count for removed user
    if user_id in conversation.unread_count:
        del conversation.unread_count[user_id]
    
    await conversation.save()
    
    return {
        "message": "Member removed successfully",
        "removed_user": {
            "id": str(target_user.id),
            "name": target_user.full_name(),
        },
    }


@router.post("/groups/{group_id}/admins/{user_id}")
async def add_group_admin(
    group_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
):
    """Add a group admin (only existing admins or company admins can do this)"""
    conversation = await Conversation.get(group_id)
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    if not conversation.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is not a group conversation"
        )
    
    check_company_access(current_user, conversation.company_id)
    
    # Check if user is admin or company admin
    is_admin = str(current_user.id) in conversation.group_admins
    is_company_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    
    if not (is_admin or is_company_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins or company admins can add admins"
        )
    
    # Check if target user is a member
    if user_id not in conversation.participants:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this group"
        )
    
    # Check if already admin
    if user_id in conversation.group_admins:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already an admin"
        )
    
    # Get target user
    target_user = await User.get(user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Add as admin
    conversation.group_admins.append(user_id)
    conversation.updated_at = utc_now()
    await conversation.save()
    
    # Create system message
    system_message = ChatMessage(
        conversation_id=str(conversation.id),
        company_id=conversation.company_id,
        sender_id=str(current_user.id),
        sender_name=current_user.full_name(),
        sender_role=current_user.role.value,
        message_type=MessageType.TEXT,
        content=f"{current_user.full_name()} made {target_user.full_name()} an admin",
    )
    await system_message.save()
    
    # Update conversation
    conversation.last_message = system_message.content
    conversation.last_message_at = utc_now()
    conversation.last_message_by = str(current_user.id)
    await conversation.save()
    
    return {
        "message": "Admin added successfully",
        "admin": {
            "id": str(target_user.id),
            "name": target_user.full_name(),
        },
    }


@router.delete("/groups/{group_id}/admins/{user_id}")
async def remove_group_admin(
    group_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a group admin (only company admins or the admin themselves can do this)"""
    conversation = await Conversation.get(group_id)
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    if not conversation.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is not a group conversation"
        )
    
    check_company_access(current_user, conversation.company_id)
    
    # Check if target user is an admin
    if user_id not in conversation.group_admins:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an admin"
        )
    
    # Check permissions
    is_company_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    is_self = str(current_user.id) == user_id
    
    if not (is_company_admin or is_self):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only company admins can remove other admins, or you can remove yourself"
        )
    
    # Prevent removing the last admin
    if len(conversation.group_admins) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last admin from the group"
        )
    
    # Get target user
    target_user = await User.get(user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Remove admin
    conversation.group_admins.remove(user_id)
    conversation.updated_at = utc_now()
    await conversation.save()
    
    # Create system message
    if is_self:
        action_text = f"{current_user.full_name()} removed themselves as admin"
    else:
        action_text = f"{current_user.full_name()} removed {target_user.full_name()} as admin"
    
    system_message = ChatMessage(
        conversation_id=str(conversation.id),
        company_id=conversation.company_id,
        sender_id=str(current_user.id),
        sender_name=current_user.full_name(),
        sender_role=current_user.role.value,
        message_type=MessageType.TEXT,
        content=action_text,
    )
    await system_message.save()
    
    # Update conversation
    conversation.last_message = system_message.content
    conversation.last_message_at = utc_now()
    conversation.last_message_by = str(current_user.id)
    await conversation.save()
    
    return {
        "message": "Admin removed successfully",
        "removed_admin": {
            "id": str(target_user.id),
            "name": target_user.full_name(),
        },
    }


