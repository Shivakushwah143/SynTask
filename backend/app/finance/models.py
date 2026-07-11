"""Finance-owned model facade.

Agreement aliases preserve existing MSA class, collection, routes, and payloads.
"""

from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.msa import MSA, MSAStatus

Agreement = MSA
AgreementStatus = MSAStatus

__all__ = ["Agreement", "AgreementStatus", "Invoice", "InvoiceStatus", "InvoiceType", "MSA", "MSAStatus"]
