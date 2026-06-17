import os
import json
import logging
import urllib.request

logger = logging.getLogger(__name__)

def send_welcome_email(email: str, full_name: str, temporary_password: str):
    # Pull credentials from the .env file (now looking for Brevo Key)
    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("SMTP_FROM_EMAIL", "ishmael@upenergygroup.com")
    
    # Fallback safety net: If .env variables are missing, print to terminal
    if not api_key:
        logger.warning("BREVO_API_KEY missing. Falling back to terminal output.")
        print("\n" + "="*50)
        print(f"📧 [MOCK EMAIL] DISPATCHED TO: {email}")
        print(f"PASSWORD: {temporary_password}")
        print("="*50 + "\n")
        return

    url = "https://api.brevo.com/v3/smtp/email"
    
    # Your original HTML formatting kept perfectly intact
    html_body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a;">Welcome to UpEnergy Operations</h2>
                <p>Hello <strong>{full_name}</strong>,</p>
                <p>An administrative account has been provisioned for you on the UpEnergy Inventory System.</p>
                
                <div style="text-align: center; margin: 25px 0;">
                    <a href="https://inventory-distribution-management-s.vercel.app" style="background-color: #0f766e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Access Dashboard</a>
                </div>

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
    
    # The payload formatted exactly how Brevo's API expects it
    data = {
        "sender": {"name": "UpEnergy System", "email": sender_email},
        "to": [{"email": email, "name": full_name}],
        "subject": "Welcome to UpEnergy - Your Account Details",
        "htmlContent": html_body
    }
    
    # Package the request as a secure HTTPS POST
    req = urllib.request.Request(
        url, 
        data=json.dumps(data).encode("utf-8"), 
        headers={
            "accept": "application/json",
            "api-key": api_key,
            "content-type": "application/json"
        }
    )
    
    try:
        # Fire the request
        with urllib.request.urlopen(req) as response:
            logger.info(f"Welcome email successfully sent to {email} via Brevo API")
            
    except Exception as e:
        logger.error(f"Failed to send API email to {email}: {str(e)}")
        # Ultimate fallback: if the API connection fails, print the password so you don't lose it
        print(f"\n❌ ALERT: Email failed to send to {email}. Error: {e}")
        print(f"Temporary password was: {temporary_password}\n")