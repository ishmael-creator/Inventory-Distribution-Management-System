import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

def send_welcome_email(email: str, full_name: str, temporary_password: str):
    subject = "Welcome to UpEnergy - Your Account Details"
    
    # We use HTML so the email looks professional
    html_body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a;">Welcome to UpEnergy Operations</h2>
                <p>Hello <strong>{full_name}</strong>,</p>
                <p>An administrative account has been provisioned for you on the UpEnergy Inventory System.</p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Login Email:</strong> {email}</p>
                    <p style="margin: 10px 0 0 0;"><strong>Temporary Password:</strong> <span style="font-family: monospace; font-size: 16px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">{temporary_password}</span></p>
                </div>
                <p style="color: #b91c1c; font-size: 14px;"><strong>Security Notice:</strong> You must log in immediately. The system will lock your dashboard and require you to change this temporary password to a permanent one upon your first login.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
                <p style="font-size: 12px; color: #64748b;">This is an automated message from the UpEnergy System. Please do not reply directly to this email.</p>
            </div>
        </body>
    </html>
    """
    
    # Pull credentials from the .env file
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT", 587)
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL")

    # Fallback safety net: If .env variables are missing, print to terminal
    if not all([smtp_host, smtp_user, smtp_pass]):
        logger.warning("SMTP credentials missing. Falling back to terminal output.")
        print("\n" + "="*50)
        print(f"📧 [MOCK EMAIL] DISPATCHED TO: {email}")
        print(f"PASSWORD: {temporary_password}")
        print("="*50 + "\n")
        return

    # Construct the actual email payload
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"UpEnergy System <{from_email}>"
    msg["To"] = email

    msg.attach(MIMEText(html_body, "html"))

    try:
        # Connect to the server and dispatch via TLS
        with smtplib.SMTP(smtp_host, int(smtp_port)) as server:
            server.starttls()  # Secure the connection for Gmail
            server.login(smtp_user, smtp_pass)
            server.sendmail(from_email, email, msg.as_string())
            
        logger.info(f"Welcome email successfully sent to {email}")
        
    except Exception as e:
        logger.error(f"Failed to send email to {email}: {str(e)}")
        # Ultimate fallback: if the SMTP connection fails, print the password so you don't lose it
        print(f"\n❌ ALERT: Email failed to send to {email}. Error: {e}")
        print(f"Temporary password was: {temporary_password}\n")