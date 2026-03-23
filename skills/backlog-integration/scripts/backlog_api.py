#!/usr/bin/env python3
"""
Backlog.com REST API v2 Wrapper
Part of: backlog-integration skill for Antigravity AWF

Usage:
    python3 backlog_api.py --action get_issue --issue PROJ-123 --config .brain/backlog.json
    python3 backlog_api.py --action get_comments --issue PROJ-123 --config .brain/backlog.json
    python3 backlog_api.py --action add_comment --issue PROJ-123 --content "text" --config .brain/backlog.json
    python3 backlog_api.py --action update_issue --issue PROJ-123 --status-id 3 --config .brain/backlog.json
    python3 backlog_api.py --action get_attachments --issue PROJ-123 --config .brain/backlog.json
    python3 backlog_api.py --action download_images --issue PROJ-123 --output-dir /tmp/backlog-img/ --config .brain/backlog.json
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
    """Custom exception for Backlog API errors."""
    pass


class BacklogClient:
    """Backlog.com REST API v2 client."""

    def __init__(self, space: str, api_key: str):
        self.base_url = f"https://{space}/api/v2"
        self.api_key = api_key

    def _request(self, method: str, endpoint: str, params: dict = None, data: dict = None) -> dict:
        """Make an authenticated API request."""
        url = f"{self.base_url}{endpoint}"
        req_params = {"apiKey": self.api_key}
        if params:
            req_params.update(params)

        try:
            if method == "GET":
                resp = requests.get(url, params=req_params, timeout=30)
            elif method == "POST":
                resp = requests.post(url, params=req_params, json=data, timeout=30)
            elif method == "PATCH":
                resp = requests.patch(url, params=req_params, data=data, timeout=30)
            else:
                raise BacklogAPIError(f"Unsupported HTTP method: {method}")

            if resp.status_code == 401:
                raise BacklogAPIError("Authentication failed. Check your API key.")
            elif resp.status_code == 404:
                raise BacklogAPIError(f"Resource not found: {endpoint}")
            elif resp.status_code == 429:
                raise BacklogAPIError("Rate limit exceeded. Please wait and try again.")
            elif not resp.ok:
                raise BacklogAPIError(f"API error {resp.status_code}: {resp.text}")

            return resp.json()

        except requests.exceptions.ConnectionError:
            raise BacklogAPIError("Connection failed. Check your network and Backlog space URL.")
        except requests.exceptions.Timeout:
            raise BacklogAPIError("Request timed out. Backlog may be slow, try again later.")

    def get_issue(self, issue_key: str) -> dict:
        """Fetch issue details."""
        return self._request("GET", f"/issues/{issue_key}")

    def get_comments(self, issue_key: str, count: int = 20, order: str = "asc") -> list:
        """Fetch issue comments."""
        params = {"count": count, "order": order}
        return self._request("GET", f"/issues/{issue_key}/comments", params=params)

    def add_comment(self, issue_key: str, content: str) -> dict:
        """Add a comment to an issue."""
        data = {"content": content}
        return self._request("POST", f"/issues/{issue_key}/comments", data=data)

    def update_issue(self, issue_key: str, **fields) -> dict:
        """Update issue fields (statusId, assigneeId, etc.)."""
        return self._request("PATCH", f"/issues/{issue_key}", data=fields)

    # --- Attachment Methods ---

    def get_attachments(self, issue_key: str) -> list:
        """List all attachments of an issue."""
        return self._request("GET", f"/issues/{issue_key}/attachments")

    def download_attachment(self, issue_key: str, attachment_id: int, save_path: str) -> str:
        """Download an attachment file. Returns saved file path."""
        url = f"{self.base_url}/issues/{issue_key}/attachments/{attachment_id}"
        params = {"apiKey": self.api_key}
        try:
            resp = requests.get(url, params=params, timeout=60, stream=True)
            if not resp.ok:
                raise BacklogAPIError(f"Download failed {resp.status_code}: {resp.text[:200]}")
            Path(save_path).parent.mkdir(parents=True, exist_ok=True)
            with open(save_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            return save_path
        except requests.exceptions.ConnectionError:
            raise BacklogAPIError("Connection failed during download.")
        except requests.exceptions.Timeout:
            raise BacklogAPIError("Download timed out.")

    def download_images(self, issue_key: str, output_dir: str) -> list:
        """Download all image attachments for an issue. Returns list of {name, path, id, size}."""
        IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
        attachments = self.get_attachments(issue_key)
        downloaded = []
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        for att in attachments:
            name = att.get("name", "")
            ext = Path(name).suffix.lower()
            if ext not in IMAGE_EXTENSIONS:
                continue
            att_id = att.get("id")
            save_to = str(out_path / f"{att_id}_{name}")
            try:
                self.download_attachment(issue_key, att_id, save_to)
                downloaded.append({
                    "name": name,
                    "path": save_to,
                    "id": att_id,
                    "size": att.get("size", 0),
                })
            except BacklogAPIError as e:
                print(f"WARNING: Failed to download {name}: {e}", file=sys.stderr)
        return downloaded

    def get_issue_with_images(self, issue_key: str, output_dir: str = "Autocode/attachments") -> dict:
        """Fetch issue details + comments + download all screenshots. Returns combined data."""
        issue = self.get_issue(issue_key)
        description = issue.get("description", "")

        # 1. Parse #image(filename) from description
        desc_image_refs = re.findall(r'#image\(([^)]+)\)', description)

        # 2. Fetch comments and extract image refs from content + changeLog
        comments = []
        comment_image_refs = []  # {ref, comment_id, source: "content"|"changeLog"}
        try:
            comments = self.get_comments(issue_key, count=100)
            for c in comments:
                cid = c.get("id")
                content = c.get("content") or ""
                # Check #image() in comment content
                for ref in re.findall(r'#image\(([^)]+)\)', content):
                    comment_image_refs.append({"ref": ref, "comment_id": cid, "source": "content"})
                # Check changeLog for attachment entries (pasted images)
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

        # 3. Download all image attachments (issue-level — includes comment-pasted images)
        issue_dir = os.path.join(output_dir, issue_key.replace("-", "_"))
        downloaded = self.download_images(issue_key, issue_dir)

        # 4. Merge all image refs (description + comments), deduplicate
        all_refs = []
        seen_refs = set()
        for ref in desc_image_refs:
            if ref not in seen_refs:
                all_refs.append({"ref": ref, "source": "description"})
                seen_refs.add(ref)
        for cr in comment_image_refs:
            if cr["ref"] not in seen_refs:
                all_refs.append(cr)
                seen_refs.add(cr["ref"])

        # 5. Map refs to downloaded files
        matched_images = []
        unmatched_refs = []
        for ref_entry in all_refs:
            ref_name = ref_entry["ref"]
            found = False
            for img in downloaded:
                if img["name"] == ref_name or ref_name in img["name"]:
                    matched_images.append({**img, **ref_entry})
                    found = True
                    break
            if not found:
                unmatched_refs.append(ref_entry)

        return {
            "issue": issue,
            "description": description,
            "image_refs": [r["ref"] for r in all_refs],
            "desc_image_refs": desc_image_refs,
            "comment_image_refs": comment_image_refs,
            "downloaded_images": downloaded,
            "matched_images": matched_images,
            "unmatched_refs": unmatched_refs,
            "image_dir": issue_dir,
            "comment_count": len(comments),
        }

    # --- Summary Methods ---

    def get_issue_summary(self, issue_key: str) -> dict:
        """Get a formatted summary of an issue (convenience method)."""
        issue = self.get_issue(issue_key)

        priority_map = {2: "🔴 High", 3: "🟡 Medium", 4: "🟢 Low"}
        status_map = {1: "Open", 2: "In Progress", 3: "Resolved", 4: "Closed"}

        # Count image attachments
        attachments = []
        try:
            attachments = self.get_attachments(issue_key)
        except BacklogAPIError:
            pass
        image_exts = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
        image_count = sum(1 for a in attachments if Path(a.get("name", "")).suffix.lower() in image_exts)

        summary = {
            "key": issue.get("issueKey", issue_key),
            "title": issue.get("summary", "N/A"),
            "description": issue.get("description", ""),
            "priority": priority_map.get(
                issue.get("priority", {}).get("id") if isinstance(issue.get("priority"), dict) else None,
                "⚪ Unknown"
            ),
            "status": status_map.get(
                issue.get("status", {}).get("id") if isinstance(issue.get("status"), dict) else None,
                "Unknown"
            ),
            "assignee": (
                issue.get("assignee", {}).get("name", "Unassigned")
                if isinstance(issue.get("assignee"), dict) and issue.get("assignee")
                else "Unassigned"
            ),
            "created": issue.get("created", ""),
            "updated": issue.get("updated", ""),
            "image_count": image_count,
            "attachment_count": len(attachments),
        }
        return summary


def load_config(config_path: str) -> dict:
    """Load and validate Backlog config from .brain/backlog.json."""
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Config file not found: {config_path}\n"
            f"Run '/bugfix' to set up Backlog integration, or create .brain/backlog.json manually."
        )

    with open(path) as f:
        try:
            config = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in config file: {e}")

    # Validate required fields
    required = ["backlog_space", "backlog_api_key", "project_key", "git_host"]
    missing = [f for f in required if f not in config]
    if missing:
        raise ValueError(f"Missing required config fields: {', '.join(missing)}")

    # Resolve API key: support both direct value and env: prefix (backward compat)
    api_key = config["backlog_api_key"]
    if api_key.startswith("env:"):
        # Legacy: resolve from environment variable
        env_var = api_key[4:]
        resolved = os.environ.get(env_var)
        if not resolved:
            raise ValueError(
                f"Environment variable '{env_var}' not set.\n"
                f"Recommendation: Store API key directly in backlog.json (file is gitignored).\n"
                f"Or set: export {env_var}=your_api_key_here"
            )
        config["backlog_api_key"] = resolved
    elif not api_key or api_key == "xxxxxxxxxxxxxxxxxxxx":
        raise ValueError(
            "API key is not configured.\n"
            "Edit .brain/backlog.json and set 'backlog_api_key' to your actual key."
        )

    return config


def create_client_from_config(config_path: str) -> tuple:
    """Create a BacklogClient from config file. Returns (client, config)."""
    config = load_config(config_path)
    client = BacklogClient(
        space=config["backlog_space"],
        api_key=config["backlog_api_key"]
    )
    return client, config


def run_smoke_test(dry_run: bool = True):
    """Run smoke tests to validate config loading and URL construction."""
    print("🧪 Running Backlog API smoke tests...\n")

    # Test 1: Config loading
    print("Test 1: Config loading")
    try:
        sample_config = {
            "backlog_space": "test.backlog.com",
            "backlog_api_key": "test-key-123",
            "project_key": "TEST",
            "git_host": "github"
        }
        client = BacklogClient(sample_config["backlog_space"], sample_config["backlog_api_key"])
        assert client.base_url == "https://test.backlog.com/api/v2"
        print("  ✅ PASS — URL construction correct")
    except Exception as e:
        print(f"  ❌ FAIL — {e}")

    # Test 2: env: prefix resolution
    print("\nTest 2: env: prefix resolution")
    try:
        os.environ["_TEST_BACKLOG_KEY"] = "resolved-key-456"
        test_config = {
            "backlog_space": "test.backlog.com",
            "backlog_api_key": "env:_TEST_BACKLOG_KEY",
            "project_key": "TEST",
            "git_host": "github"
        }
        # Write temp config
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(test_config, f)
            tmp_path = f.name

        loaded = load_config(tmp_path)
        assert loaded["backlog_api_key"] == "resolved-key-456"
        os.unlink(tmp_path)
        del os.environ["_TEST_BACKLOG_KEY"]
        print("  ✅ PASS — env: prefix resolved correctly")
    except Exception as e:
        print(f"  ❌ FAIL — {e}")

    # Test 3: API URL construction
    print("\nTest 3: API endpoint URLs")
    try:
        client = BacklogClient("myteam.backlog.com", "fake-key")
        assert client.base_url == "https://myteam.backlog.com/api/v2"
        print("  ✅ PASS — Base URL correct")
    except Exception as e:
        print(f"  ❌ FAIL — {e}")

    if dry_run:
        print("\n⚠️  Dry-run mode: No real API calls made.")
    print("\n✅ Smoke tests complete.")


def main():
    parser = argparse.ArgumentParser(description="Backlog.com API Wrapper")
    parser.add_argument("--action",
                        choices=["get_issue", "get_comments", "add_comment", "update_issue",
                                 "get_attachments", "download_images", "get_issue_with_images"],
                        help="API action to perform")
    parser.add_argument("--issue", help="Issue key (e.g., PROJ-123)")
    parser.add_argument("--config", default=".brain/backlog.json", help="Path to config file")
    parser.add_argument("--content", help="Comment content (for add_comment)")
    parser.add_argument("--status-id", type=int, help="Status ID (for update_issue)")
    parser.add_argument("--output-dir", default="Autocode/attachments",
                        help="Output directory for downloaded images")
    parser.add_argument("--template", help="Template name to use for comment")
    parser.add_argument("--data", help="JSON data for template variables")
    parser.add_argument("--test", action="store_true", help="Run smoke tests")
    parser.add_argument("--dry-run", action="store_true", help="Don't make real API calls")
    parser.add_argument("--output", choices=["json", "text"], default="json", help="Output format")

    args = parser.parse_args()

    if args.test:
        run_smoke_test(dry_run=args.dry_run)
        return

    if not args.action:
        parser.print_help()
        sys.exit(1)

    if not args.issue:
        print("ERROR: --issue is required", file=sys.stderr)
        sys.exit(1)

    try:
        client, config = create_client_from_config(args.config)

        if args.action == "get_issue":
            result = client.get_issue_summary(args.issue)
            print(json.dumps(result, indent=2, ensure_ascii=False))

        elif args.action == "get_comments":
            result = client.get_comments(args.issue)
            print(json.dumps(result, indent=2, ensure_ascii=False))

        elif args.action == "add_comment":
            if not args.content:
                print("ERROR: --content is required for add_comment", file=sys.stderr)
                sys.exit(1)
            result = client.add_comment(args.issue, args.content)
            print(json.dumps(result, indent=2, ensure_ascii=False))

        elif args.action == "update_issue":
            fields = {}
            if args.status_id:
                fields["statusId"] = args.status_id
            if not fields:
                print("ERROR: At least one field to update is required", file=sys.stderr)
                sys.exit(1)
            result = client.update_issue(args.issue, **fields)
            print(json.dumps(result, indent=2, ensure_ascii=False))

        elif args.action == "get_attachments":
            result = client.get_attachments(args.issue)
            print(json.dumps(result, indent=2, ensure_ascii=False))

        elif args.action == "download_images":
            downloaded = client.download_images(args.issue, args.output_dir)
            print(json.dumps(downloaded, indent=2, ensure_ascii=False))
            print(f"\n✅ Downloaded {len(downloaded)} image(s) to {args.output_dir}", file=sys.stderr)

        elif args.action == "get_issue_with_images":
            result = client.get_issue_with_images(args.issue, args.output_dir)
            # Return summary (not the full issue object to keep output clean)
            output = {
                "key": result["issue"].get("issueKey", args.issue),
                "title": result["issue"].get("summary", ""),
                "description": result["description"],
                "image_refs": result["image_refs"],
                "desc_image_refs": result["desc_image_refs"],
                "comment_image_refs": result["comment_image_refs"],
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
