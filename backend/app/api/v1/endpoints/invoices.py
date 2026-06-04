"""
Invoice Management Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Query
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from app.models.invoice import Invoice, InvoiceType, InvoiceStatus
from app.models.client import Client
from app.models.company import Company
from app.models.user import User, UserRole
from app.api.dependencies import get_current_user, get_current_company_admin_or_lead, check_company_access
from app.services.invoice_pdf import generate_invoice_pdf

router = APIRouter()
logger = logging.getLogger(__name__)


async def generate_invoice_number_async(company_id: str) -> str:
    """Generate unique invoice number: INV-YYYY-XXXX (async version)"""
    year = datetime.utcnow().year
    prefix = f"INV-{year}-"
    
    # Find the highest number for this company this year
    last_invoice = await Invoice.find_one(
        {"company_id": company_id, "invoice_number": {"$regex": f"^{prefix}"}},
        sort=[("invoice_number", -1)]
    )
    
    if last_invoice:
        try:
            last_num = int(last_invoice.invoice_number.split("-")[-1])
            new_num = last_num + 1
        except:
            new_num = 1
    else:
        new_num = 1
    
    return f"{prefix}{new_num:04d}"


@router.post("/")
async def create_invoice(
    invoice_type: InvoiceType = Form(...),
    include_tax: bool = Form(False),
    client_id: str = Form(...),
    invoice_date: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    items: str = Form(...),  # JSON string of items array
    notes: Optional[str] = Form(None),
    terms_and_conditions: Optional[str] = Form(None),
    tax_rate: Optional[float] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a new invoice"""
    import json
    
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    
    # Get client
    try:
        client = await Client.get(client_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    check_company_access(current_user, client.company_id)
    
    # Parse items
    try:
        items_list = json.loads(items) if isinstance(items, str) else items
        if not isinstance(items_list, list):
            raise ValueError("Items must be a list")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid items format: {str(e)}"
        )
    
    # Generate invoice number
    invoice_number = await generate_invoice_number_async(str(current_user.company_id))
    
    # Calculate totals
    subtotal = 0.0
    for item in items_list:
        quantity = float(item.get("quantity", 1))
        unit_price = float(item.get("unit_price", 0))
        amount = quantity * unit_price
        item["amount"] = amount
        subtotal += amount
        
        # Calculate item tax if applicable
        if include_tax and item.get("tax_rate"):
            item_tax_rate = float(item.get("tax_rate", 0))
            item["tax_amount"] = amount * (item_tax_rate / 100)
    
    # Calculate overall tax
    tax_amount = 0.0
    if include_tax:
        if tax_rate:
            tax_amount = subtotal * (tax_rate / 100)
        else:
            # Sum individual item taxes
            tax_amount = sum(item.get("tax_amount", 0) for item in items_list)
    
    total_amount = subtotal + tax_amount
    
    # Parse dates
    invoice_date_obj = datetime.utcnow()
    if invoice_date:
        try:
            invoice_date_obj = datetime.fromisoformat(invoice_date.replace('Z', '+00:00'))
        except:
            pass
    
    due_date_obj = None
    if due_date:
        try:
            due_date_obj = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        except:
            pass
    
    # Create invoice
    invoice = Invoice(
        invoice_number=invoice_number,
        company_id=str(current_user.company_id),
        invoice_type=invoice_type,
        include_tax=include_tax,
        client_id=client_id,
        client_name=client.name,
        client_email=client.email,
        client_contact=client.contact,
        client_address=client.address,
        client_city=client.city,
        client_state=client.state,
        client_country=client.country,
        client_zip_code=client.zip_code,
        client_company_name=client.company_name,
        invoice_date=invoice_date_obj,
        due_date=due_date_obj,
        items=items_list,
        subtotal=subtotal,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        total_received=0.0,
        tds_amount=0.0,
        outstanding_amount=total_amount,  # Initially outstanding = total
        notes=notes,
        terms_and_conditions=terms_and_conditions,
        project_id=project_id,
        created_by=str(current_user.id),
    )
    
    await invoice.insert()
    
    return {
        "message": "Invoice created successfully",
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
    }


@router.get("/")
async def list_invoices(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    invoice_type: Optional[InvoiceType] = None,
    status: Optional[InvoiceStatus] = None,
    client_id: Optional[str] = None,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """List invoices"""
    # Super Admin can see all invoices, others need company_id
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
    else:
        if not current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company"
            )
        query = {"company_id": str(current_user.company_id)}
    
    if invoice_type:
        query["invoice_type"] = invoice_type.value
    if status:
        query["status"] = status.value
    if client_id:
        query["client_id"] = client_id
    
    invoices = await Invoice.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    total = await Invoice.find(query).count()
    
    return {
        "invoices": [invoice.dict() for invoice in invoices],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Get invoice details"""
    try:
        invoice = await Invoice.get(invoice_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found"
        )
    
    check_company_access(current_user, invoice.company_id)
    
    return invoice.dict()


@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_type: Optional[InvoiceType] = Form(None),
    include_tax: Optional[bool] = Form(None),
    invoice_date: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    items: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    terms_and_conditions: Optional[str] = Form(None),
    tax_rate: Optional[float] = Form(None),
    status: Optional[InvoiceStatus] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update invoice"""
    import json
    
    try:
        invoice = await Invoice.get(invoice_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found"
        )
    
    check_company_access(current_user, invoice.company_id)
    
    # Update fields
    if invoice_type is not None:
        invoice.invoice_type = invoice_type
    if include_tax is not None:
        invoice.include_tax = include_tax
    if invoice_date:
        try:
            invoice.invoice_date = datetime.fromisoformat(invoice_date.replace('Z', '+00:00'))
        except:
            pass
    if due_date:
        try:
            invoice.due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        except:
            pass
    if items:
        try:
            items_list = json.loads(items) if isinstance(items, str) else items
            invoice.items = items_list
            
            # Recalculate totals
            subtotal = sum(item.get("amount", 0) for item in items_list)
            tax_amount = 0.0
            if invoice.include_tax:
                if tax_rate:
                    tax_amount = subtotal * (tax_rate / 100)
                else:
                    tax_amount = sum(item.get("tax_amount", 0) for item in items_list)
            
            invoice.subtotal = subtotal
            invoice.tax_amount = tax_amount
            invoice.total_amount = subtotal + tax_amount
            # Recalculate outstanding amount
            invoice.outstanding_amount = invoice.total_amount - invoice.total_received - invoice.tds_amount
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid items format: {str(e)}"
            )
    if notes is not None:
        invoice.notes = notes
    if terms_and_conditions is not None:
        invoice.terms_and_conditions = terms_and_conditions
    if tax_rate is not None:
        invoice.tax_rate = tax_rate
    if status is not None:
        invoice.status = status
    
    # Ensure outstanding amount is up to date
    invoice.outstanding_amount = invoice.total_amount - invoice.total_received - invoice.tds_amount
    invoice.updated_at = datetime.utcnow()
    await invoice.save()
    
    return {"message": "Invoice updated successfully"}


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete invoice"""
    try:
        invoice = await Invoice.get(invoice_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found"
        )
    
    check_company_access(current_user, invoice.company_id)
    
    await invoice.delete()
    
    return {"message": "Invoice deleted successfully"}


@router.post("/{invoice_id}/send-email")
async def send_invoice_email(
    invoice_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Send invoice via email"""
    try:
        invoice = await Invoice.get(invoice_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found"
        )
    
    check_company_access(current_user, invoice.company_id)
    
    if not invoice.client_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client email not found"
        )
    
    # Send invoice email
    from app.core.email import send_invoice_email
    
    invoice_dict = invoice.dict()
    email_sent = await send_invoice_email(
        invoice_data=invoice_dict,
        client_email=invoice.client_email,
        client_name=invoice.client_name
    )
    
    if email_sent:
        invoice.email_sent = True
        invoice.email_sent_at = datetime.utcnow()
        invoice.email_sent_to = invoice.client_email
        invoice.status = InvoiceStatus.SENT
        invoice.updated_at = datetime.utcnow()
        await invoice.save()
        
        return {
            "message": "Invoice email sent successfully",
            "sent_to": invoice.client_email,
        }
    else:
        # Email sending failed but don't raise error - log it
        logger.error(f"Failed to send invoice email to {invoice.client_email}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send invoice email. Please check email configuration."
        )


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Download invoice as PDF"""
    try:
        invoice = await Invoice.get(invoice_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found"
        )

    check_company_access(current_user, invoice.company_id)

    company = await Company.get(invoice.company_id) if invoice.company_id else None
    client = await Client.get(invoice.client_id) if invoice.client_id else None

    pdf_bytes = generate_invoice_pdf(invoice, company, client)

    filename = f"{invoice.invoice_number or 'invoice'}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
