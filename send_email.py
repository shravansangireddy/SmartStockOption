"""Send email via Gmail API using stored OAuth credentials."""
import base64
import json
import os
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
except ImportError:
    print("Install: pip install google-auth google-auth-oauthlib google-api-python-client")
    sys.exit(1)

# Connection ID hint - may need to map to stored credentials
CONNECTION_ID = "a9104f5e-cad9-418b-b28b-61f31e2395e6"

def send_email(to, subject, html_body, from_email="me"):
    """Send HTML email via Gmail API."""
    # Try to find stored credentials
    # Common paths for OpenClaw / Maton stored tokens
    cred_paths = [
        os.path.expanduser("~/.openclaw/credentials/gmail.json"),
        os.path.expanduser("~/.openclaw/tokens/gmail.json"),
        os.path.expanduser("~/.config/openclaw/gmail.json"),
    ]
    
    creds = None
    for p in cred_paths:
        if os.path.exists(p):
            with open(p) as f:
                data = json.load(f)
            creds = Credentials.from_authorized_user_info(data)
            break
    
    if not creds:
        print(f"ERROR: No Gmail credentials found. Searched: {cred_paths}")
        print(f"Connection ID: {CONNECTION_ID}")
        print("Please provide OAuth credentials or token file.")
        sys.exit(1)
    
    service = build("gmail", "v1", credentials=creds)
    
    msg = MIMEMultipart("alternative")
    msg["to"] = to
    msg["from"] = from_email
    msg["subject"] = subject
    
    msg.attach(MIMEText(html_body, "html"))
    
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    result = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    print(f"Email sent! Message ID: {result['id']}")
    return result

if __name__ == "__main__":
    to = sys.argv[1] if len(sys.argv) > 1 else "shravan.sangi@gmail.com"
    subject = sys.argv[2] if len(sys.argv) > 2 else "Test"
    html_file = sys.argv[3] if len(sys.argv) > 3 else None
    
    if html_file and os.path.exists(html_file):
        with open(html_file) as f:
            html_body = f.read()
    else:
        html_body = "<p>Test email from OpenClaw</p>"
    
    send_email(to, subject, html_body)