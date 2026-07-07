#!/usr/bin/env python3
"""Broader Gmail search via Maton API."""
import urllib.request
import urllib.parse
import os
import json
import base64

api_key = os.environ.get("MATON_API_KEY", "")
secrets_file = os.path.expanduser("~/.openclaw/workspace/.secrets/maton_api_key.txt")
if not api_key and os.path.exists(secrets_file):
    with open(secrets_file) as f:
        api_key = f.read().strip()

if not api_key:
    print("ERROR: No MATON_API_KEY found")
    exit(1)

headers = {"Authorization": f"Bearer {api_key}"}

# Broader searches
queries = [
    "ARK newer_than:7d",
    "Stocktwits newer_than:7d",
    "Daily Rip newer_than:7d",
    "subject:trading newer_than:5d",
    "subject:market newer_than:5d",
]

all_results = {}

for q in queries:
    encoded_q = urllib.parse.quote(q)
    url = f"https://gateway.maton.ai/google-mail/gmail/v1/users/me/messages?maxResults=5&q={encoded_q}"
    req = urllib.request.Request(url, headers=headers)
    try:
        data = json.load(urllib.request.urlopen(req))
        messages = data.get("messages", [])
        result_estimate = data.get("resultSizeEstimate", 0)
        
        if not messages:
            all_results[q] = {"status": "no_messages", "result_estimate": result_estimate}
            continue
        
        msg_summaries = []
        for msg_summary in messages[:3]:
            msg_id = msg_summary["id"]
            msg_url = f"https://gateway.maton.ai/google-mail/gmail/v1/users/me/messages/{msg_id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From"
            msg_req = urllib.request.Request(msg_url, headers=headers)
            try:
                msg_data = json.load(urllib.request.urlopen(msg_req))
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
                msg_summaries.append({
                    "subject": subject,
                    "date": date_str,
                    "from": from_str,
                    "snippet": msg_data.get("snippet", "")[:200]
                })
            except Exception as e:
                msg_summaries.append({"error": str(e)})
        
        all_results[q] = {"count": len(messages), "result_estimate": result_estimate, "messages": msg_summaries}
    except Exception as e:
        all_results[q] = {"error": str(e)}

import sys; sys.stdout.buffer.write(json.dumps(all_results, indent=2, ensure_ascii=True).encode('utf-8')); sys.stdout.buffer.write(b'\n')