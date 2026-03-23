---
name: backlog-integration
description: Backlog.com integration via MCP Server (primary) + REST API (fallback) for bug fetching, analysis logging, and issue management
---

# Backlog Integration Skill

## Mục đích
Skill này cung cấp 2 phương thức tích hợp với Backlog.com:
1. **MCP Mode (Primary)** — Gọi tools trực tiếp qua backlog-mcp-server (nhanh, structured)
2. **REST Mode (Fallback)** — Python scripts gọi REST API v2 (backup, image download)

Hỗ trợ:
- **Fetch** bug/issue details từ Backlog
- **Parse** URL hoặc issue key thành structured data
- **Git** operations: branch, commit, push với safety guards
- **Log** structured comments (root cause, solution, impact) lên Backlog
- **Report** tạo báo cáo cho khách hàng (full report hoặc summary)
- **PR** management qua MCP Git tools

## Khi nào sử dụng
- Khi user gọi `/bugfix` hoặc `/auto-bugfix` workflow
- Khi cần fetch issue info từ Backlog
- Khi cần post structured comment lên Backlog issue

## Prerequisites
- **MCP Mode**: `backlog-mcp-server` installed (`npm install -g backlog-mcp-server`)
- **REST Mode**: Python 3.8+ với `requests` library
- Git CLI
- File `.brain/backlog.json` đã setup (xem schema tại `~/.gemini/antigravity/schemas/backlog_config.schema.json`)

---

## Mode Selection Logic

```
Khi cần gọi Backlog API:
1. CHECK: MCP server có available không?
   → CÓ: Dùng MCP tools (get_issue, add_issue_comment, etc.)
   → KHÔNG: Fallback sang Python REST scripts

2. ĐẶC BIỆT: Image/attachment download
   → LUÔN dùng Python REST (MCP không hỗ trợ attachment download)
```

---

## MCP Mode (Primary) — backlog-mcp-server

### Setup
MCP server đã cài global: `backlog-mcp-server`

Cấu hình qua env vars (đọc từ `.brain/backlog.json`):
```bash
source ~/.gemini/antigravity/skills/backlog-integration/scripts/mcp_backlog.sh
mcp_config_check    # Show config + MCP JSON
mcp_export_env      # Export env vars
```

Hoặc thêm vào MCP settings (Antigravity/Cursor):
```json
{
  "mcpServers": {
    "backlog": {
      "command": "backlog-mcp-server",
      "env": {
        "BACKLOG_DOMAIN": "your-domain.backlog.com",
        "BACKLOG_API_KEY": "your-api-key",
        "OPTIMIZE_RESPONSE": "1",
        "MAX_TOKENS": "10000",
        "ENABLE_TOOLSETS": "space,project,issue,git"
      }
    }
  }
}
```

### Available MCP Tools

| Action | MCP Tool | Thay thế cho |
|--------|----------|--------------|
| Fetch issue detail | `get_issue(issueIdOrKey)` | `backlog_api.py --action get_issue` |
| List issues | `get_issues(projectId, ...)` | — |
| Get comments | `get_issue_comments(issueIdOrKey)` | `backlog_api.py --action get_comments` |
| Add comment | `add_issue_comment(issueIdOrKey, content)` | `backlog_api.py --action add_comment` |
| Update issue | `update_issue(issueIdOrKey, statusId, ...)` | `backlog_api.py --action update_issue` |
| Get project info | `get_project(projectIdOrKey)` | — |
| List projects | `get_project_list()` | — |
| Get PR list | `get_pull_requests(projectIdOrKey, repoIdOrName)` | — |
| Create PR | `add_pull_request(projectIdOrKey, repoIdOrName, ...)` | `gh pr create` |
| Get priorities | `get_priorities()` | — |
| Get issue types | `get_issue_types(projectIdOrKey)` | — |

### Workflow Mapping (MCP)

**GĐ 1 — Fetch Bug Info:**
```
# Thay vì:
# python3 backlog_api.py --action get_issue_with_images --issue PROJ-123

# Dùng MCP:
get_issue(issueIdOrKey: "PROJ-123")
get_issue_comments(issueIdOrKey: "PROJ-123")

# Image download vẫn dùng Python:
python3 backlog_api.py --action download_images --issue PROJ-123 --output-dir Autocode/attachments
```

**GĐ 5 — Log Results:**
```
# Thay vì:
# python3 backlog_api.py --action add_comment --issue PROJ-123 --content "..."

# Dùng MCP:
add_issue_comment(issueIdOrKey: "PROJ-123", content: "## 🤖 AI Bug Analysis Report\n...")
update_issue(issueIdOrKey: "PROJ-123", statusId: 3)
```

**GĐ 4.5 — Create PR (Backlog Git):**
```
# Thay vì gh pr create hoặc curl:
add_pull_request(
  projectIdOrKey: "PROJ",
  repoIdOrName: "my-repo",
  summary: "[PROJ-123] fix: description",
  description: "Root cause + Solution",
  base: "develop",
  branch: "bugfix/PROJ-123-desc"
)
```

---

## REST Mode (Fallback) — Python Scripts

### Scripts

#### 1. `scripts/backlog_api.py`
Backlog REST API v2 wrapper.

**Actions:**
```bash
# Fetch issue details
python3 scripts/backlog_api.py --action get_issue --issue PROJ-123 --config .brain/backlog.json

# Fetch issue comments
python3 scripts/backlog_api.py --action get_comments --issue PROJ-123 --config .brain/backlog.json

# Post a comment
python3 scripts/backlog_api.py --action add_comment --issue PROJ-123 --content "Comment text" --config .brain/backlog.json

# Update issue status
python3 scripts/backlog_api.py --action update_issue --issue PROJ-123 --status-id 3 --config .brain/backlog.json

# Download issue images (MCP cannot do this!)
python3 scripts/backlog_api.py --action download_images --issue PROJ-123 --output-dir Autocode/attachments --config .brain/backlog.json

# Full issue + images (combined)
python3 scripts/backlog_api.py --action get_issue_with_images --issue PROJ-123 --config .brain/backlog.json

# Smoke test (no real API calls)
python3 scripts/backlog_api.py --test --dry-run
```

#### 2. `scripts/url_parser.py`
Parse user input (issue key or URL) into structured data.

**Usage:**
```bash
python3 scripts/url_parser.py "PROJ-123"
python3 scripts/url_parser.py "https://myteam.backlog.com/view/PROJ-123"
python3 scripts/url_parser.py --test
```

#### 3. `scripts/git_ops.sh`
Git operations với safety guards.

**Usage:**
```bash
source scripts/git_ops.sh
create_branch "PROJ-123" "cart-total-bug"
commit_changes "PROJ-123" "fix: recalculate cart total"
push_branch "origin" "bugfix/PROJ-123-cart-total-bug"
```

#### 4. `scripts/mcp_backlog.sh`
MCP server wrapper — start/stop/config.

**Usage:**
```bash
source scripts/mcp_backlog.sh
mcp_config_check    # Validate config + show MCP JSON
mcp_export_env      # Export env vars for MCP server
mcp_start           # Start MCP server
mcp_stop            # Stop MCP server
mcp_status          # Check server status
```

---

## Templates

| Template | File | Purpose |
|----------|------|---------|
| Analysis | `scripts/templates/analysis_comment.md` | Root cause analysis comment cho Backlog |
| Fix | `scripts/templates/fix_comment.md` | Solution + git reference comment cho Backlog |
| Full Report | `scripts/templates/client_report.md` | AS-IS → TO-BE report cho khách hàng |
| Summary | `scripts/templates/client_summary.md` | Quick summary table cho email/chat |

### Template Variables
Các templates sử dụng `{{variable}}` placeholders:

| Variable | Description |
|----------|-------------|
| `{{issue_key}}` | Backlog issue key (e.g., PROJ-123) |
| `{{title}}` | Issue title |
| `{{root_cause}}` | Root cause description |
| `{{solution}}` | Solution description |
| `{{affected_files}}` | List of affected files |
| `{{branch}}` | Git branch name |
| `{{pr_link}}` | Pull request URL |
| `{{commit_hash}}` | Commit SHA |
| `{{severity}}` | Bug severity emoji |
| `{{scope}}` | Impact scope |
| `{{risk}}` | Risk level |
| `{{test_status}}` | Test results |
| `{{date}}` | Current date |

---

## Tích hợp với AWF

| Workflow | Tích hợp |
|----------|----------|
| `/bugfix`, `/auto-bugfix` | Core workflow — MCP get_issue + add_comment + REST download_images + **cross-project impact check** |
| `/report` | Generate full client report từ bug fix context |
| `/init` | Setup `.brain/backlog.json` khi init project |
| `/save-brain` | Lưu bug fix history vào brain context |

### Cross-Project Impact Check (GĐ 2.2.1)
Sau khi phân tích root cause, AI tự động:
1. Scan workspace tìm related projects (BE, LP-FE, etc.)
2. Search BE cho code liên quan (validation, API, schema)
3. Output: bảng impact check + giải thích nếu BE không cần fix

---

## Best Practices

### ✅ DO:
- Ưu tiên MCP mode khi có thể (nhanh hơn 5-10x)
- Luôn dùng `env:` prefix cho API key trong config
- Confirm trước khi push code
- Review AI analysis trước khi fix
- Test code sau khi fix

### ❌ DON'T:
- Không hardcode API key trong config file
- Không push trực tiếp lên main/master
- Không skip dev review cho complex bugs
- Không auto-push khi chưa chạy tests
