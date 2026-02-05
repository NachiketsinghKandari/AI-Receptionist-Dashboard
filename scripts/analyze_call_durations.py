#!/usr/bin/env python3
"""
Analyze call durations from webhook data.

This script fetches all webhooks for the past month from the production database,
decodes them, and extracts call duration metrics for comparison.

Output CSV columns:
- callID (hyperlink to dashboard)
- vapiCallDuration (message.durationSeconds)
- lastMessageTimeStamp (message.artifact.messages[-1].secondsFromStart)
- difference (vapiCallDuration - lastMessageTimeStamp)
- startedAt (message.startedAt)
- endedAt (message.endedAt)
- endedReason (message.endedReason)
"""

import os
import csv
import base64
import gzip
import json
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: supabase-py not installed. Run: pip install supabase")
    exit(1)

# Configuration
DASHBOARD_BASE_URL = "https://hellocounsel-dashboard.vercel.app/calls"
DASHBOARD_PARAMS = "f=0&e=production&s=N4IgJgtiBcIJ4FMDOAXBAnMBDOIA0ISYMIATAAykBsAtOQIw2kAs%2BICxsF1djAzPRABfIA"


def get_supabase_client() -> Client:
    """Create and return a Supabase client for production."""
    url = os.environ.get("SUPABASE_PROD_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_PROD_KEY") or os.environ.get("SUPABASE_KEY")

    if not url or not key:
        raise ValueError(
            "Missing Supabase credentials. Set SUPABASE_PROD_URL and SUPABASE_PROD_KEY "
            "(or SUPABASE_URL and SUPABASE_KEY) environment variables."
        )

    return create_client(url, key)


def decode_payload(payload: Any) -> dict:
    """
    Decode a base64-encoded, gzip-compressed payload.

    Handles backward compatibility - returns as-is if already a dict.
    """
    if isinstance(payload, dict):
        return payload

    if isinstance(payload, str):
        try:
            # Try base64 + gzip decoding
            decoded_bytes = base64.b64decode(payload)
            decompressed = gzip.decompress(decoded_bytes)
            return json.loads(decompressed.decode('utf-8'))
        except Exception:
            # Try plain JSON
            try:
                return json.loads(payload)
            except Exception:
                return {}

    return {}


def extract_call_data(payload: dict) -> dict | None:
    """
    Extract call duration data from a decoded webhook payload.

    Returns None if the required fields are not present.
    """
    message = payload.get("message", {})

    # Get call ID from message.call.id
    call = message.get("call", {})
    call_id = call.get("id")

    if not call_id:
        return None

    # Get duration from message.durationSeconds
    duration_seconds = message.get("durationSeconds")

    # Get last message timestamp from message.artifact.messages[-1].secondsFromStart
    artifact = message.get("artifact", {})
    messages = artifact.get("messages", [])

    last_message_timestamp = None
    if messages and len(messages) > 0:
        last_message = messages[-1]
        last_message_timestamp = last_message.get("secondsFromStart")

    # Get other fields
    started_at = message.get("startedAt")
    ended_at = message.get("endedAt")
    ended_reason = message.get("endedReason")

    # Calculate difference if both values are present
    difference = None
    if duration_seconds is not None and last_message_timestamp is not None:
        try:
            difference = float(duration_seconds) - float(last_message_timestamp)
        except (ValueError, TypeError):
            pass

    # Build dashboard URL with call ID
    dashboard_url = f"{DASHBOARD_BASE_URL}?{DASHBOARD_PARAMS}&c={call_id}"

    return {
        "callID": call_id,
        "dashboardURL": dashboard_url,
        "vapiCallDuration": duration_seconds,
        "lastMessageTimeStamp": last_message_timestamp,
        "difference": difference,
        "startedAt": started_at,
        "endedAt": ended_at,
        "endedReason": ended_reason,
    }


def fetch_webhooks(client: Client, days: int = 30) -> list[dict]:
    """
    Fetch all webhooks from the past N days.

    Handles pagination to fetch all records.
    """
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    all_webhooks = []
    page_size = 1000
    offset = 0

    print(f"Fetching webhooks from the past {days} days (since {start_date})...")

    while True:
        response = (
            client.table("webhook_dumps")
            .select("*")
            .gte("received_at", start_date)
            .order("received_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )

        webhooks = response.data or []
        all_webhooks.extend(webhooks)

        print(f"  Fetched {len(all_webhooks)} webhooks so far...")

        if len(webhooks) < page_size:
            break

        offset += page_size

    print(f"Total webhooks fetched: {len(all_webhooks)}")
    return all_webhooks


def process_webhooks(webhooks: list[dict]) -> list[dict]:
    """
    Process webhooks and extract call duration data.

    Returns a list of dictionaries with call data.
    """
    results = []
    seen_call_ids = set()

    print("Processing webhooks and extracting call data...")

    for i, webhook in enumerate(webhooks):
        if (i + 1) % 100 == 0:
            print(f"  Processed {i + 1}/{len(webhooks)} webhooks...")

        payload = decode_payload(webhook.get("payload", {}))
        call_data = extract_call_data(payload)

        if call_data and call_data["callID"] not in seen_call_ids:
            seen_call_ids.add(call_data["callID"])
            results.append(call_data)

    print(f"Extracted data for {len(results)} unique calls")
    return results


def save_to_csv(data: list[dict], output_file: str) -> None:
    """
    Save call data to a CSV file.

    The callID column contains a hyperlink formula for Excel/Google Sheets.
    """
    if not data:
        print("No data to save.")
        return

    fieldnames = [
        "callID",
        "vapiCallDuration",
        "lastMessageTimeStamp",
        "difference",
        "startedAt",
        "endedAt",
        "endedReason",
    ]

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for row in data:
            # Create hyperlink formula for Excel/Google Sheets
            hyperlink_formula = f'=HYPERLINK("{row["dashboardURL"]}", "{row["callID"]}")'

            writer.writerow({
                "callID": hyperlink_formula,
                "vapiCallDuration": row["vapiCallDuration"],
                "lastMessageTimeStamp": row["lastMessageTimeStamp"],
                "difference": row["difference"],
                "startedAt": row["startedAt"],
                "endedAt": row["endedAt"],
                "endedReason": row["endedReason"],
            })

    print(f"Data saved to {output_file}")


def main():
    """Main entry point."""
    print("=" * 60)
    print("Call Duration Analysis Script")
    print("=" * 60)
    print()

    # Initialize Supabase client
    try:
        client = get_supabase_client()
        print("Connected to Supabase production database")
    except ValueError as e:
        print(f"Error: {e}")
        return

    # Fetch webhooks from the past month
    webhooks = fetch_webhooks(client, days=30)

    if not webhooks:
        print("No webhooks found for the past month.")
        return

    # Process webhooks and extract call data
    call_data = process_webhooks(webhooks)

    if not call_data:
        print("No call data could be extracted from the webhooks.")
        return

    # Generate output filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"call_duration_analysis_{timestamp}.csv"

    # Save to CSV
    save_to_csv(call_data, output_file)

    # Print summary statistics
    print()
    print("=" * 60)
    print("Summary Statistics")
    print("=" * 60)

    # Calculate stats for records with valid differences
    valid_differences = [
        d["difference"] for d in call_data
        if d["difference"] is not None
    ]

    if valid_differences:
        avg_diff = sum(valid_differences) / len(valid_differences)
        max_diff = max(valid_differences)
        min_diff = min(valid_differences)

        print(f"Total unique calls: {len(call_data)}")
        print(f"Calls with valid duration data: {len(valid_differences)}")
        print(f"Average difference (duration - lastMessage): {avg_diff:.2f} seconds")
        print(f"Max difference: {max_diff:.2f} seconds")
        print(f"Min difference: {min_diff:.2f} seconds")
    else:
        print(f"Total unique calls: {len(call_data)}")
        print("No valid duration data found for comparison.")

    print()
    print(f"Output file: {output_file}")


if __name__ == "__main__":
    main()
