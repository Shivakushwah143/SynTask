"""
Ledger Management Endpoints - Track payments and outstanding amounts
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Query
from typing import Optional
from datetime import datetime, timedelta
from bson import ObjectId
import logging

from app.finance.models import Invoice, InvoiceStatus
from app.models.user import User, UserRole
from app.api.dependencies import get_current_user, get_current_company_admin_or_lead, check_company_access
from app.core.clock import utc_now

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("")
async def get_ledger(
    invoice_id: Optional[str] = Query(None),
    client_name: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Get ledger data with summary and invoice list"""
    try:
        # Super Admin can see all invoices, others only their company
        if current_user.role == UserRole.SUPER_ADMIN:
            query = {}
        else:
            if not current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User must belong to a company"
                )
            query = {"company_id": current_user.company_id}
        
        if invoice_id:
            query["invoice_number"] = {"$regex": invoice_id, "$options": "i"}
        
        if client_name:
            query["client_name"] = {"$regex": client_name, "$options": "i"}
        
        if status_filter:
            try:
                query["status"] = InvoiceStatus(status_filter)
            except ValueError:
                pass
        
        # Get all invoices matching the query
        invoices = await Invoice.find(query).sort(-Invoice.invoice_date).to_list()
        
        # Calculate summary
        total_invoiced = sum(inv.total_amount for inv in invoices)
        total_received = sum(inv.total_received for inv in invoices)
        total_tds = sum(inv.tds_amount for inv in invoices)
        total_outstanding = sum(inv.outstanding_amount for inv in invoices)
        
        # Apply pagination
        paginated_invoices = invoices[skip:skip + limit]
        
        # Format invoice data for response
        invoice_list = []
        for inv in paginated_invoices:
            # Calculate days passed
            days_passed = (utc_now() - inv.invoice_date).days if inv.invoice_date else 0
            
            invoice_list.append({
                "id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "invoice_id": inv.invoice_number,  # For compatibility
                "client_name": inv.client_name,
                "client_id": inv.client_id,
                "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
                "invoice_date_formatted": inv.invoice_date.strftime("%d/%m/%Y") if inv.invoice_date else "",
                "days_passed": days_passed,
                "total_amount": inv.total_amount,
                "total_received": inv.total_received,
                "outstanding_amount": inv.outstanding_amount,
                "tds_amount": inv.tds_amount,
                "status": inv.status.value,
                "currency": getattr(inv, 'currency', 'INR'),
                "payments": inv.payments or [],
            })
        
        return {
            "summary": {
                "total_invoiced": total_invoiced,
                "total_received": total_received,
                "total_tds": total_tds,
                "total_outstanding": total_outstanding,
            },
            "invoices": invoice_list,
            "total": len(invoices),
            "skip": skip,
            "limit": limit,
        }
        
    except Exception as e:
        logger.error(f"Error getting ledger: {str(e)}")
        return {
            "summary": {
                "total_invoiced": 0,
                "total_received": 0,
                "total_tds": 0,
                "total_outstanding": 0,
            },
            "invoices": [],
            "total": 0,
            "skip": skip,
            "limit": limit,
        }


@router.post("/{invoice_id}/payment")
async def add_payment(
    invoice_id: str,
    amount: float = Form(...),
    payment_date: Optional[str] = Form(None),
    payment_method: Optional[str] = Form(None),
    reference_number: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Add a payment to an invoice"""
    try:
        # For non-super admins, restrict lookup to their own company to avoid cross-company access
        query = {"invoice_number": invoice_id}
        if current_user.role != UserRole.SUPER_ADMIN and current_user.company_id:
            query["company_id"] = str(current_user.company_id)

        invoice = await Invoice.find_one(query)
        if not invoice:
            # Fallback: try by ID
            try:
                invoice = await Invoice.get(invoice_id)
            except:
                invoice = None
        
        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invoice not found"
            )
        
        check_company_access(current_user, invoice.company_id)
        
        # Parse payment date
        payment_date_obj = utc_now()
        if payment_date:
            try:
                payment_date_obj = datetime.fromisoformat(payment_date.replace('Z', '+00:00'))
            except:
                try:
                    payment_date_obj = datetime.strptime(payment_date, '%Y-%m-%d')
                except:
                    pass
        
        # Add payment record
        payment_record = {
            "date": payment_date_obj.isoformat(),
            "amount": float(amount),
            "payment_method": payment_method or "cash",
            "reference_number": reference_number,
            "notes": notes,
            "received_by": str(current_user.id),
            "received_by_name": current_user.full_name(),
        }
        
        if not invoice.payments:
            invoice.payments = []
        invoice.payments.append(payment_record)
        
        # Update totals
        invoice.total_received = sum(p.get("amount", 0) for p in invoice.payments)
        invoice.outstanding_amount = invoice.total_amount - invoice.total_received - invoice.tds_amount
        
        # Update status
        if invoice.outstanding_amount <= 0:
            invoice.status = InvoiceStatus.PAID
        elif invoice.total_received > 0:
            invoice.status = InvoiceStatus.SENT  # Partially paid
        
        invoice.updated_at = utc_now()
        await invoice.save()
        
        return {
            "message": "Payment added successfully",
            "payment": payment_record,
            "invoice": {
                "id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "total_received": invoice.total_received,
                "outstanding_amount": invoice.outstanding_amount,
                "status": invoice.status.value,
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding payment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add payment: {str(e)}"
        )


@router.put("/{invoice_id}/tds")
async def update_tds(
    invoice_id: str,
    tds_amount: float = Form(...),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update TDS amount for an invoice"""
    try:
        # For non-super admins, restrict lookup to their own company
        query = {"invoice_number": invoice_id}
        if current_user.role != UserRole.SUPER_ADMIN and current_user.company_id:
            query["company_id"] = str(current_user.company_id)

        invoice = await Invoice.find_one(query)
        if not invoice:
            # Try by ID
            try:
                invoice = await Invoice.get(invoice_id)
            except:
                invoice = None
        
        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invoice not found"
            )
        
        check_company_access(current_user, invoice.company_id)
        
        # Update TDS
        invoice.tds_amount = float(tds_amount)
        invoice.outstanding_amount = invoice.total_amount - invoice.total_received - invoice.tds_amount
        
        # Update status
        if invoice.outstanding_amount <= 0:
            invoice.status = InvoiceStatus.PAID
        elif invoice.total_received > 0:
            invoice.status = InvoiceStatus.SENT
        
        invoice.updated_at = utc_now()
        await invoice.save()
        
        return {
            "message": "TDS updated successfully",
            "invoice": {
                "id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "tds_amount": invoice.tds_amount,
                "outstanding_amount": invoice.outstanding_amount,
                "status": invoice.status.value,
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating TDS: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update TDS: {str(e)}"
        )

