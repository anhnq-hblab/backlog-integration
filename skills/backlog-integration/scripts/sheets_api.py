#!/usr/bin/env python3
"""
Google Sheets row context fetcher for bugfix workflow.

Supports:
- Service account authentication (recommended)
- OAuth mode placeholder (requires token bootstrap outside this script)

Example:
  python3 sheets_api.py \
    --action get_row_context \
    --sheet-url "https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0" \
    --sheet-name "bugs" \
    --row-number 12 \
    --config .brain/google_sheets.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
except ImportError:
    print(
        "ERROR: Missing Google API deps. Install: pip install google-api-python-client google-auth",
        file=sys.stderr,
    )
    sys.exit(1)


class SheetsAPIError(Exception):
    pass


def parse_sheet_id(sheet_url: str) -> str:
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", sheet_url)
    if not match:
        raise SheetsAPIError("Invalid Google Sheets URL")
    return match.group(1)


def load_config(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        raise SheetsAPIError(f"Config not found: {config_path}")

    with path.open() as f:
        config = json.load(f)

    auth_mode = config.get("google_auth_mode", "service_account")
    if auth_mode not in {"service_account", "oauth"}:
        raise SheetsAPIError("google_auth_mode must be 'service_account' or 'oauth'")

    if auth_mode == "service_account" and not config.get("google_service_account_json"):
        raise SheetsAPIError("Missing 'google_service_account_json' in config")

    return config


def build_sheets_service(config: dict):
    auth_mode = config.get("google_auth_mode", "service_account")
    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

    if auth_mode == "service_account":
        sa_path = config["google_service_account_json"]
        if not Path(sa_path).exists():
            raise SheetsAPIError(f"Service account file not found: {sa_path}")
        try:
            creds = service_account.Credentials.from_service_account_file(sa_path, scopes=scopes)
            return build("sheets", "v4", credentials=creds)
        except OSError as exc:
            raise SheetsAPIError(f"Failed to read service account file: {sa_path}") from exc
        except Exception as exc:
            raise SheetsAPIError(f"Failed to initialize Google Sheets service: {exc}") from exc

    raise SheetsAPIError(
        "OAuth mode not bootstrapped in this helper yet. Use service_account for automation."
    )


def fetch_sheet_rows(service, spreadsheet_id: str, sheet_name: str) -> list:
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"{sheet_name}!A:ZZ")
        .execute()
    )
    rows = result.get("values", [])
    if not rows:
        raise SheetsAPIError("No data found in target sheet")
    return rows


def rows_to_dicts(rows: list) -> list:
    headers = rows[0]
    data_rows = rows[1:]
    normalized = []
    for idx, row in enumerate(data_rows, start=2):
        item = {h: (row[i] if i < len(row) else "") for i, h in enumerate(headers)}
        item["__row_number"] = idx
        normalized.append(item)
    return normalized


def normalize_context(row: dict, mapping: dict) -> dict:
    def get_mapped(field: str) -> str:
        col = mapping.get(field)
        if not col:
            return ""
        return row.get(col, "")

    return {
        "bug_id": get_mapped("bug_id"),
        "title": get_mapped("title"),
        "description": get_mapped("description"),
        "steps_to_reproduce": get_mapped("steps_to_reproduce"),
        "expected_result": get_mapped("expected_result"),
        "actual_result": get_mapped("actual_result"),
        "severity": get_mapped("severity"),
        "priority": get_mapped("priority"),
        "module": get_mapped("module"),
        "attachments": get_mapped("attachments"),
        "notes": get_mapped("notes"),
        "row_number": row.get("__row_number"),
    }


def validate_context(context: dict):
    if not context.get("title"):
        raise SheetsAPIError("Missing required context: title")
    if not (context.get("description") or context.get("steps_to_reproduce")):
        raise SheetsAPIError("Missing required context: description or steps_to_reproduce")
    if not context.get("actual_result"):
        raise SheetsAPIError("Missing required context: actual_result")


def find_target_row(items: list, row_number: int = None, bug_id: str = None, mapping: dict = None) -> dict:
    if row_number is not None:
        target = next((item for item in items if item.get("__row_number") == row_number), None)
        if not target:
            raise SheetsAPIError(f"Row not found: {row_number}")
        return target

    if bug_id:
        bug_col = (mapping or {}).get("bug_id")
        if not bug_col:
            raise SheetsAPIError("column_mapping.bug_id is required when using --bug-id")
        target = next((item for item in items if str(item.get(bug_col, "")).strip() == bug_id.strip()), None)
        if not target:
            raise SheetsAPIError(f"Bug ID not found: {bug_id}")
        return target

    raise SheetsAPIError("Provide --row-number or --bug-id")


def main():
    parser = argparse.ArgumentParser(description="Google Sheets Bug Context Helper")
    parser.add_argument("--action", choices=["get_row_context"], required=True)
    parser.add_argument("--sheet-url", required=True)
    parser.add_argument("--sheet-name")
    parser.add_argument("--row-number", type=int)
    parser.add_argument("--bug-id")
    parser.add_argument("--config", default=".brain/google_sheets.json")
    args = parser.parse_args()

    try:
        config = load_config(args.config)
        spreadsheet_id = parse_sheet_id(args.sheet_url)
        sheet_name = args.sheet_name or config.get("default_sheet_name")
        if not sheet_name:
            raise SheetsAPIError("Missing sheet name. Provide --sheet-name or default_sheet_name in config")

        service = build_sheets_service(config)
        rows = fetch_sheet_rows(service, spreadsheet_id, sheet_name)
        items = rows_to_dicts(rows)

        mapping = config.get("column_mapping", {})
        target_row = find_target_row(items, row_number=args.row_number, bug_id=args.bug_id, mapping=mapping)
        context = normalize_context(target_row, mapping)
        validate_context(context)

        output = {
            "source": {
                "spreadsheet_id": spreadsheet_id,
                "sheet_name": sheet_name,
                "row_number": context.get("row_number"),
            },
            "context": context,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))

    except SheetsAPIError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
