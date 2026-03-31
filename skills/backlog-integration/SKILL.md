---
name: backlog-integration
description: Backlog.com integration — MCP-first bug fix with helper scripts
---

# Backlog Integration Skill

## Tool Priority (MUST follow)

| Operation | Primary | Fallback |
|-----------|---------|----------|
| Fetch/update/comment issue | MCP `backlog-mcp-server` | `backlog_api.py --action get_issue_with_images` |
| Download images | `backlog_api.py --action download_images` | — |
| Parse issue URL/key | `url_parser.py` | manual regex |
| Git branch/worktree/commit | `git_ops.sh` | raw git CLI |
| Google Sheets context | `sheets_api.py` | — |

## Script Path Resolution

Scripts are installed inside the skill directory, NOT in the user's project.
**Always resolve the skill directory first before running any script.**

```bash
# Step 1: Find where skill was installed
# (run this once at the start of any workflow that uses scripts)
SKILL_DIR=$(find \
  "${HOME}/.claude/skills" \
  "${HOME}/.gemini/antigravity/skills" \
  "${HOME}/.cursor/skills" \
  "${HOME}/.codex/skills" \
  "${HOME}/.config/opencode/skills" \
  ".claude/skills" ".cursor/skills" ".codex/skills" ".agent/skills" \
  -name "backlog_api.py" -path "*/backlog-integration/scripts/*" \
  2>/dev/null | head -1 | xargs dirname)

if [ -z "$SKILL_DIR" ]; then
  echo "ERROR: backlog-integration skill not found. Run: npx backlog-integration install"
  exit 1
fi

echo "Skill scripts at: $SKILL_DIR"
```

Then use `$SKILL_DIR` for all script calls. Examples below assume `$SKILL_DIR` is set.

## Scripts Reference

### backlog_api.py — Image download only (MCP handles the rest)

```bash
# Download images
python3 "$SKILL_DIR/backlog_api.py" --action download_images \
  --issue PROJ-123 --output-dir reports/attachments/ --config .brain/backlog.json

# Fallback: full issue + images (only when MCP unavailable)
python3 "$SKILL_DIR/backlog_api.py" --action get_issue_with_images \
  --issue PROJ-123 --config .brain/backlog.json
```

### url_parser.py — Parse issue key or Backlog URL

```bash
python3 "$SKILL_DIR/url_parser.py" "PROJ-123"
python3 "$SKILL_DIR/url_parser.py" "https://myteam.backlog.com/view/PROJ-123"
# Output: {"space": "myteam.backlog.com", "issue_key": "PROJ-123"}
```

### git_ops.sh — Git helpers

```bash
source "$SKILL_DIR/git_ops.sh"

# Worktree (recommended — isolated)
create_worktree "PROJ-123" "cart-fix"       # → .worktrees/bugfix/PROJ-123-cart-fix
cleanup_worktree "PROJ-123" "cart-fix"      # remove after merge/PR
list_worktrees                               # show active worktrees
merge_worktree "PROJ-123" "cart-fix"        # merge into develop

# Branch (legacy)
create_branch "PROJ-123" "cart-fix"          # checkout -b bugfix/PROJ-123-cart-fix

# Common
commit_changes "PROJ-123" "fix: cart total NaN" --backlog-keywords
push_branch "origin" "bugfix/PROJ-123-cart-fix"
show_diff_summary
```

Protected branches (cannot push): main, master, develop, staging, production.

### sheets_api.py — Google Sheets bug context

```bash
python3 "$SKILL_DIR/sheets_api.py" --action get_row_context \
  --sheet-url "https://docs.google.com/spreadsheets/d/..." \
  --sheet-name "bugs" --row-number 12 --config .brain/google_sheets.json

# Or by bug ID
python3 "$SKILL_DIR/sheets_api.py" --action get_row_context \
  --sheet-url "..." --sheet-name "bugs" --bug-id "BUG-123" \
  --config .brain/google_sheets.json
```

Requires `.brain/google_sheets.json` with `google_auth_mode`, `google_service_account_json`, `column_mapping`.

## Templates

| Template | Purpose |
|----------|---------|
| `templates/fix_comment.md` | Backlog comment after fix (sections 4-5 optional for simple bugs) |
| `templates/analysis_comment.md` | Root cause analysis post |
| `templates/pr_description.md` | PR body |
| `templates/client_summary.md` | Client-facing summary (on request) |
| `templates/client_report.md` | Full technical report (on request) |

## Config Files

### .brain/backlog.json (required for Backlog workflow)

```json
{
  "backlog_space": "myteam.backlog.com",
  "backlog_api_key": "...",
  "project_key": "PROJ",
  "git_host": "github",
  "git_remote": "origin",
  "auto_branch": true,
  "auto_push": true,
  "report_lang": "vi"
}
```

Generate with: `npx backlog-integration setup --api-key "YOUR_KEY"`

### .brain/google_sheets.json (required for Sheets workflow)

```json
{
  "google_auth_mode": "service_account",
  "google_service_account_json": "/path/to/service-account.json",
  "default_sheet_name": "bugs",
  "column_mapping": {
    "bug_id": "Bug ID", "title": "Title", "description": "Description",
    "steps_to_reproduce": "Steps", "expected_result": "Expected",
    "actual_result": "Actual", "severity": "Severity", "priority": "Priority"
  }
}
```

### .brain/bugfix_state.json (auto-managed by workflow)

Tracks agent phase per issue for resume capability. See `workflows/auto-bugfix.md` for state lifecycle.

## Workflows

| Command | Source | Description |
|---------|--------|-------------|
| `/auto-bugfix PROJ-123` | `workflows/auto-bugfix.md` | Full Backlog bugfix flow |
| `/auto-bugfix-sheet` | `workflows/auto-bugfix-sheet.md` | Bugfix from Google Sheets row |

## Prerequisites

- Node.js 18+ · Git CLI
- Python 3.8+ with `requests` (for `backlog_api.py`)
- Python 3.8+ with `google-api-python-client` + `google-auth` (for `sheets_api.py`)
- `backlog-mcp-server` (recommended): `npm install -g backlog-mcp-server`
