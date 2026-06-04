"""
Email Service - Send emails using FastAPI-Mail
"""
from typing import Optional, Dict, Any, List
import logging
from datetime import datetime

from app.core.config import settings

logger = logging.getLogger(__name__)

# Try to import fastapi_mail, make it optional
try:
    from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
    FASTAPI_MAIL_AVAILABLE = True
except ImportError:
    FASTAPI_MAIL_AVAILABLE = False
    logger.warning("fastapi-mail not installed. Email functionality will be disabled.")
    FastMail = None
    MessageSchema = None
    ConnectionConfig = None

# Email configuration (only if fastapi_mail is available)
conf = None
if FASTAPI_MAIL_AVAILABLE:
    try:
        conf = ConnectionConfig(
            MAIL_USERNAME=settings.MAIL_USERNAME,
            MAIL_PASSWORD=settings.MAIL_PASSWORD,
            MAIL_FROM=settings.MAIL_FROM,
            MAIL_PORT=settings.MAIL_PORT,
            MAIL_SERVER=settings.MAIL_SERVER,
            MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
            MAIL_STARTTLS=settings.MAIL_TLS,
            MAIL_SSL_TLS=settings.MAIL_SSL,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
        )
    except Exception as e:
        logger.warning(f"Failed to configure email: {str(e)}")
        conf = None

# Check if email is configured
EMAIL_CONFIGURED = bool(
    FASTAPI_MAIL_AVAILABLE and 
    conf and 
    settings.MAIL_USERNAME and 
    settings.MAIL_PASSWORD and 
    settings.MAIL_SERVER
)


async def send_password_reset_email(email: str, reset_token: str, user_name: Optional[str] = None) -> bool:
    """
    Send password reset email with reset link
    
    Args:
        email: Recipient email address
        reset_token: Password reset token
        user_name: Optional user name for personalization
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    # Construct reset link - always use production URL
    frontend_url = getattr(settings, 'FRONTEND_URL', None)
    if not frontend_url or 'localhost' in frontend_url:
        frontend_url = "https://task.synzent.ai"
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    
    # Check if email is configured
    if not EMAIL_CONFIGURED:
        logger.warning(
            f"Email not configured. Password reset link for {email}: {reset_link}\n"
            f"To enable email sending, configure MAIL_USERNAME, MAIL_PASSWORD, and MAIL_SERVER in settings."
        )
        return False


    try:
        # Email subject
        subject = "Reset Your Password - SynTask"
        
        # Email body (HTML)
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #3b82f6;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    background-color: #f9fafb;
                    padding: 30px;
                    border-radius: 0 0 5px 5px;
                }}
                .button {{
                    display: inline-block;
                    padding: 12px 30px;
                    background-color: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    color: #666;
                }}
                .warning {{
                    background-color: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>SynTask</h1>
                </div>
                <div class="content">
                    <h2>Reset Your Password</h2>
                    <p>Hello{f' {user_name}' if user_name else ''},</p>
                    <p>We received a request to reset your password for your SynTask account. Click the button below to reset your password:</p>
                    
                    <div style="text-align: center;">
                        <a href="{reset_link}" class="button">Reset Password</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #3b82f6;">{reset_link}</p>
                    
                    <div class="warning">
                        <strong>Important:</strong>
                        <ul>
                            <li>This link will expire in 30 minutes</li>
                            <li>This link can only be used once</li>
                            <li>If you didn't request this, please ignore this email</li>
                        </ul>
                    </div>
                    
                    <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
                    
                    <p>Best regards,<br>The SynTask Team</p>
                </div>
                <div class="footer">
                    <p>© 2025 SynTask. All Rights Reserved.</p>
                    <p>This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
Reset Your Password - SynTask

Hello{f' {user_name}' if user_name else ''},

We received a request to reset your password for your SynTask account.

Please click the following link to reset your password:
{reset_link}

This link will expire in 30 minutes and can only be used once.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
The SynTask Team

© 2025 SynTask. All Rights Reserved.
        """
        
        
        # Check if email can be sent
        if not FASTAPI_MAIL_AVAILABLE or not conf:
            logger.warning(f"Email not available. Password reset link for {email}: {reset_link}")
            return False
        
        # Create message
        message = MessageSchema(
            subject=subject,
            recipients=[email],
            body=html_body,
            subtype="html",
        )
        
        # Send email
        fm = FastMail(conf)
        await fm.send_message(message)
        
        logger.info(f"Password reset email sent successfully to {email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send password reset email to {email}: {str(e)}")
        # Log the reset link as fallback
        logger.info(f"Password reset link for {email}: {reset_link}")
        return False


async def send_invoice_email(invoice_data: Dict[str, Any], client_email: str, client_name: str) -> bool:
    """
    Send invoice email to client
    
    Args:
        invoice_data: Invoice dictionary with all invoice details
        client_email: Recipient email address
        client_name: Client name for personalization
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    # Check if email is configured
    if not EMAIL_CONFIGURED:
        logger.warning(
            f"Email not configured. Invoice {invoice_data.get('invoice_number')} should be sent to {client_email}\n"
            f"To enable email sending, configure MAIL_USERNAME, MAIL_PASSWORD, and MAIL_SERVER in settings."
        )
        return False
    
    try:
        # Format dates
        from datetime import datetime
        
        invoice_date = ""
        if invoice_data.get('invoice_date'):
            try:
                date_value = invoice_data['invoice_date']
                if isinstance(date_value, str):
                    # Try parsing ISO format
                    if 'T' in date_value:
                        date_obj = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                    else:
                        # Try simple date format
                        date_obj = datetime.strptime(date_value, '%Y-%m-%d')
                elif isinstance(date_value, datetime):
                    date_obj = date_value
                else:
                    date_obj = date_value
                
                if isinstance(date_obj, datetime):
                    invoice_date = date_obj.strftime('%B %d, %Y')
                else:
                    invoice_date = str(date_value)
            except Exception as e:
                logger.warning(f"Error formatting invoice date: {e}")
                invoice_date = str(invoice_data.get('invoice_date', ''))
        
        due_date = ""
        if invoice_data.get('due_date'):
            try:
                date_value = invoice_data['due_date']
                if isinstance(date_value, str):
                    # Try parsing ISO format
                    if 'T' in date_value:
                        date_obj = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                    else:
                        # Try simple date format
                        date_obj = datetime.strptime(date_value, '%Y-%m-%d')
                elif isinstance(date_value, datetime):
                    date_obj = date_value
                else:
                    date_obj = date_value
                
                if isinstance(date_obj, datetime):
                    due_date = date_obj.strftime('%B %d, %Y')
                else:
                    due_date = str(date_value)
            except Exception as e:
                logger.warning(f"Error formatting due date: {e}")
                due_date = str(invoice_data.get('due_date', ''))
        
        # Currency symbol
        currency_symbol = "&#8377;"  # HTML entity for Indian Rupee symbol
        
        # Format currency amounts for display
        def format_currency(amount):
            return f"{currency_symbol}{amount:,.2f}"
        
        # Build items table HTML
        items_html = ""
        if invoice_data.get('items'):
            items_html = """
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead>
                    <tr style="background-color: #f3f4f6;">
                        <th style="padding: 12px; text-align: left; border: 1px solid #e5e7eb;">Description</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">Quantity</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">Unit Price</th>
            """
            if invoice_data.get('include_tax'):
                items_html += """
                        <th style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">Tax</th>
                """
            items_html += """
                        <th style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">Amount</th>
                    </tr>
                </thead>
                <tbody>
            """
            for item in invoice_data.get('items', []):
                quantity = item.get('quantity', 0)
                unit_price = item.get('unit_price', 0)
                amount = item.get('amount', quantity * unit_price)
                tax_rate = item.get('tax_rate', '')
                
                unit_price_formatted = format_currency(unit_price)
                amount_formatted = format_currency(amount)
                
                items_html += f"""
                    <tr>
                        <td style="padding: 12px; border: 1px solid #e5e7eb;">{item.get('description', '')}</td>
                        <td style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">{quantity}</td>
                        <td style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">{unit_price_formatted}</td>
                """
                if invoice_data.get('include_tax'):
                    items_html += f"""
                        <td style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">{tax_rate}%</td>
                    """
                items_html += f"""
                        <td style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">{amount_formatted}</td>
                    </tr>
                """
            items_html += """
                </tbody>
            </table>
            """
        
        # Email subject
        invoice_type_str = "Tax Invoice" if invoice_data.get('invoice_type') == 'tax' else "Proforma Invoice"
        subject = f"{invoice_type_str} - {invoice_data.get('invoice_number', 'Invoice')} - SynTask"
        
        # Format all currency amounts before using in HTML
        subtotal_formatted = format_currency(invoice_data.get('subtotal', 0))
        tax_amount_formatted = format_currency(invoice_data.get('tax_amount', 0))
        total_amount_formatted = format_currency(invoice_data.get('total_amount', 0))
        
        # Optional sections pre-rendered to avoid nested f-strings
        tax_section = ""
        if invoice_data.get('include_tax') and invoice_data.get('tax_amount', 0) > 0:
            tax_section = f"""
                        <div class="total-row">
                            <span>Tax ({invoice_data.get('tax_rate', 0)}%):</span>
                            <span>{tax_amount_formatted}</span>
                        </div>
                        """
        
        notes_section = ""
        if invoice_data.get('notes'):
            notes_section = f"""
                    <div class="invoice-details">
                        <h3>Notes:</h3>
                        <p>{invoice_data.get('notes', '')}</p>
                    </div>
                    """
        
        terms_section = ""
        if invoice_data.get('terms_and_conditions'):
            terms_section = f"""
                    <div class="invoice-details">
                        <h3>Terms & Conditions:</h3>
                        <p>{invoice_data.get('terms_and_conditions', '')}</p>
                    </div>
                    """
        
        # Email body (HTML)
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #3b82f6;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    background-color: #ffffff;
                    padding: 30px;
                    border: 1px solid #e5e7eb;
                }}
                .invoice-header {{
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #e5e7eb;
                }}
                .invoice-info {{
                    text-align: right;
                }}
                .invoice-details {{
                    margin: 20px 0;
                }}
                .totals {{
                    margin-top: 20px;
                    text-align: right;
                }}
                .total-row {{
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                }}
                .total-final {{
                    font-size: 18px;
                    font-weight: bold;
                    border-top: 2px solid #3b82f6;
                    padding-top: 10px;
                    margin-top: 10px;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    font-size: 12px;
                    color: #666;
                }}
                table {{
                    width: 100%;
                    border-collapse: collapse;
                }}
                th, td {{
                    padding: 12px;
                    border: 1px solid #e5e7eb;
                }}
                th {{
                    background-color: #f3f4f6;
                    text-align: left;
                }}
                .text-right {{
                    text-align: right;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>SynTask</h1>
                    <p style="margin: 0;">{invoice_type_str}</p>
                </div>
                <div class="content">
                    <div class="invoice-header">
                        <div>
                            <h2>Invoice Details</h2>
                            <p><strong>Invoice Number:</strong> {invoice_data.get('invoice_number', 'N/A')}</p>
                            <p><strong>Invoice Date:</strong> {invoice_date}</p>
                            {f'<p><strong>Due Date:</strong> {due_date}</p>' if due_date else ''}
                        </div>
                        <div class="invoice-info">
                            <h3>Bill To:</h3>
                            <p>{invoice_data.get('client_name', '')}</p>
                            {f"<p>{invoice_data.get('client_company_name', '')}</p>" if invoice_data.get('client_company_name') else ''}
                            {f"<p>{invoice_data.get('client_address', '')}</p>" if invoice_data.get('client_address') else ''}
                            {f"<p>{invoice_data.get('client_city', '')}, {invoice_data.get('client_state', '')} {invoice_data.get('client_zip_code', '')}</p>" if invoice_data.get('client_city') or invoice_data.get('client_state') else ''}
                        </div>
                    </div>
                    
                    {items_html}
                    
                    <div class="totals">
                        <div class="total-row">
                            <span>Subtotal:</span>
                            <span>{subtotal_formatted}</span>
                        </div>
                        {tax_section}
                        <div class="total-row total-final">
                            <span>Total Amount:</span>
                            <span>{total_amount_formatted}</span>
                        </div>
                    </div>
                    
                    {notes_section}
                    
                    {terms_section}
                    
                    <div class="footer">
                        <p>Thank you for your business!</p>
                        <p>If you have any questions regarding this invoice, please contact us.</p>
                        <p>© 2025 SynTask. All Rights Reserved.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version - use Rs. instead of ₹ for plain text
        text_body = f"""
{invoice_type_str} - {invoice_data.get('invoice_number', 'Invoice')}

Hello {client_name},

Please find attached your invoice details:

Invoice Number: {invoice_data.get('invoice_number', 'N/A')}
Invoice Date: {invoice_date}
{f'Due Date: {due_date}' if due_date else ''}

Items:
"""
        for item in invoice_data.get('items', []):
            text_body += f"- {item.get('description', '')} - Quantity: {item.get('quantity', 0)} - Unit Price: Rs.{item.get('unit_price', 0):,.2f} - Amount: Rs.{item.get('amount', 0):,.2f}\n"
        
        text_body += f"""
Subtotal: Rs.{invoice_data.get('subtotal', 0):,.2f}
"""
        if invoice_data.get('include_tax') and invoice_data.get('tax_amount', 0) > 0:
            text_body += f"Tax ({invoice_data.get('tax_rate', 0)}%): Rs.{invoice_data.get('tax_amount', 0):,.2f}\n"
        text_body += f"""
Total Amount: Rs.{invoice_data.get('total_amount', 0):,.2f}

{f'Notes: {invoice_data.get("notes", "")}' if invoice_data.get('notes') else ''}
{f'Terms & Conditions: {invoice_data.get("terms_and_conditions", "")}' if invoice_data.get('terms_and_conditions') else ''}

Thank you for your business!

Best regards,
SynTask Team
© 2025 SynTask. All Rights Reserved.
        """
        
        # Check if email can be sent
        if not FASTAPI_MAIL_AVAILABLE or not conf:
            logger.warning(f"Email not available. Invoice {invoice_data.get('invoice_number')} should be sent to {client_email}")
            return False
        
        # Create message
        message = MessageSchema(
            subject=subject,
            recipients=[client_email],
            body=html_body,
            subtype="html",
        )
        
        # Send email
        fm = FastMail(conf)
        await fm.send_message(message)
        
        logger.info(f"Invoice {invoice_data.get('invoice_number')} email sent successfully to {client_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send invoice email to {client_email}: {str(e)}")
        return False


async def send_msa_signature_email(msa, sender_user) -> bool:
    """
    Send MSA to client for signature via email
    
    Args:
        msa: MSA document object
        sender_user: User who is sending the MSA
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    # Check if email is configured
    if not EMAIL_CONFIGURED:
        logger.warning(
            f"Email not configured. MSA {msa.msa_number} should be sent to {msa.client_email}\n"
            f"To enable email sending, configure MAIL_USERNAME, MAIL_PASSWORD, and MAIL_SERVER in settings."
        )
        return False
    
    try:
        # Format effective date
        effective_date_str = ""
        if msa.effective_date:
            try:
                effective_date_str = msa.effective_date.strftime('%B %d, %Y')
            except:
                effective_date_str = str(msa.effective_date)
        
        # Get frontend URL for signature link - ALWAYS use production URL
        # Force production URL regardless of settings to prevent localhost issues
        frontend_url = "https://task.synzent.ai"
        signature_link = f"{frontend_url}/msa/sign/{msa.signature_token}"
        logger.info(f"MSA Email - Using production signature link: {signature_link}")
        
        # Email subject
        subject = f"Master Service Agreement (MSA) - {msa.msa_number} - Signature Required"
        
        # Email body (HTML)
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #3b82f6;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    background-color: #ffffff;
                    padding: 30px;
                    border: 1px solid #e5e7eb;
                }}
                .button {{
                    display: inline-block;
                    padding: 12px 30px;
                    background-color: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    color: #666;
                }}
                .info-box {{
                    background-color: #f3f4f6;
                    padding: 15px;
                    border-radius: 4px;
                    margin: 20px 0;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Master Service Agreement</h1>
                </div>
                <div class="content">
                    <h2>Signature Required</h2>
                    <p>Hello {msa.client_name},</p>
                    <p>You have received a Master Service Agreement (MSA) from <strong>{msa.company_name}</strong> for your review and signature.</p>
                    
                    <div class="info-box">
                        <p><strong>MSA Number:</strong> {msa.msa_number}</p>
                        {f'<p><strong>Effective Date:</strong> {effective_date_str}</p>' if effective_date_str else ''}
                        <p><strong>Status:</strong> Pending Your Signature</p>
                    </div>
                    
                    <p>Please review the agreement and click the button below to sign it electronically:</p>
                    
                    <div style="text-align: center;">
                        <a href="{signature_link}" class="button">Review & Sign MSA</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #3b82f6;">{signature_link}</p>
                    
                    <div class="info-box">
                        <strong>Important:</strong>
                        <ul>
                            <li>This link will expire in 30 days</li>
                            <li>Please review all terms and conditions before signing</li>
                            <li>If you have any questions, please contact {sender_user.full_name()}</li>
                        </ul>
                    </div>
                    
                    <p>Best regards,<br>{sender_user.full_name()}<br>{msa.company_name}</p>
                </div>
                <div class="footer">
                    <p>© 2025 SynTask. All Rights Reserved.</p>
                    <p>This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
Master Service Agreement - Signature Required

Hello {msa.client_name},

You have received a Master Service Agreement (MSA) from {msa.company_name} for your review and signature.

MSA Number: {msa.msa_number}
{f'Effective Date: {effective_date_str}' if effective_date_str else ''}
Status: Pending Your Signature

Please review the agreement and sign it electronically using the following link:
{signature_link}

This link will expire in 30 days. Please review all terms and conditions before signing.

If you have any questions, please contact {sender_user.full_name()}.

Best regards,
{sender_user.full_name()}
{msa.company_name}

© 2025 SynTask. All Rights Reserved.
        """
        
        # Check if email can be sent
        if not FASTAPI_MAIL_AVAILABLE or not conf:
            logger.warning(f"Email not available. MSA {msa.msa_number} should be sent to {msa.client_email}")
            return False
        
        # Create message
        message = MessageSchema(
            subject=subject,
            recipients=[msa.client_email],
            body=html_body,
            subtype="html",
        )
        
        # Send email
        fm = FastMail(conf)
        await fm.send_message(message)
        
        logger.info(f"MSA {msa.msa_number} signature request email sent successfully to {msa.client_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send MSA signature email to {msa.client_email}: {str(e)}")
        return False


async def send_msa_signed_confirmation_email(msa) -> bool:
    """
    Send confirmation email to company when client signs MSA
    
    Args:
        msa: MSA document object
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    # Check if email is configured
    if not EMAIL_CONFIGURED:
        logger.warning(
            f"Email not configured. MSA {msa.msa_number} signed confirmation should be sent to company.\n"
            f"To enable email sending, configure MAIL_USERNAME, MAIL_PASSWORD, and MAIL_SERVER in settings."
        )
        return False
    
    try:
        # Get company admin email
        from app.models.user import User, UserRole
        company_admins = await User.find({
            "company_id": msa.company_id,
            "role": UserRole.ADMIN
        }).to_list()
        
        if not company_admins:
            logger.warning(f"No company admin found for company {msa.company_id}")
            return False
        
        recipient_emails = [admin.email for admin in company_admins]
        
        # Format dates
        effective_date_str = ""
        if msa.effective_date:
            try:
                effective_date_str = msa.effective_date.strftime('%B %d, %Y')
            except:
                effective_date_str = str(msa.effective_date)
        
        completed_date_str = ""
        if msa.completed_at:
            try:
                completed_date_str = msa.completed_at.strftime('%B %d, %Y at %I:%M %p')
            except:
                completed_date_str = str(msa.completed_at)
        
        # Email subject
        subject = f"MSA {msa.msa_number} - Signed by Client"
        
        # Email body (HTML)
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #10b981;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    background-color: #ffffff;
                    padding: 30px;
                    border: 1px solid #e5e7eb;
                }}
                .success-box {{
                    background-color: #d1fae5;
                    padding: 15px;
                    border-radius: 4px;
                    margin: 20px 0;
                    border-left: 4px solid #10b981;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    color: #666;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>MSA Signed Successfully</h1>
                </div>
                <div class="content">
                    <div class="success-box">
                        <h2 style="margin-top: 0;">✓ MSA Completed</h2>
                        <p>The Master Service Agreement has been signed by the client.</p>
                    </div>
                    
                    <h3>MSA Details:</h3>
                    <p><strong>MSA Number:</strong> {msa.msa_number}</p>
                    <p><strong>Client:</strong> {msa.client_name}</p>
                    {f'<p><strong>Client Company:</strong> {msa.client_company_name}</p>' if msa.client_company_name else ''}
                    {f'<p><strong>Effective Date:</strong> {effective_date_str}</p>' if effective_date_str else ''}
                    <p><strong>Completed At:</strong> {completed_date_str}</p>
                    
                    <p>The MSA is now fully executed and both parties have signed.</p>
                    
                    <p>You can view the completed MSA in your admin panel.</p>
                </div>
                <div class="footer">
                    <p>© 2025 SynTask. All Rights Reserved.</p>
                    <p>This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
MSA Signed Successfully

The Master Service Agreement has been signed by the client.

MSA Number: {msa.msa_number}
Client: {msa.client_name}
{f'Client Company: {msa.client_company_name}' if msa.client_company_name else ''}
{f'Effective Date: {effective_date_str}' if effective_date_str else ''}
Completed At: {completed_date_str}

The MSA is now fully executed and both parties have signed.

You can view the completed MSA in your admin panel.

© 2025 SynTask. All Rights Reserved.
        """
        
        # Check if email can be sent
        if not FASTAPI_MAIL_AVAILABLE or not conf:
            logger.warning(f"Email not available. MSA {msa.msa_number} signed confirmation should be sent")
            return False
        
        # Create message
        message = MessageSchema(
            subject=subject,
            recipients=recipient_emails,
            body=html_body,
            subtype="html",
        )
        
        # Send email
        fm = FastMail(conf)
        await fm.send_message(message)
        
        logger.info(f"MSA {msa.msa_number} signed confirmation email sent successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send MSA signed confirmation email: {str(e)}")
        return False


async def send_msa_signed_copy_to_client(msa) -> bool:
    """
    Send signed MSA copy to client via email
    
    Args:
        msa: MSA document object
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    # Check if email is configured
    if not EMAIL_CONFIGURED:
        logger.warning(
            f"Email not configured. MSA {msa.msa_number} signed copy should be sent to {msa.client_email}.\n"
            f"To enable email sending, configure MAIL_USERNAME, MAIL_PASSWORD, and MAIL_SERVER in settings."
        )
        return False
    
    if not msa.client_email:
        logger.warning(f"No client email for MSA {msa.msa_number}")
        return False
    
    try:
        # Format dates
        effective_date_str = ""
        if msa.effective_date:
            try:
                effective_date_str = msa.effective_date.strftime('%B %d, %Y')
            except:
                effective_date_str = str(msa.effective_date)
        
        signed_date_str = ""
        if msa.completed_at or msa.signed_date:
            try:
                date_obj = msa.completed_at or msa.signed_date
                signed_date_str = date_obj.strftime('%B %d, %Y at %I:%M %p')
            except:
                signed_date_str = str(msa.completed_at or msa.signed_date)
        
        # Get frontend URL for viewing MSA
        frontend_url = "https://task.synzent.ai"
        msa_view_link = f"{frontend_url}/msa/sign/{msa.signature_token}"
        
        # Email subject
        subject = f"Signed MSA Copy - {msa.msa_number} - SynTask"
        
        # Email body (HTML)
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #10b981;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    background-color: #ffffff;
                    padding: 30px;
                    border: 1px solid #e5e7eb;
                }}
                .success-box {{
                    background-color: #d1fae5;
                    padding: 15px;
                    border-radius: 4px;
                    margin: 20px 0;
                    border-left: 4px solid #10b981;
                }}
                .button {{
                    display: inline-block;
                    padding: 12px 30px;
                    background-color: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    color: #666;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>MSA Signed Successfully</h1>
                </div>
                <div class="content">
                    <div class="success-box">
                        <h2 style="margin-top: 0;">✓ Your MSA Has Been Signed</h2>
                        <p>Thank you for signing the Master Service Agreement. Please find the details below.</p>
                    </div>
                    
                    <h3>MSA Details:</h3>
                    <p><strong>MSA Number:</strong> {msa.msa_number}</p>
                    <p><strong>Company:</strong> {msa.company_name}</p>
                    {f'<p><strong>Effective Date:</strong> {effective_date_str}</p>' if effective_date_str else ''}
                    <p><strong>Signed On:</strong> {signed_date_str}</p>
                    
                    <p>You can view the signed MSA by clicking the button below:</p>
                    
                    <div style="text-align: center;">
                        <a href="{msa_view_link}" class="button">View Signed MSA</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #3b82f6;">{msa_view_link}</p>
                    
                    <p>Please keep this email for your records.</p>
                    
                    <p>Best regards,<br>{msa.company_name}</p>
                </div>
                <div class="footer">
                    <p>© 2025 SynTask. All Rights Reserved.</p>
                    <p>This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
MSA Signed Successfully

Thank you for signing the Master Service Agreement.

MSA Number: {msa.msa_number}
Company: {msa.company_name}
{f'Effective Date: {effective_date_str}' if effective_date_str else ''}
Signed On: {signed_date_str}

You can view the signed MSA at: {msa_view_link}

Please keep this email for your records.

Best regards,
{msa.company_name}

© 2025 SynTask. All Rights Reserved.
        """
        
        # Check if email can be sent
        if not FASTAPI_MAIL_AVAILABLE or not conf:
            logger.warning(f"Email not available. MSA {msa.msa_number} signed copy should be sent to {msa.client_email}")
            return False
        
        # Create message
        message = MessageSchema(
            subject=subject,
            recipients=[msa.client_email],
            body=html_body,
            subtype="html",
        )
        
        # Send email
        fm = FastMail(conf)
        await fm.send_message(message)
        
        logger.info(f"MSA {msa.msa_number} signed copy email sent successfully to {msa.client_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send MSA signed copy to client: {str(e)}")
        return False


async def send_welcome_email(
    email: str, 
    password: str, 
    first_name: str, 
    last_name: str, 
    role: str,
    created_by_name: Optional[str] = None
) -> bool:
    """
    Send welcome email with login credentials to newly created user
    
    Args:
        email: Recipient email address
        password: Plain text password for the new account
        first_name: User's first name
        last_name: User's last name
        role: User's role (ADMIN, LEAD, EMPLOYEE)
        created_by_name: Optional name of the person who created the account
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    # Check if email is configured
    if not EMAIL_CONFIGURED:
        logger.warning(
            f"Email not configured. Welcome email should be sent to {email}\n"
            f"Login Credentials - Email: {email}, Password: {password}\n"
            f"To enable email sending, configure MAIL_USERNAME, MAIL_PASSWORD, and MAIL_SERVER in settings."
        )
        return False
    
    try:
        # Get frontend URL for login link
        frontend_url = getattr(settings, 'FRONTEND_URL', None)
        if not frontend_url or 'localhost' in frontend_url:
            frontend_url = "https://task.synzent.ai"
        login_link = f"{frontend_url}/login"
        
        # Role-specific welcome messages
        role_messages = {
            "ADMIN": {
                "title": "Company Administrator",
                "description": "As a Company Administrator, you have full control over your organization's workspace. You can manage users, create projects, assign tasks, and oversee all company operations."
            },
            "LEAD": {
                "title": "Team Lead",
                "description": "As a Team Lead, you can manage your team members, assign tasks to employees, track team progress, and ensure project deadlines are met."
            },
            "EMPLOYEE": {
                "title": "Employee",
                "description": "Welcome to the team! You can view and update your assigned tasks, create support tickets, log time on tasks, and collaborate with your team members."
            }
        }
        
        role_info = role_messages.get(role, {
            "title": "Team Member",
            "description": "Welcome to SynTask! You can now access your account and start collaborating with your team."
        })
        
        # Email subject
        subject = f"Welcome to SynTask - Your Account Has Been Created"
        
        # Email body (HTML)
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                    color: white;
                    padding: 30px 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    background-color: #ffffff;
                    padding: 30px;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                }}
                .credentials-box {{
                    background-color: #f3f4f6;
                    padding: 20px;
                    border-radius: 5px;
                    margin: 20px 0;
                    border-left: 4px solid #3b82f6;
                }}
                .credentials-box p {{
                    margin: 10px 0;
                }}
                .credential-label {{
                    font-weight: bold;
                    color: #1f2937;
                }}
                .credential-value {{
                    color: #3b82f6;
                    font-family: monospace;
                    font-size: 14px;
                }}
                .button {{
                    display: inline-block;
                    padding: 14px 35px;
                    background-color: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                    font-weight: bold;
                }}
                .button:hover {{
                    background-color: #2563eb;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    font-size: 12px;
                    color: #666;
                }}
                .info-box {{
                    background-color: #eff6ff;
                    padding: 15px;
                    border-radius: 4px;
                    margin: 20px 0;
                    border-left: 4px solid #3b82f6;
                }}
                .warning {{
                    background-color: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0;">Welcome to SynTask!</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">{role_info['title']}</p>
                </div>
                <div class="content">
                    <h2>Hello {first_name} {last_name},</h2>
                    <p>Your account has been successfully created{f' by {created_by_name}' if created_by_name else ''}. Welcome to SynTask - your comprehensive task management and collaboration platform!</p>
                    
                    <div class="info-box">
                        <p><strong>Your Role:</strong> {role_info['title']}</p>
                        <p>{role_info['description']}</p>
                    </div>
                    
                    <h3>Your Login Credentials</h3>
                    <div class="credentials-box">
                        <p><span class="credential-label">Email:</span> <span class="credential-value">{email}</span></p>
                        <p><span class="credential-label">Password:</span> <span class="credential-value">{password}</span></p>
                    </div>
                    
                    <div class="warning">
                        <strong>⚠️ Security Reminder:</strong>
                        <ul style="margin: 10px 0;">
                            <li>Please keep these credentials secure</li>
                            <li>We recommend changing your password after your first login</li>
                            <li>Never share your password with anyone</li>
                        </ul>
                    </div>
                    
                    <p>Click the button below to log in to your account:</p>
                    
                    <div style="text-align: center;">
                        <a href="{login_link}" class="button">Log In to SynTask</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #3b82f6;">{login_link}</p>
                    
                    <h3>Getting Started</h3>
                    <ul>
                        <li>Complete your profile information in Settings</li>
                        <li>Explore the dashboard to see your tasks and projects</li>
                        <li>Familiarize yourself with the platform features</li>
                        <li>Reach out to your team if you have any questions</li>
                    </ul>
                    
                    <p>If you have any questions or need assistance, please don't hesitate to contact your administrator.</p>
                    
                    <p>Best regards,<br>The SynTask Team</p>
                </div>
                <div class="footer">
                    <p>© 2025 SynTask. All Rights Reserved.</p>
                    <p>This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
Welcome to SynTask!

Hello {first_name} {last_name},

Your account has been successfully created{f' by {created_by_name}' if created_by_name else ''}. Welcome to SynTask - your comprehensive task management and collaboration platform!

Your Role: {role_info['title']}
{role_info['description']}

Your Login Credentials:
Email: {email}
Password: {password}

Security Reminder:
- Please keep these credentials secure
- We recommend changing your password after your first login
- Never share your password with anyone

Log in to your account at: {login_link}

Getting Started:
- Complete your profile information in Settings
- Explore the dashboard to see your tasks and projects
- Familiarize yourself with the platform features
- Reach out to your team if you have any questions

If you have any questions or need assistance, please don't hesitate to contact your administrator.

Best regards,
The SynTask Team

© 2025 SynTask. All Rights Reserved.
        """
        
        # Check if email can be sent
        if not FASTAPI_MAIL_AVAILABLE or not conf:
            logger.warning(f"Email not available. Welcome email should be sent to {email}")
            logger.info(f"Login Credentials - Email: {email}, Password: {password}")
            return False
        
        # Create message
        message = MessageSchema(
            subject=subject,
            recipients=[email],
            body=html_body,
            subtype="html",
        )
        
        # Send email
        fm = FastMail(conf)
        await fm.send_message(message)
        
        logger.info(f"Welcome email sent successfully to {email} (Role: {role})")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send welcome email to {email}: {str(e)}")
        # Log credentials as fallback
        logger.info(f"Login Credentials for {email} - Password: {password}")
        return False


async def send_task_assignment_email(
    assignee_email: str,
    assignee_name: str,
    task_title: str,
    task_description: str,
    task_priority: str,
    task_due_date: Optional[datetime],
    assigned_by_name: str,
    task_id: str,
    project_name: Optional[str] = None
) -> bool:
    """
    Send email notification when a task is assigned to a user.
    
    Args:
        assignee_email: Email of the user being assigned the task
        assignee_name: Full name of the assignee
        task_title: Title of the task
        task_description: Description of the task
        task_priority: Priority level (low, medium, high, critical)
        task_due_date: Due date of the task (optional)
        assigned_by_name: Name of the person who assigned the task
        task_id: ID of the task
        project_name: Name of the project (optional)
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    if not EMAIL_CONFIGURED:
        logger.warning(
            f"Email not configured. Task assignment email should be sent to {assignee_email}\n"
            f"Task: {task_title} assigned by {assigned_by_name}\n"
            f"To enable email sending, configure MAIL_USERNAME, MAIL_PASSWORD, and MAIL_SERVER in settings."
        )
        return False
    
    try:
        # Format priority with color
        priority_colors = {
            'low': '#6B7280',
            'medium': '#3B82F6',
            'high': '#F59E0B',
            'critical': '#EF4444',
            'urgent': '#DC2626'
        }
        priority_color = priority_colors.get(task_priority.lower(), '#6B7280')
        priority_label = task_priority.capitalize()
        
        # Format due date
        due_date_html = ""
        if task_due_date:
            formatted_date = task_due_date.strftime('%B %d, %Y at %I:%M %p')
            due_date_html = f"""
            <div style="margin-top: 10px;">
                <strong style="color: #374151;">Due Date:</strong>
                <span style="color: #6B7280;">{formatted_date}</span>
            </div>
            """
        
        # Format project name
        project_html = ""
        if project_name:
            project_html = f"""
            <div style="margin-top: 10px;">
                <strong style="color: #374151;">Project:</strong>
                <span style="color: #6B7280;">{project_name}</span>
            </div>
            """
        
        # Task URL
        frontend_url = settings.FRONTEND_URL or "http://localhost:5173"
        task_url = f"{frontend_url}/tasks/{task_id}"
        
        # HTML email body
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F3F4F6;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%); padding: 30px 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">New Task Assigned</h1>
                </div>
                
                <!-- Content -->
                <div style="padding: 40px 30px; background-color: #ffffff;">
                    <p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
                        Hi <strong>{assignee_name}</strong>,
                    </p>
                    
                    <p style="color: #6B7280; font-size: 15px; line-height: 22px; margin: 0 0 25px 0;">
                        <strong style="color: #374151;">{assigned_by_name}</strong> has assigned you a new task:
                    </p>
                    
                    <!-- Task Card -->
                    <div style="background-color: #F9FAFB; border-left: 4px solid #4F46E5; padding: 20px; border-radius: 8px; margin: 25px 0;">
                        <h2 style="color: #111827; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">
                            {task_title}
                        </h2>
                        
                        <p style="color: #6B7280; font-size: 14px; line-height: 20px; margin: 0 0 15px 0;">
                            {task_description if task_description else 'No description provided'}
                        </p>
                        
                        <!-- Task Details -->
                        <div style="border-top: 1px solid #E5E7EB; padding-top: 15px; margin-top: 15px;">
                            <div style="margin-top: 10px;">
                                <strong style="color: #374151;">Priority:</strong>
                                <span style="display: inline-block; background-color: {priority_color}; color: #ffffff; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-left: 8px;">
                                    {priority_label}
                                </span>
                            </div>
                            
                            {due_date_html}
                            {project_html}
                        </div>
                    </div>
                    
                    <!-- CTA Button -->
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{task_url}" style="display: inline-block; background-color: #4F46E5; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.3);">
                            View Task Details
                        </a>
                    </div>
                    
                    <!-- Tips -->
                    <div style="background-color: #EFF6FF; border-left: 3px solid #3B82F6; padding: 15px; border-radius: 6px; margin-top: 30px;">
                        <p style="color: #1E40AF; font-size: 13px; line-height: 18px; margin: 0; font-weight: 500;">
                            💡 <strong>Quick Tip:</strong> You can update the task status, add comments, and collaborate with your team directly from the task page.
                        </p>
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #F9FAFB; padding: 25px 30px; border-top: 1px solid #E5E7EB; text-align: center;">
                    <p style="color: #6B7280; font-size: 13px; line-height: 18px; margin: 0 0 10px 0;">
                        This is an automated notification from <strong style="color: #4F46E5;">SynTask</strong>
                    </p>
                    <p style="color: #9CA3AF; font-size: 12px; line-height: 16px; margin: 0;">
                        © 2024 SynTask. All rights reserved.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        plain_text = f"""
Hi {assignee_name},

{assigned_by_name} has assigned you a new task:

Task: {task_title}
Description: {task_description if task_description else 'No description provided'}

Priority: {priority_label}
{f'Due Date: {task_due_date.strftime("%B %d, %Y at %I:%M %p")}' if task_due_date else ''}
{f'Project: {project_name}' if project_name else ''}

View and manage this task here:
{task_url}

---
This is an automated notification from SynTask.
© 2024 SynTask. All rights reserved.
        """
        
        # Create message with HTML body directly
        message = MessageSchema(
            subject=f"New Task Assigned: {task_title}",
            recipients=[assignee_email],
            body=html_body,
            subtype=MessageType.html
        )
        
        # Send email
        fm = FastMail(conf)
        await fm.send_message(message)
        
        logger.info(f"Task assignment email sent successfully to {assignee_email} for task: {task_title}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send task assignment email to {assignee_email}: {str(e)}")
        logger.info(f"Task assignment details - Task: {task_title}, Assigned by: {assigned_by_name}")
        return False
