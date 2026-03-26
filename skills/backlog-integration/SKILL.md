---
name: backlog-integration
description: Backlog.com integration — MCP-first with REST fallback, multi-layer review, worktree isolation, state management
---

# Backlog Integration Skill

## Architecture

```
MCP backlog-mcp-server (PRIMARY)
  ├── get_issue, get_issue_comments, add_issue_comment, update_issue
  ├── get_issues, get_priorities, get_issue_types
  ├── add_pull_request, get_pull_requests
  └── get_project, get_project_list

Python REST (SUPPLEMENT — image download only)
  └── backlog_api.py --action download_images | get_issue_with_images

Git Operations
  ├── git_ops.sh: create_worktree, cleanup_worktree, commit_changes, push_branch
  └── url_parser.py: parse issue key / URL
```

## Execution Modes

Workflow auto-detects capabilities and selects the best mode:

| Mode | MCP | Subagent | Worktree | When |
|------|-----|----------|----------|------|
| **full** | Yes | Yes | Yes | Cursor, Antigravity |
| **mcp_only** | Yes | No | No | Cline, Windsurf basic |
| **legacy** | No | No | No | ChatGPT, Claude web, no MCP |

Set explicitly in `.brain/backlog.json`:
```json
{ "execution_mode": "auto" }
```

## When to Use
- User calls `/bugfix` or `/auto-bugfix`
- Fetching issue info from Backlog
- Posting structured comments to Backlog issues
- Batch processing multiple defects

## Prerequisites
- **MCP Mode**: `backlog-mcp-server` installed (`npm install -g backlog-mcp-server`)
- **Legacy Mode**: Python 3.8+ with `requests`
- Git CLI
- `.brain/backlog.json` configured

---

## MCP Tools Reference

| Action | MCP Tool | Replaces |
|--------|----------|----------|
| Fetch issue | `get_issue(issueIdOrKey)` | ~~backlog_api.py --action get_issue~~ |
| List issues | `get_issues(projectId, ...)` | — |
| Get comments | `get_issue_comments(issueIdOrKey)` | ~~backlog_api.py --action get_comments~~ |
| Add comment | `add_issue_comment(issueIdOrKey, content)` | ~~backlog_api.py --action add_comment~~ |
| Update issue | `update_issue(issueIdOrKey, statusId, ...)` | ~~backlog_api.py --action update_issue~~ |
| Get project | `get_project(projectIdOrKey)` | — |
| List projects | `get_project_list()` | — |
| Get PR list | `get_pull_requests(projectIdOrKey, repoIdOrName)` | — |
| Create PR | `add_pull_request(projectIdOrKey, repoIdOrName, ...)` | `gh pr create` |
| Get priorities | `get_priorities()` | — |
| Get issue types | `get_issue_types(projectIdOrKey)` | — |

MCP config:
```json
{
  "mcpServers": {
    "backlog": {
      "command": "backlog-mcp-server",
      "env": {
        "BACKLOG_DOMAIN": "your-domain.backlog.com",
        "BACKLOG_API_KEY": "your-api-key",
        "OPTIMIZE_RESPONSE": "1",
        "MAX_TOKENS": "5000",
        "ENABLE_TOOLSETS": "issue,git"
      }
    }
  }
}
```

Token optimization: set `MAX_TOKENS` to 5000 (sufficient for most issues), enable only needed toolsets.

---

## Python Scripts (Supplement)

### `scripts/backlog_api.py` — Image Downloader

MCP does not support binary attachment downloads. This script handles image/screenshot downloading only.

```bash
# Download issue images
python3 scripts/backlog_api.py --action download_images \
  --issue PROJ-123 --output-dir reports/attachments --config .brain/backlog.json

# Legacy fallback: full issue + images (when MCP unavailable)
python3 scripts/backlog_api.py --action get_issue_with_images \
  --issue PROJ-123 --config .brain/backlog.json

# Smoke test
python3 scripts/backlog_api.py --test --dry-run
```

### `scripts/url_parser.py` — Input Parser

```bash
python3 scripts/url_parser.py "PROJ-123"
python3 scripts/url_parser.py "https://myteam.backlog.com/view/PROJ-123"
```

### `scripts/git_ops.sh` — Git Operations

```bash
source scripts/git_ops.sh

# Worktree (recommended — isolated workspace)
create_worktree "PROJ-123" "cart-total-bug"
cleanup_worktree "PROJ-123" "cart-total-bug"
list_worktrees
merge_worktree "PROJ-123" "cart-total-bug" "develop"

# Legacy branch
create_branch "PROJ-123" "cart-total-bug"

# Common
commit_changes "PROJ-123" "fix: recalculate cart total"
push_branch "origin" "bugfix/PROJ-123-cart-total-bug"
```

---

## Workflow Phases

| Phase | Full Mode | MCP-Only | Legacy |
|-------|-----------|----------|--------|
| GD 0: Config | Config + detect + state resume | Config + detect | Config only |
| GD 1: Fetch | MCP + lazy loading | MCP | Python REST |
| GD 2: Analyze | Root cause + cross-project | Same | Same |
| GD 3: Fix | Subagent in worktree | Agent fix direct | Agent fix direct |
| GD 3.5: Review | 3 parallel subagents | Sequential self-review | Confidence gate |
| GD 4: Git | Worktree commit/push, ask PR/merge | Branch commit/push | Branch commit/push |
| GD 5: Log | MCP add_comment + update_issue | MCP | Python REST |
| GD 6: Report | Template population | Same | Same |
| GD 7: Batch | Parallel subagents + worktrees | Sequential loop | Sequential loop |

---

## State Management

File: `.brain/bugfix_state.json`

Tracks per-issue state for resume after interruption:
- `agent_phase`: fetch / analyze / fix / review / push / pr_created / logged / blocked
- `agent_status`: in_progress / approved / completed / blocked
- `backlog_status`: synced at fix start (statusId: 2) and completion (statusId: 3)
- `worktree`: path to worktree (full mode)
- `branch`: git branch name
- `pr_url`: PR link after creation
- `errors`: error log for failed phases

---

## Multi-Layer Review

Config in `.brain/backlog.json`:
```json
{
  "review_layers": ["code_quality", "test_coverage", "architecture"],
  "review_max_iterations": 2,
  "review_skip_for": "LOW"
}
```

| Layer | Subagent (full) | Self-review (mcp_only/legacy) |
|-------|----------------|-------------------------------|
| Code Quality | `principal-engineer` | Role-play senior reviewer |
| Test Coverage | `qa-engineer` | Role-play QA engineer |
| Architecture | `solution-architect` | Role-play architect |

Gate: ALL pass → continue. Warnings → continue + attach to PR. Failures → re-fix (max iterations). Critical → block.

---

## Token Optimization

| Strategy | How |
|----------|-----|
| MCP response limits | `MAX_TOKENS=5000`, `OPTIMIZE_RESPONSE=1` |
| Lazy loading | Fetch comments/images only when needed |
| Context pruning | Summary notes after each phase, drop raw data |
| Template reduction | Short format for simple bugs, full for complex |
| Batch budget | Triage first, process by priority, concurrency limit |
| Caching | Issue summaries cached in state file |

Estimated savings: 50-65% token reduction vs current approach.

---

## Templates

| Template | File | Purpose |
|----------|------|---------|
| Analysis | `scripts/templates/analysis_comment.md` | Root cause analysis comment |
| Fix | `scripts/templates/fix_comment.md` | Solution + git reference comment |
| Full Report | `scripts/templates/client_report.md` | AS-IS / TO-BE client report |
| Summary | `scripts/templates/client_summary.md` | Quick summary for email/chat |
| PR | `scripts/templates/pr_description.md` | Pull request description |

---

## Config Reference (`.brain/backlog.json`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `backlog_space` | string | required | Backlog domain |
| `backlog_api_key` | string | required | API key |
| `project_key` | string | required | Project key |
| `git_host` | string | required | backlog / github / gitlab |
| `execution_mode` | string | "auto" | auto / full / mcp_only / legacy |
| `review_layers` | array | all 3 | code_quality, test_coverage, architecture |
| `review_max_iterations` | int | 2 | Max re-fix attempts |
| `review_skip_for` | string | null | Skip review for confidence level |
| `report_auto` | bool | false | Auto-generate reports |
| `comment_format` | string | "auto" | auto / full / short |
| `pr_format` | string | "auto" | auto / short / full |
| `batch_concurrency` | int | 2 | Max parallel batch issues |
| `batch_priority_order` | bool | true | Sort batch by priority |
| `lazy_fetch` | bool | true | Fetch data only when needed |
