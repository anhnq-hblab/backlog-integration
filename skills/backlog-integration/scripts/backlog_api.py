#!/usr/bin/env python3
"""
Backlog.com Image/Attachment Downloader (REST API v2)
Part of: backlog-integration skill

Primary API operations (get_issue, add_comment, update_issue, etc.) are handled
by MCP backlog-mcp-server. This script only handles binary attachment downloads
which MCP does not support.

Usage:
    python3 backlog_api.py --action download_images --issue PROJ-123 --config .brain/backlog.json
    python3 backlog_api.py --action get_issue_with_images --issue PROJ-123 --config .brain/backlog.json
    python3 backlog_api.py --test --dry-run
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library required. Install: pip install requests", file=sys.stderr)
    sys.exit(1)


class BacklogAPIError(Exception):
    pass


class BacklogImageClient:
    """Minimal Backlog REST client for attachment/image downloads only."""

    def __init__(self, space: str, api_key: str):
        self.base_url = f"https://{space}/api/v2"
        self.api_key = api_key

    def _get(self, endpoint: str, params: dict = None, stream: bool = False):
        url = f"{self.base_url}{endpoint}"
        req_params = {"apiKey": self.api_key}
        if params:
            req_params.update(params)
        try:
            resp = requests.get(url, params=req_params, timeout=60, stream=stream)
            if resp.status_code == 401:
                raise BacklogAPIError("Authentication failed. Check your API key.")
            elif resp.status_code == 404:
                raise BacklogAPIError(f"Resource not found: {endpoint}")
            elif resp.status_code == 429:
                raise BacklogAPIError("Rate limit exceeded. Please wait and try again.")
            elif not resp.ok:
                raise BacklogAPIError(f"API error {resp.status_code}: {resp.text[:200]}")
            return resp
        except requests.exceptions.ConnectionError:
            raise BacklogAPIError("Connection failed. Check your network and Backlog space URL.")
        except requests.exceptions.Timeout:
            raise BacklogAPIError("Request timed out.")

    def get_attachments(self, issue_key: str) -> list:
        return self._get(f"/issues/{issue_key}/attachments").json()

    def download_attachment(self, issue_key: str, attachment_id: int, save_path: str) -> str:
        resp = self._get(f"/issues/{issue_key}/attachments/{attachment_id}", stream=True)
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return save_path

    def download_images(self, issue_key: str, output_dir: str) -> list:
        """Download all image attachments. Returns list of {name, path, id, size}."""
        IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
        attachments = self.get_attachments(issue_key)
        downloaded = []
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        for att in attachments:
            name = att.get("name", "")
            if Path(name).suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            att_id = att.get("id")
            save_to = str(out_path / f"{att_id}_{name}")
            try:
                self.download_attachment(issue_key, att_id, save_to)
                downloaded.append({"name": name, "path": save_to, "id": att_id, "size": att.get("size", 0)})
            except BacklogAPIError as e:
                print(f"WARNING: Failed to download {name}: {e}", file=sys.stderr)
        return downloaded

    def get_issue_with_images(self, issue_key: str, output_dir: str = "reports/attachments") -> dict:
        """Fetch issue + comments via REST, download images, match #image() refs.
        Use this as fallback when MCP is not available."""
        issue = self._get(f"/issues/{issue_key}").json()
        description = issue.get("description", "")
        desc_image_refs = re.findall(r'#image\(([^)]+)\)', description)

        comments = []
        comment_image_refs = []
        try:
            comments = self._get(f"/issues/{issue_key}/comments", params={"count": 100, "order": "asc"}).json()
            for c in comments:
                cid = c.get("id")
                content = c.get("content") or ""
                for ref in re.findall(r'#image\(([^)]+)\)', content):
                    comment_image_refs.append({"ref": ref, "comment_id": cid, "source": "content"})
                for log in (c.get("changeLog") or []):
                    if log.get("field") == "attachment":
                        att_info = log.get("attachmentInfo") or {}
                        att_name = att_info.get("name", "")
                        if att_name:
                            comment_image_refs.append({
                                "ref": att_name, "comment_id": cid,
                                "source": "changeLog", "attachment_id": att_info.get("id"),
                            })
        except BacklogAPIError as e:
            print(f"WARNING: Failed to fetch comments: {e}", file=sys.stderr)

        issue_dir = os.path.join(output_dir, issue_key.replace("-", "_"))
        downloaded = self.download_images(issue_key, issue_dir)

        all_refs = []
        seen = set()
        for ref in desc_image_refs:
            if ref not in seen:
                all_refs.append({"ref": ref, "source": "description"})
                seen.add(ref)
        for cr in comment_image_refs:
            if cr["ref"] not in seen:
                all_refs.append(cr)
                seen.add(cr["ref"])

        matched, unmatched = [], []
        for entry in all_refs:
            found = next((img for img in downloaded if img["name"] == entry["ref"] or entry["ref"] in img["name"]), None)
            (matched if found else unmatched).append({**(found or {}), **entry})

        return {
            "issue": issue, "description": description,
            "image_refs": [r["ref"] for r in all_refs],
            "downloaded_images": downloaded, "matched_images": matched,
            "unmatched_refs": unmatched, "image_dir": issue_dir,
            "comment_count": len(comments),
        }


def load_config(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}\nRun '/bugfix' to setup.")

    with open(path) as f:
        config = json.load(f)

    required = ["backlog_space", "backlog_api_key"]
    missing = [f for f in required if f not in config]
    if missing:
        raise ValueError(f"Missing config fields: {', '.join(missing)}")

    api_key = config["backlog_api_key"]
    if api_key.startswith("env:"):
        resolved = os.environ.get(api_key[4:])
        if not resolved:
            raise ValueError(f"Environment variable '{api_key[4:]}' not set.")
        config["backlog_api_key"] = resolved
    elif not api_key or api_key == "xxxxxxxxxxxxxxxxxxxx":
        raise ValueError("API key is not configured in .brain/backlog.json")

    return config


def create_client(config_path: str = ".brain/backlog.json") -> tuple:
    config = load_config(config_path)
    return BacklogImageClient(config["backlog_space"], config["backlog_api_key"]), config


def run_smoke_test(dry_run: bool = True):
    print("Running Backlog Image API smoke tests...\n")
    try:
        client = BacklogImageClient("test.backlog.com", "test-key")
        assert client.base_url == "https://test.backlog.com/api/v2"
        print("  PASS: URL construction")
    except Exception as e:
        print(f"  FAIL: {e}")

    if dry_run:
        print("\nDry-run mode: No real API calls made.")
    print("\nSmoke tests complete.")


def main():
    parser = argparse.ArgumentParser(description="Backlog Image Downloader (MCP supplement)")
    parser.add_argument("--action", choices=["download_images", "get_issue_with_images"],
                        help="Action: download_images or get_issue_with_images (legacy fallback)")
    parser.add_argument("--issue", help="Issue key (e.g., PROJ-123)")
    parser.add_argument("--config", default=".brain/backlog.json")
    parser.add_argument("--output-dir", default="reports/attachments")
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.test:
        run_smoke_test(dry_run=args.dry_run)
        return

    if not args.action or not args.issue:
        parser.print_help()
        sys.exit(1)

    try:
        client, _ = create_client(args.config)

        if args.action == "download_images":
            issue_dir = os.path.join(args.output_dir, args.issue)
            downloaded = client.download_images(args.issue, issue_dir)
            print(json.dumps(downloaded, indent=2, ensure_ascii=False))
            print(f"\nDownloaded {len(downloaded)} image(s) to {issue_dir}", file=sys.stderr)

        elif args.action == "get_issue_with_images":
            result = client.get_issue_with_images(args.issue, args.output_dir)
            output = {
                "key": result["issue"].get("issueKey", args.issue),
                "title": result["issue"].get("summary", ""),
                "description": result["description"],
                "image_refs": result["image_refs"],
                "downloaded_images": result["downloaded_images"],
                "matched_images": result["matched_images"],
                "unmatched_refs": result["unmatched_refs"],
                "image_dir": result["image_dir"],
                "comment_count": result["comment_count"],
            }
            print(json.dumps(output, indent=2, ensure_ascii=False))

    except (BacklogAPIError, FileNotFoundError, ValueError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
