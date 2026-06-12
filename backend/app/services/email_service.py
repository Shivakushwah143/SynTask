from app.core.email import send_password_reset_email


class EmailService:
    send_password_reset_email = staticmethod(send_password_reset_email)
