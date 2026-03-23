# backlog-integration

Skill tích hợp Backlog.com cho AI coding tools (Antigravity, Claude Code, Cursor, Codex, OpenCode).

## Cài đặt

### 1. Install skill + workflows

```bash
# Interactive — chọn tool và location
npx backlog-integration install

# Non-interactive
npx backlog-integration install --tool antigravity --location global
npx backlog-integration install --tool all --location global
```

### 2. Setup config cho project

```bash
cd your-project

# Auto-detect config từ git remote (chỉ cần thêm API key)
npx backlog-integration setup

# Hoặc truyền API key luôn
npx backlog-integration setup --api-key "YOUR_BACKLOG_API_KEY"
```

Setup sẽ:
- ✅ Tự detect `git_host` (github/gitlab/backlog) từ git remote
- ✅ Tự detect `backlog_space` từ Backlog URL
- ✅ Tự detect `project_key` từ branch names
- ⚠️ `backlog_api_key` — lấy từ **Profile → API Settings** trên Backlog

Config được lưu tại `.brain/backlog.json` (tự thêm vào `.gitignore`).

## Công cụ được hỗ trợ

| Công cụ | Skills | Workflows |
|---------|--------|-----------|
| Antigravity | `~/.gemini/antigravity/skills/` | `~/.gemini/antigravity/global_workflows/` |
| Claude Code | `~/.claude/skills/` | `~/.claude/commands/` |
| Cursor | `~/.cursor/skills/` | `~/.cursor/workflows/` |
| Codex | `~/.codex/skills/` | `~/.codex/workflows/` |
| OpenCode | `~/.config/opencode/skills/` | `~/.config/opencode/workflows/` |

## Thành phần được cài đặt

**Skills:**
- `SKILL.md` — Hướng dẫn sử dụng cho AI
- `scripts/` — backlog_api.py, url_parser.py, git_ops.sh, mcp_backlog.sh
- `scripts/templates/` — Templates cho comments, reports, PR descriptions

**Workflows:**
- `auto-bugfix.md` — Workflow `/auto-bugfix` tự động fix bug từ Backlog

## Chức năng

- **Fetch** bug/issue details từ Backlog.com (MCP hoặc REST API)
- **Parse** URL hoặc issue key thành structured data
- **Git** operations: branch, commit, push với safety guards
- **Log** structured comments (root cause, solution, impact) lên Backlog
- **Report** tạo báo cáo cho khách hàng
- **PR** management qua MCP Git tools

## Release & Publish

```bash
npm test                    # Run tests
npm run release:check       # Verify trước khi publish
npm version patch           # Bump version
npm publish --access public # Publish
```
