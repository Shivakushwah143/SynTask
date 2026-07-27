"""
Master Service Agreement (MSA) Management Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, UploadFile, File, Query, Body
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
import logging
from pathlib import Path
import secrets

logger = logging.getLogger(__name__)

from app.finance.models import MSA, MSAStatus
from app.crm.models import Client
from app.models.company import Company
from app.models.user import User
from app.api.dependencies import (
    get_current_user,
    get_current_company_admin_or_lead,
    check_company_access,
)
from app.core.config import settings
from app.core.clock import utc_now
from app.services.file_service import FileService

router = APIRouter()

# Get upload directory
BACKEND_DIR = Path(__file__).resolve().parents[4]
MSA_UPLOAD_DIR = BACKEND_DIR / settings.UPLOAD_DIR / "msa"
MSA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def generate_msa_number(company_id: str) -> str:
    """Generate unique MSA number"""
    timestamp = utc_now().strftime("%Y%m%d")
    random_part = secrets.token_hex(4).upper()
    return f"MSA-{timestamp}-{random_part}"


def generate_signature_token() -> str:
    """Generate unique signature token for client access"""
    return secrets.token_urlsafe(32)


async def _upload_msa_file(file: UploadFile) -> dict:
    return await FileService.store_uploaded_file(
        file,
        upload_dir=MSA_UPLOAD_DIR,
        url_prefix="/api/v1/files/msa",
        scope="msa",
        sensitive=True,
    )


@router.post("/")
async def create_msa(
    client_name: str = Form(...),
    client_email: str = Form(...),
    agreement_title: Optional[str] = Form(None),
    content: str = Form(...),
    msa_type: str = Form("client"),
    effective_date: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    # Company details
    gst_cin: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    signer_name: Optional[str] = Form(None),
    signer_email: Optional[str] = Form(None),
    company_address: Optional[str] = Form(None),
    header_background_color: Optional[str] = Form(None),
    company_logo: Optional[UploadFile] = File(None),
    company_signature: Optional[UploadFile] = File(None),
    company_stamp: Optional[UploadFile] = File(None),
    send_immediately: Optional[str] = Form("false"),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a new MSA"""
    try:
        # Get company details
        company = await Company.get(current_user.company_id)
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found"
            )
        
        # Try to find existing client by email, or create a placeholder
        client_id = None
        try:
            existing_client = await Client.find_one({
                "email": client_email,
                "company_id": str(current_user.company_id)
            })
            if existing_client:
                client_id = str(existing_client.id)
        except:
            pass
        
        # Parse effective date
        effective_date_obj = None
        if effective_date:
            try:
                effective_date_obj = datetime.fromisoformat(effective_date.replace('Z', '+00:00'))
            except:
                try:
                    effective_date_obj = datetime.strptime(effective_date, '%Y-%m-%d')
                except:
                    pass
        
        # Generate MSA number
        msa_number = generate_msa_number(str(current_user.company_id))
        
        # Handle file uploads (MSA_UPLOAD_DIR is already defined at module level)
        
        company_logo_url = None
        company_logo_public_id = None
        company_signature_file_url = None
        company_signature_public_id = None
        stamp_image_url = None
        stamp_image_public_id = None
        
        if company_logo:
            stored = await _upload_msa_file(company_logo)
            company_logo_url = stored["file_url"]
            company_logo_public_id = stored.get("cloudinary_public_id")
        
        if company_signature:
            stored = await _upload_msa_file(company_signature)
            company_signature_file_url = stored["file_url"]
            company_signature_public_id = stored.get("cloudinary_public_id")
        
        if company_stamp:
            stored = await _upload_msa_file(company_stamp)
            stamp_image_url = stored["file_url"]
            stamp_image_public_id = stored.get("cloudinary_public_id")
        
        # Create MSA
        msa = MSA(
            company_id=str(current_user.company_id),
            client_id=client_id or "temp",  # Temporary ID if client doesn't exist
            msa_number=msa_number,
            agreement_title=agreement_title,
            effective_date=effective_date_obj,
            company_name=company_name or company.name,
            company_address=company_address or company.address,
            company_city=company.city,
            company_state=company.state,
            company_country=company.country,
            company_zip_code=company.zip_code,
            company_cin=gst_cin or getattr(company, 'registration_number', None),
            company_logo_url=company_logo_url,
            company_logo_public_id=company_logo_public_id,
            header_background_color=header_background_color or "#1F2937",
            company_signatory_name=signer_name,
            company_signatory_email=signer_email,
            company_signature_file_url=company_signature_file_url,
            company_signature_public_id=company_signature_public_id,
            stamp_image_url=stamp_image_url,
            stamp_image_public_id=stamp_image_public_id,
            client_name=client_name,
            client_email=client_email,
            content=content or "",
            notes=notes,
            msa_type=msa_type,
            status=MSAStatus.DRAFT,
            created_by=str(current_user.id),
        )
        
        await msa.save()
        
        # If send_immediately is true, send the MSA
        should_send = send_immediately and send_immediately.lower() == "true"
        if should_send:
            # Generate signature token
            msa.signature_token = generate_signature_token()
            msa.signature_token_expires_at = utc_now() + timedelta(days=30)
            
            # Update status
            if company_signature_file_url or stamp_image_url:
                msa.status = MSAStatus.STAFFING_SIGNED
            else:
                msa.status = MSAStatus.SENT
            
            msa.sent_date = utc_now()
            
            from app.worker.tasks.email_tasks import send_msa_signature_email_task
            send_msa_signature_email_task.delay(str(msa.id), str(current_user.id))

            msa.email_sent = True
            msa.email_sent_at = utc_now()
            msa.email_sent_to = msa.client_email
            
            await msa.save()
        
        return {
            "message": "MSA created successfully" + (" and sent" if should_send else ""),
            "msa": {
                "id": str(msa.id),
                "msa_number": msa.msa_number,
                "client_id": str(msa.client_id),
                "client_name": msa.client_name,
                "status": msa.status.value,
                "created_at": msa.created_at,
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating MSA: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create MSA: {str(e)}"
        )


@router.get("")
async def list_msas(
    client_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    msa_type: Optional[str] = Query(None),
    is_template: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """List MSAs"""
    try:
        query = {"company_id": current_user.company_id}
        
        if client_id:
            query["client_id"] = client_id
        
        if status_filter:
            try:
                query["status"] = MSAStatus(status_filter)
            except ValueError:
                pass
        
        if msa_type:
            query["msa_type"] = msa_type
        
        if is_template is not None:
            query["is_template"] = is_template
        
        msas = await MSA.find(query).skip(skip).limit(limit).sort(-MSA.created_at).to_list()
        
        # Get client names for each MSA
        client_ids = list(set([str(m.client_id) for m in msas if m.client_id]))
        clients = {}
        if client_ids:
            # Filter out invalid ObjectIds (like "temp" or None)
            valid_client_ids = []
            for cid in client_ids:
                try:
                    # Try to convert to ObjectId - if it fails, skip it
                    ObjectId(cid)
                    valid_client_ids.append(cid)
                except:
                    # Skip invalid ObjectIds (like "temp" placeholder)
                    continue
            
            if valid_client_ids:
                client_list = await Client.find({"_id": {"$in": [ObjectId(cid) for cid in valid_client_ids]}}).to_list()
                clients = {str(c.id): c for c in client_list}
        
        result = []
        for msa in msas:
            client = clients.get(str(msa.client_id))
            result.append({
                "id": str(msa.id),
                "msa_number": msa.msa_number,
                "agreement_title": msa.agreement_title,
                "client_id": str(msa.client_id),
                "client_name": msa.client_name,
                "client_email": msa.client_email,
                "client_company_name": msa.client_company_name,
                "effective_date": msa.effective_date.isoformat() if msa.effective_date else None,
                "status": msa.status.value,
                "staffing_signed": bool(msa.staffing_company_signature),
                "client_signed": bool(msa.client_signature),
                "email_sent": msa.email_sent,
                "sent_date": msa.sent_date.isoformat() if msa.sent_date else None,
                "signed_date": msa.signed_date.isoformat() if msa.signed_date else (msa.completed_at.isoformat() if msa.completed_at else None),
                "msa_type": msa.msa_type,
                "is_template": msa.is_template,
                "template_name": msa.template_name,
                "created_at": msa.created_at.isoformat(),
                "updated_at": msa.updated_at.isoformat(),
            })
        
        return {
            "msas": result,
            "total": len(result),
            "skip": skip,
            "limit": limit
        }
        
    except Exception as e:
        logger.error(f"Error listing MSAs: {str(e)}")
        return {
            "msas": [],
            "total": 0,
            "skip": skip,
            "limit": limit,
        }


@router.get("/{msa_id}")
async def get_msa(
    msa_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Get MSA details"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        return {
            "id": str(msa.id),
            "msa_number": msa.msa_number,
            "company_id": str(msa.company_id),
            "client_id": str(msa.client_id),
            "effective_date": msa.effective_date.isoformat() if msa.effective_date else None,
            "company_name": msa.company_name,
            "company_address": msa.company_address,
            "company_city": msa.company_city,
            "company_state": msa.company_state,
            "company_country": msa.company_country,
            "company_zip_code": msa.company_zip_code,
            "company_cin": msa.company_cin,
            "client_name": msa.client_name,
            "client_company_name": msa.client_company_name,
            "client_address": msa.client_address,
            "client_city": msa.client_city,
            "client_state": msa.client_state,
            "client_country": msa.client_country,
            "client_zip_code": msa.client_zip_code,
            "client_identifier": msa.client_identifier,
            "client_email": msa.client_email,
            "client_contact": msa.client_contact,
            "content": msa.content,
            "staffing_company_signature": msa.staffing_company_signature,
            "client_signature": msa.client_signature,
            "stamp_image_url": msa.stamp_image_url,
            "status": msa.status.value,
            "email_sent": msa.email_sent,
            "email_sent_at": msa.email_sent_at.isoformat() if msa.email_sent_at else None,
            "email_sent_to": msa.email_sent_to,
            "signature_token": msa.signature_token,
            "notes": msa.notes,
            "created_at": msa.created_at.isoformat(),
            "updated_at": msa.updated_at.isoformat(),
            "completed_at": msa.completed_at.isoformat() if msa.completed_at else None,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting MSA: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get MSA: {str(e)}"
        )


@router.put("/{msa_id}")
async def update_msa(
    msa_id: str,
    effective_date: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update MSA"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        # Only allow updates if not completed
        if msa.status == MSAStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update completed MSA"
            )
        
        if effective_date is not None:
            try:
                msa.effective_date = datetime.fromisoformat(effective_date.replace('Z', '+00:00'))
            except:
                try:
                    msa.effective_date = datetime.strptime(effective_date, '%Y-%m-%d')
                except:
                    pass
        
        if content is not None:
            msa.content = content
        
        if notes is not None:
            msa.notes = notes
        
        msa.updated_at = utc_now()
        await msa.save()
        
        return {
            "message": "MSA updated successfully",
            "msa": {
                "id": str(msa.id),
                "msa_number": msa.msa_number,
                "status": msa.status.value,
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating MSA: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update MSA: {str(e)}"
        )


@router.delete("/{msa_id}")
async def delete_msa(
    msa_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete MSA"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        # Only allow deletion if draft or cancelled
        if msa.status not in [MSAStatus.DRAFT, MSAStatus.CANCELLED]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete MSA that has been sent or signed"
            )
        
        await msa.delete()
        
        return {"message": "MSA deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting MSA: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete MSA: {str(e)}"
        )


@router.post("/{msa_id}/stamp")
async def upload_stamp(
    msa_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Upload stamp image for MSA"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        # Validate file
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB"
            )
        
        # Validate file extension (images only)
        file_ext = Path(file.filename).suffix.lower()
        allowed_image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
        if file_ext not in allowed_image_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type not allowed. Allowed types: {', '.join(allowed_image_extensions)}"
            )
        
        await file.seek(0)
        stored = await _upload_msa_file(file)

        # Update MSA
        msa.stamp_image_url = stored["file_url"]
        msa.stamp_image_public_id = stored.get("cloudinary_public_id")
        msa.updated_at = utc_now()
        await msa.save()
        
        return {
            "message": "Stamp uploaded successfully",
            "stamp_url": msa.stamp_image_url,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading stamp: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload stamp: {str(e)}"
        )


@router.post("/{msa_id}/staffing-signature")
async def add_staffing_signature(
    msa_id: str,
    signature_image: str = Form(...),  # Base64 encoded image
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Add staffing company signature"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        # Save signature
        msa.staffing_company_signature = {
            "signature_image": signature_image,
            "signed_by": current_user.full_name(),
            "signed_by_id": str(current_user.id),
            "signed_at": utc_now().isoformat(),
        }
        
        # Update status
        if msa.client_signature:
            msa.status = MSAStatus.COMPLETED
            msa.completed_at = utc_now()
            msa.signed_date = utc_now()
        else:
            msa.status = MSAStatus.STAFFING_SIGNED
        
        msa.updated_at = utc_now()
        await msa.save()
        
        return {
            "message": "Signature added successfully",
            "status": msa.status.value,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding staffing signature: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add signature: {str(e)}"
        )


@router.post("/{msa_id}/send")
async def send_msa(
    msa_id: str,
    gst_cin: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    signer_name: Optional[str] = Form(None),
    signer_email: Optional[str] = Form(None),
    company_address: Optional[str] = Form(None),
    header_background_color: Optional[str] = Form(None),
    company_logo: Optional[UploadFile] = File(None),
    company_signature: Optional[UploadFile] = File(None),
    company_stamp: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Send MSA to client with header customization and signatory details"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        if not msa.client_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Client email is required to send MSA"
            )
        
        # Update company details if provided
        if gst_cin:
            msa.company_cin = gst_cin
        if company_name:
            msa.company_name = company_name
        if company_address:
            msa.company_address = company_address
        if header_background_color:
            msa.header_background_color = header_background_color
        if signer_name:
            msa.company_signatory_name = signer_name
        if signer_email:
            msa.company_signatory_email = signer_email
        
        # Handle file uploads
        if company_logo:
            stored = await _upload_msa_file(company_logo)
            msa.company_logo_url = stored["file_url"]
            msa.company_logo_public_id = stored.get("cloudinary_public_id")
        
        if company_signature:
            stored = await _upload_msa_file(company_signature)
            msa.company_signature_file_url = stored["file_url"]
            msa.company_signature_public_id = stored.get("cloudinary_public_id")
        
        if company_stamp:
            stored = await _upload_msa_file(company_stamp)
            msa.stamp_image_url = stored["file_url"]
            msa.stamp_image_public_id = stored.get("cloudinary_public_id")
        
        # Generate signature token
        msa.signature_token = generate_signature_token()
        msa.signature_token_expires_at = utc_now() + timedelta(days=30)
        
        # Update status and dates
        if msa.staffing_company_signature:
            msa.status = MSAStatus.STAFFING_SIGNED
        else:
            msa.status = MSAStatus.SENT
        msa.sent_date = utc_now()
        
        from app.worker.tasks.email_tasks import send_msa_signature_email_task
        send_msa_signature_email_task.delay(str(msa.id), str(current_user.id))

        email_sent = True
        msa.email_sent = True
        msa.email_sent_at = utc_now()
        msa.email_sent_to = msa.client_email
        msa.updated_at = utc_now()
        await msa.save()
        
        return {
            "message": "MSA sent successfully" if email_sent else "MSA prepared but email not sent (email not configured)",
            "signature_token": msa.signature_token,
            "email_sent": email_sent,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending MSA: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send MSA: {str(e)}"
        )


@router.post("/{msa_id}/save-as-template")
async def save_as_template(
    msa_id: str,
    template_name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Save MSA as template"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        # Create a copy as template
        template_msa = MSA(
            company_id=msa.company_id,
            client_id="template",
            msa_number=None,
            agreement_title=msa.agreement_title,
            content=msa.content,
            company_name=msa.company_name,
            company_address=msa.company_address,
            company_city=msa.company_city,
            company_state=msa.company_state,
            company_country=msa.company_country,
            company_zip_code=msa.company_zip_code,
            company_cin=msa.company_cin,
            company_logo_url=msa.company_logo_url,
            company_logo_public_id=msa.company_logo_public_id,
            header_background_color=msa.header_background_color,
            company_signatory_name=msa.company_signatory_name,
            company_signatory_email=msa.company_signatory_email,
            company_signature_file_url=msa.company_signature_file_url,
            company_signature_public_id=msa.company_signature_public_id,
            stamp_image_url=msa.stamp_image_url,
            stamp_image_public_id=msa.stamp_image_public_id,
            is_template=True,
            template_name=template_name or f"Template - {msa.agreement_title or 'Untitled'}",
            msa_type=msa.msa_type,
            status=MSAStatus.DRAFT,
            created_by=str(current_user.id),
        )
        
        await template_msa.save()
        
        return {
            "message": "Template saved successfully",
            "template_id": str(template_msa.id),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving template: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save template: {str(e)}"
        )


@router.get("/{msa_id}/download")
async def download_msa(
    msa_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Download MSA as PDF"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        # For now, return HTML content. PDF generation can be added later with libraries like weasyprint or reportlab
        from fastapi.responses import HTMLResponse
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>{msa.agreement_title or 'MSA'}</title>
            <style>
                body {{ font-family: Arial, sans-serif; padding: 40px; }}
                .header {{ background-color: {msa.header_background_color or '#1F2937'}; color: white; padding: 20px; margin-bottom: 30px; }}
                .content {{ white-space: pre-wrap; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{msa.agreement_title or 'Master Service Agreement'}</h1>
            </div>
            <div class="content">{msa.content}</div>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading MSA: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download MSA: {str(e)}"
        )


@router.post("/{msa_id}/send-for-signature")
async def send_for_signature(
    msa_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Send MSA to client for signature via email"""
    try:
        msa = await MSA.get(msa_id)
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found"
            )
        
        check_company_access(current_user, msa.company_id)
        
        if not msa.client_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Client email is required to send MSA"
            )
        
        # Generate signature token
        msa.signature_token = generate_signature_token()
        msa.signature_token_expires_at = utc_now() + timedelta(days=30)  # Token valid for 30 days
        
        # Update status
        if msa.staffing_company_signature or msa.company_signature_file_url or msa.stamp_image_url:
            msa.status = MSAStatus.STAFFING_SIGNED
        else:
            msa.status = MSAStatus.SENT
        
        msa.sent_date = utc_now()
        
        from app.worker.tasks.email_tasks import send_msa_signature_email_task
        send_msa_signature_email_task.delay(str(msa.id), str(current_user.id))

        email_sent = True
        msa.email_sent = True
        msa.email_sent_at = utc_now()
        msa.email_sent_to = msa.client_email
        msa.updated_at = utc_now()
        await msa.save()
        
        return {
            "message": "MSA sent for signature successfully" if email_sent else "MSA prepared but email not sent (email not configured)",
            "signature_token": msa.signature_token,
            "email_sent": email_sent,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending MSA for signature: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send MSA: {str(e)}"
        )


@router.get("/sign/{token}")
async def get_msa_by_token(token: str):
    """Get MSA by signature token (public endpoint for client)"""
    try:
        msa = await MSA.find_one({
            "signature_token": token,
            "signature_token_expires_at": {"$gt": utc_now()}
        })
        
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found or token expired"
            )
        
        return {
            "id": str(msa.id),
            "msa_number": msa.msa_number,
            "effective_date": msa.effective_date.isoformat() if msa.effective_date else None,
            "company_name": msa.company_name,
            "company_address": msa.company_address,
            "company_city": msa.company_city,
            "company_state": msa.company_state,
            "company_country": msa.company_country,
            "company_zip_code": msa.company_zip_code,
            "company_cin": msa.company_cin,
            "client_name": msa.client_name,
            "client_company_name": msa.client_company_name,
            "client_address": msa.client_address,
            "client_city": msa.client_city,
            "client_state": msa.client_state,
            "client_country": msa.client_country,
            "client_zip_code": msa.client_zip_code,
            "client_identifier": msa.client_identifier,
            "content": msa.content,
            "staffing_company_signature": msa.staffing_company_signature,
            "stamp_image_url": msa.stamp_image_url,
            "status": msa.status.value,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting MSA by token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get MSA: {str(e)}"
        )


@router.post("/sign/{token}")
async def client_sign_msa(
    token: str,
    signature_image: str = Form(...),  # Base64 encoded image or data URL
    client_name: Optional[str] = Form(None),
    client_stamp: Optional[UploadFile] = File(None),
):
    """Client signs MSA (public endpoint)"""
    try:
        msa = await MSA.find_one({
            "signature_token": token,
            "signature_token_expires_at": {"$gt": utc_now()}
        })
        
        if not msa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MSA not found or token expired"
            )
        
        if msa.status == MSAStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MSA already completed"
            )
        
        # Handle client stamp upload
        client_stamp_url = None
        if client_stamp:
            stored = await _upload_msa_file(client_stamp)
            client_stamp_url = stored["file_url"]
            msa.client_stamp_url = client_stamp_url
            msa.client_stamp_public_id = stored.get("cloudinary_public_id")
        
        # Save client signature
        msa.client_signature = {
            "signature_image": signature_image,
            "signed_by": client_name or msa.client_name,
            "signed_at": utc_now().isoformat(),
        }
        
        # Update status
        if msa.staffing_company_signature or msa.company_signature_file_url:
            msa.status = MSAStatus.COMPLETED
            msa.completed_at = utc_now()
            msa.signed_date = utc_now()
        else:
            msa.status = MSAStatus.CLIENT_SIGNED
        
        msa.updated_at = utc_now()
        await msa.save()
        
        from app.worker.tasks.email_tasks import (
            send_msa_signed_confirmation_email_task,
            send_msa_signed_copy_to_client_task,
        )
        if msa.company_id:
            send_msa_signed_confirmation_email_task.delay(str(msa.id))
        if msa.client_email:
            send_msa_signed_copy_to_client_task.delay(str(msa.id))
        
        return {
            "message": "MSA signed successfully. A signed copy has been emailed to you.",
            "status": msa.status.value,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error signing MSA: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sign MSA: {str(e)}"
        )
