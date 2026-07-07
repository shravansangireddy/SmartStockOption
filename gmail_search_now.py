#!/usr/bin/env python3
"""Search Gmail via Maton API for ARK Trading Desk and Stocktwits Daily Rip."""
import urllib.request
import urllib.parse
import os
import json
import base64
from datetime import datetime

api_key = os.environ.get("MATON_API_KEY", "")
# Also check for Maton API key in secrets file
secrets_file = os.path.expanduser("~/.openclaw/workspace/.secrets/maton_api_key.txt")
if not api_key and os.path.exists(secrets_file):
    with open(secrets_file) as f:
        api_key = f.read().strip()

# Try connection ID from the cron task
connection_id = "a9104f5e-cad9-418b-b28b-61f31e2395e6"

if not api_key:
    print("ERROR: No MATON_API_KEY found")
    exit(1)

headers = {"Authorization": f"Bearer {api_key}"}

# Search for ARK Trading Desk and Stocktwits Daily Rip emails
queries = [
    "subject:ARK Trading Desk newer_than:3d",
    "subject:Stocktwits newer_than:3d",
    "subject:Daily Rip newer_than:3d",
]

all_results = {}

for q in queries:
    encoded_q = urllib.parse.quote(q)
    url = f"https://gateway.maton.ai/google-mail/gmail/v1/users/me/messages?maxResults=3&q={encoded_q}"
    req = urllib.request.Request(url, headers=headers)
    try:
        data = json.load(urllib.request.urlopen(req))
        messages = data.get("messages", [])
        if not messages:
            all_results[q] = {"status": "no_messages"}
            continue
        
        for msg_summary in messages[:2]:  # Get top 2 messages per query
            msg_id = msg_summary["id"]
            msg_url = f"https://gateway.maton.ai/google-mail/gmail/v1/users/me/messages/{msg_id}?format=full"
            msg_req = urllib.request.Request(msg_url, headers=headers)
            try:
                msg_data = json.load(urllib.request.urlopen(msg_req))
                
                # Extract headers
                subject = ""
                date_str = ""
                from_str = ""
                for h in msg_data.get("payload", {}).get("headers", []):
                    if h["name"] == "Subject":
                        subject = h["value"]
                    elif h["name"] == "Date":
                        date_str = h["value"]
                    elif h["name"] == "From":
                        from_str = h["value"]
                
                # Extract body text
                body = ""
                payload = msg_data.get("payload", {})
                if "parts" in payload:
                    for part in payload["parts"]:
                        if part.get("mimeType") == "text/plain":
                            data_b64 = part.get("body", {}).get("data", "")
                            if data_b64:
                                body = base64.urlsafe_b64decode(data_b64 + "===").decode("utf-8", errors="replace")
                                break
                        elif part.get("mimeType") == "text/html":
                            data_b64 = part.get("body", {}).get("data", "")
                            if data_b64 and not body:
                                body = base64.urlsafe_b64decode(data_b64 + "===").decode("utf-8", errors="replace")
                elif "body" in payload and payload["body"].get("data"):
                    data_b64 = payload["body"]["data"]
                    body = base64.urlsafe_b64decode(data_b64 + "===").decode("utf-8", errors="replace")
                
                key = f"{q}_{msg_id}"
                all_results[key] = {
                    "subject": subject,
                    "date": date_str,
                    "from": from_str,
                    "snippet": msg_data.get("snippet", ""),
                    "body_preview": body[:3000] if body else ""
                }
            except Exception as e:
                all_results[f"{q}_{msg_id}_error"] = str(e)
    except Exception as e:
        all_results[q] = {"error": str(e)}

print(json.dumps(all_results, indent=2, ensure_ascii=False))