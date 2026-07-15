"""
Invoice Management Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging

from app.finance.models import Invoice, InvoiceType, InvoiceStatus
from app.crm.models import Client
from app.models.company import Company
from app.models.user import User, UserRole
from app.api.dependencies import get_current_user, get_current_company_admin_or_lead, check_company_access
from app.core.config import settings
from app.services.invoice_pdf import generate_invoice_pdf

router = APIRouter()
logger = logging.getLogger(__name__)




def _invoice_public(invoice: Invoice) -> Dict[str, Any]:
    data = invoice.dict()
    data["id"] = str(invoice.id)
    return data


def _parse_payment_date(payment_date: Optional[str]) -> datetime:
    if not payment_date:
        return datetime.now()
    try:
        return datetime.fromisoformat(payment_date.replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(payment_date, "%Y-%m-%d")
        except Exception:
            return datetime.now()


async def _apply_invoice_payment(
    invoice: Invoice,
    amount: float,
    current_user: User,
    payment_method: str,
    reference_number: Optional[str] = None,
    notes: Optional[str] = None,
    payment_date: Optional[str] = None,
    gateway_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment amount must be greater than zero")

    payment_date_obj = _parse_payment_date(payment_date)
    payment_record = {
        "date": payment_date_obj.isoformat(),
        "amount": float(amount),
        "payment_method": payment_method,
        "reference_number": reference_number,
        "notes": notes,
        "received_by": str(current_user.id),
        "received_by_name": current_user.full_name(),
    }
    if gateway_payload:
        payment_record["gateway"] = gateway_payload

    invoice.payments = invoice.payments or []
    existing_refs = {p.get("reference_number") for p in invoice.payments if p.get("reference_number")}
    if reference_number and reference_number in existing_refs:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment reference already recorded for this invoice")

    invoice.payments.append(payment_record)
    invoice.total_received = sum(float(p.get("amount", 0) or 0) for p in invoice.payments)
    invoice_total = float(invoice.total_amount or 0)
    invoice_tds = float(invoice.tds_amount or 0)
    invoice.outstanding_amount = max(invoice_total - invoice.total_received - invoice_tds, 0)
    invoice.status = InvoiceStatus.PAID if invoice.outstanding_amount <= 0 else InvoiceStatus.SENT
    invoice.updated_at = datetime.now()
    await invoice.save()

    return {
        "message": "Payment recorded successfully",
        "payment": payment_record,
        "invoice": _invoice_public(invoice),
    }


async def _get_invoice_for_user(invoice_id: str, current_user: User) -> Invoice:
    try:
        invoice = await Invoice.get(invoice_id)
    except Exception:
        invoice = None

    if not invoice:
        query = {"invoice_number": invoice_id}
        if current_user.role != UserRole.SUPER_ADMIN and current_user.company_id:
            query["company_id"] = str(current_user.company_id)
        invoice = await Invoice.find_one(query)

    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    check_company_access(current_user, invoice.company_id)
    return invoice

async def generate_invoice_number_async(company_id: str) -> str:
    """Generate unique invoice number: INV-YYYY-XXXX (async version)"""
    year = datetime.now().year
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
    invoice_date_obj = datetime.now()
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
        "invoices": [_invoice_public(invoice) for invoice in invoices],
        "total": total,
        "skip": skip,
        "limit": limit,
    }



@router.post("/seed-demo")
async def seed_demo_invoices(
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create realistic local demo clients and invoices for testing invoice generation."""
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")

    company_id = str(current_user.company_id)
    demo_clients = [
        {
            "name": "Aarav Mehta",
            "email": "accounts@northstarretail.example",
            "contact": "+91 98765 12001",
            "company_name": "Northstar Retail Pvt Ltd",
            "address": "8th Floor, Orion Business Park, Baner Road",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "zip_code": "411045",
            "industry": "Retail",
        },
        {
            "name": "Priya Nair",
            "email": "finance@greenwavefoods.example",
            "contact": "+91 98765 12002",
            "company_name": "GreenWave Foods LLP",
            "address": "22 Residency Avenue, Indiranagar",
            "city": "Bengaluru",
            "state": "Karnataka",
            "country": "India",
            "zip_code": "560038",
            "industry": "FMCG",
        },
    ]

    clients: List[Client] = []
    for data in demo_clients:
        client = await Client.find_one(Client.company_id == company_id, Client.email == data["email"])
        if not client:
            client = Client(company_id=company_id, created_by=str(current_user.id), **data)
            await client.insert()
        clients.append(client)

    existing_demo = await Invoice.find_one({"company_id": company_id, "notes": {"$regex": "LOCAL DEMO INVOICE"}})
    if existing_demo:
        return {"message": "Demo invoices already exist", "created": 0}

    templates = [
        {
            "client": clients[0],
            "invoice_type": InvoiceType.TAX,
            "include_tax": True,
            "days_offset": -7,
            "due_days": 15,
            "status": InvoiceStatus.SENT,
            "items": [
                {"description": "CRM onboarding and workflow setup", "quantity": 1, "unit_price": 45000, "tax_rate": 18},
                {"description": "Sales pipeline automation configuration", "quantity": 1, "unit_price": 28000, "tax_rate": 18},
            ],
        },
        {
            "client": clients[1],
            "invoice_type": InvoiceType.TAX,
            "include_tax": True,
            "days_offset": -2,
            "due_days": 10,
            "status": InvoiceStatus.PAID,
            "items": [
                {"description": "Monthly task management platform subscription", "quantity": 1, "unit_price": 32000, "tax_rate": 18},
                {"description": "Content calendar implementation support", "quantity": 2, "unit_price": 8500, "tax_rate": 18},
            ],
        },
    ]

    created = 0
    for template in templates:
        client = template["client"]
        items = []
        subtotal = 0.0
        tax_amount = 0.0
        for item in template["items"]:
            quantity = float(item["quantity"])
            unit_price = float(item["unit_price"])
            amount = quantity * unit_price
            item_tax = amount * (float(item.get("tax_rate", 0)) / 100)
            items.append({**item, "amount": amount, "tax_amount": item_tax})
            subtotal += amount
            tax_amount += item_tax
        total_amount = subtotal + tax_amount
        invoice = Invoice(
            invoice_number=await generate_invoice_number_async(company_id),
            company_id=company_id,
            invoice_type=template["invoice_type"],
            include_tax=template["include_tax"],
            client_id=str(client.id),
            client_name=client.name,
            client_email=client.email,
            client_contact=client.contact,
            client_address=client.address,
            client_city=client.city,
            client_state=client.state,
            client_country=client.country,
            client_zip_code=client.zip_code,
            client_company_name=client.company_name,
            invoice_date=datetime.now() + timedelta(days=template["days_offset"]),
            due_date=datetime.now() + timedelta(days=template["due_days"]),
            items=items,
            subtotal=subtotal,
            tax_rate=18,
            tax_amount=tax_amount,
            total_amount=total_amount,
            total_received=total_amount if template["status"] == InvoiceStatus.PAID else 0.0,
            tds_amount=0.0,
            outstanding_amount=0.0 if template["status"] == InvoiceStatus.PAID else total_amount,
            status=template["status"],
            notes="LOCAL DEMO INVOICE - seeded for invoice workflow testing only.",
            terms_and_conditions="Payment due as per due date. Late payments may pause active services.",
            created_by=str(current_user.id),
        )
        if template["status"] == InvoiceStatus.PAID:
            invoice.payments = [{
                "date": datetime.now().isoformat(),
                "amount": total_amount,
                "payment_method": "demo_payment",
                "reference_number": f"DEMO-{invoice.invoice_number}",
                "notes": "Seeded demo payment",
                "received_by": str(current_user.id),
                "received_by_name": current_user.full_name(),
            }]
        await invoice.insert()
        created += 1

    return {"message": "Demo invoices seeded successfully", "created": created}


@router.post("/{invoice_id}/record-payment")
async def record_invoice_payment(
    invoice_id: str,
    amount: float = Form(...),
    payment_date: Optional[str] = Form(None),
    payment_method: Optional[str] = Form("manual"),
    reference_number: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Record a real/manual payment against an invoice and update paid/outstanding status."""
    invoice = await _get_invoice_for_user(invoice_id, current_user)
    return await _apply_invoice_payment(
        invoice=invoice,
        amount=amount,
        current_user=current_user,
        payment_method=payment_method or "manual",
        reference_number=reference_number,
        notes=notes,
        payment_date=payment_date,
    )


@router.post("/{invoice_id}/razorpay/order")
async def create_invoice_razorpay_order(
    invoice_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a Razorpay order for the current outstanding invoice amount when enabled."""
    if not settings.RAZORPAY_INVOICE_PAYMENTS_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Razorpay invoice payments are disabled")
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Razorpay credentials are not configured")

    invoice = await _get_invoice_for_user(invoice_id, current_user)
    amount = max(float(invoice.outstanding_amount or invoice.total_amount or 0), 0)
    if amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invoice has no outstanding amount")

    try:
        import razorpay
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        receipt = f"inv_{invoice.invoice_number}"[:40]
        order = client.order.create({
            "amount": int(round(amount * 100)),
            "currency": invoice.currency or "INR",
            "receipt": receipt,
            "notes": {
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "company_id": invoice.company_id,
            },
            "payment_capture": 1,
        })
    except Exception as exc:
        logger.error(f"Razorpay order creation failed: {exc}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to create Razorpay order: {exc}")

    return {
        "enabled": True,
        "key_id": settings.RAZORPAY_KEY_ID,
        "order_id": order.get("id"),
        "amount": amount,
        "amount_paise": order.get("amount"),
        "currency": order.get("currency", invoice.currency or "INR"),
        "invoice": _invoice_public(invoice),
    }


@router.post("/{invoice_id}/razorpay/confirm")
async def confirm_invoice_razorpay_payment(
    invoice_id: str,
    order_id: str = Form(...),
    payment_id: str = Form(...),
    signature: str = Form(...),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Verify Razorpay payment signature and record payment on the invoice."""
    if not settings.RAZORPAY_INVOICE_PAYMENTS_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Razorpay invoice payments are disabled")
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Razorpay credentials are not configured")

    invoice = await _get_invoice_for_user(invoice_id, current_user)
    try:
        import razorpay
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        payment = client.payment.fetch(payment_id)
        paid_amount = float(payment.get("amount", 0)) / 100
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Razorpay payment signature")
    except Exception as exc:
        logger.error(f"Razorpay payment confirmation failed: {exc}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to confirm Razorpay payment: {exc}")

    return await _apply_invoice_payment(
        invoice=invoice,
        amount=paid_amount,
        current_user=current_user,
        payment_method="razorpay",
        reference_number=payment_id,
        notes=f"Razorpay order {order_id}",
        gateway_payload={"provider": "razorpay", "order_id": order_id, "payment_id": payment_id},
    )

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
    
    return _invoice_public(invoice)


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
    invoice.updated_at = datetime.now()
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
    
    from app.worker.tasks.email_tasks import send_invoice_email_task

    invoice_dict = jsonable_encoder(invoice)
    send_invoice_email_task.delay(invoice_dict, invoice.client_email, invoice.client_name)

    invoice.email_sent = True
    invoice.email_sent_at = datetime.now()
    invoice.email_sent_to = invoice.client_email
    invoice.status = InvoiceStatus.SENT
    invoice.updated_at = datetime.now()
    await invoice.save()

    return {
        "message": "Invoice email queued successfully",
        "sent_to": invoice.client_email,
    }


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

