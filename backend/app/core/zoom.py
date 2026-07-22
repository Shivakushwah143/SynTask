"""
Zoom API Integration Service
"""
import base64
import time
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

import httpx

from app.core.config import settings
from app.core.clock import utc_now

logger = logging.getLogger(__name__)


class ZoomService:
    """Service for interacting with Zoom API"""
    
    def __init__(self):
        self.api_key = settings.ZOOM_API_KEY_COMPUTED
        self.api_secret = settings.ZOOM_API_SECRET_COMPUTED
        self.account_id = settings.ZOOM_ACCOUNT_ID
        self.base_url = "https://api.zoom.us/v2"
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
    
    async def _get_access_token(self) -> str:
        """Get OAuth access token for Zoom API"""
        # If we have a valid token, return it
        if self.access_token and self.token_expires_at and utc_now() < self.token_expires_at:
            return self.access_token
        
        # Generate new token
        if not self.api_key or not self.api_secret:
            raise ValueError("Zoom API credentials not configured")
        
        # For JWT-based authentication (deprecated but simpler for now)
        # In production, use Server-to-Server OAuth with account_id
        if self.account_id:
            # Server-to-Server OAuth
            url = f"https://zoom.us/oauth/token?grant_type=account_credentials&account_id={self.account_id}"
            auth_string = f"{self.api_key}:{self.api_secret}"
            auth_bytes = auth_string.encode('ascii')
            auth_b64 = base64.b64encode(auth_bytes).decode('ascii')
            
            headers = {
                "Authorization": f"Basic {auth_b64}",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                self.access_token = data.get("access_token")
                expires_in = data.get("expires_in", 3600)
                self.token_expires_at = utc_now() + timedelta(seconds=expires_in - 60)  # 1 min buffer
                return self.access_token
            except Exception as e:
                logger.error(f"Failed to get Zoom access token: {str(e)}")
                raise
        else:
            # Fallback: JWT token (deprecated but works)
            try:
                import jwt
                payload = {
                    "iss": self.api_key,
                    "exp": int(time.time()) + 3600
                }
                token = jwt.encode(payload, self.api_secret, algorithm="HS256")
                self.access_token = token
                self.token_expires_at = utc_now() + timedelta(seconds=3540)  # 59 minutes
                return self.access_token
            except ImportError:
                raise ValueError("PyJWT is required for JWT-based Zoom authentication. Install it with: pip install PyJWT")
    
    async def create_meeting(
        self,
        topic: str,
        start_time: datetime,
        duration: int,
        host_email: Optional[str] = None,
        password: Optional[str] = None,
        host_video: bool = True,
        participant_video: bool = True,
        timezone: str = "UTC"
    ) -> Dict[str, Any]:
        """Create a Zoom meeting"""
        token = await self._get_access_token()
        
        # For Server-to-Server OAuth, use "me" endpoint instead of specific user email
        # "me" refers to the account owner or first admin user in the Zoom account
        url = f"{self.base_url}/users/me/meetings"
        logger.info(f"Creating Zoom meeting using 'me' endpoint (Server-to-Server OAuth)")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Format start time for Zoom (ISO 8601 format)
        start_time_str = start_time.strftime("%Y-%m-%dT%H:%M:%S")
        
        payload = {
            "topic": topic,
            "type": 2,  # Scheduled meeting
            "start_time": start_time_str,
            "duration": duration,
            "timezone": timezone,
            "password": password or self._generate_password(),
            "settings": {
                "host_video": host_video,
                "participant_video": participant_video,
                "join_before_host": False,
                "mute_upon_entry": False,
                "waiting_room": False,
                "approval_type": 0,  # Automatically approve
                "audio": "both",  # Both telephony and VoIP
                "auto_recording": "none"
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            meeting_data = response.json()
            
            return {
                "zoom_meeting_id": str(meeting_data.get("id")),
                "zoom_meeting_url": meeting_data.get("join_url"),
                "zoom_start_url": meeting_data.get("start_url"),
                "zoom_password": meeting_data.get("password"),
                "zoom_topic": meeting_data.get("topic"),
                "zoom_start_time": meeting_data.get("start_time"),
                "zoom_duration": meeting_data.get("duration")
            }
        except httpx.HTTPStatusError as e:
            logger.error(f"Zoom API error: {e.response.text if e.response else str(e)}")
            raise Exception(f"Failed to create Zoom meeting: {e.response.text if e.response else str(e)}")
        except Exception as e:
            logger.error(f"Error creating Zoom meeting: {str(e)}")
            raise
    
    def _generate_password(self) -> str:
        """Generate a random meeting password"""
        import random
        import string
        return ''.join(random.choices(string.digits, k=6))
    
    async def delete_meeting(self, meeting_id: str, host_email: Optional[str] = None) -> bool:
        """Delete a Zoom meeting"""
        token = await self._get_access_token()
        
        if not host_email:
            raise ValueError("host_email is required for Zoom meeting deletion")
        
        url = f"{self.base_url}/meetings/{meeting_id}"
        
        headers = {
            "Authorization": f"Bearer {token}",
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.delete(url, headers=headers)
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Error deleting Zoom meeting: {str(e)}")
            return False


