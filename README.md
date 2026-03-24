# backlog-integration

Skill tích hợp Backlog.com cho AI coding tools (Antigravity, Claude Code, Cursor, Codex, OpenCode).

Tự động: fetch bug → phân tích → fix code → push → log kết quả lên Backlog.

## Prerequisites

- **Node.js** ≥ 18
- **Python 3.8+** với `requests` library (cho REST API fallback)
- **Git CLI**
- (Khuyến nghị) `backlog-mcp-server`: `npm install -g backlog-mcp-server`

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

Setup sẽ tự động:
- ✅ Detect `git_host` (github/gitlab/backlog) từ git remote
- ✅ Detect `backlog_space` từ Backlog URL
- ✅ Detect `project_key` từ branch names
- ⚠️ `backlog_api_key` — lấy từ **Profile → API Settings** trên Backlog

Config được lưu tại `.brain/backlog.json` (tự thêm vào `.gitignore`).

### Cấu trúc `.brain/backlog.json`

```json
{
  "backlog_space": "your-team.backlog.com",
  "backlog_api_key": "YOUR_API_KEY",
  "project_key": "PROJ",
  "git_host": "github",
  "git_remote": "origin",
  "auto_branch": true,
  "auto_push": true,
  "log_template": "structured",
  "report_lang": "vi"
}
```

| Field | Mô tả | Auto-detect? |
|-------|--------|:---:|
| `backlog_space` | Domain Backlog (VD: `hblab.backlogtool.com`) | ✅ |
| `backlog_api_key` | API key từ Backlog Profile → API Settings | ❌ Manual |
| `project_key` | Mã project trên Backlog (VD: `HBU1895`) | ✅ |
| `git_host` | `github` / `gitlab` / `backlog` | ✅ |
| `git_remote` | Git remote name | Default `origin` |
| `auto_branch` | Tự tạo branch `bugfix/*` | Default `true` |
| `auto_push` | Tự push sau khi fix | Default `true` |
| `report_lang` | Ngôn ngữ report: `vi` / `en` / `ja` | Default `vi` |

## Cập nhật

```bash
# Cập nhật lên version mới nhất
npx backlog-integration@latest install
```

> **Lưu ý:** Config `.brain/backlog.json` không bị ảnh hưởng khi cập nhật.

## Sử dụng

Sau khi install + setup xong, trong AI tool gõ:

```
/auto-bugfix PROJ-123
/auto-bugfix https://your-team.backlog.com/view/PROJ-123
/auto-bugfix PROJ-123 PROJ-456 PROJ-789    # batch mode
```

AI sẽ tự động: Fetch bug → Đọc screenshots → Phân tích root cause → Fix code → Push → Tạo PR → Log lên Backlog → Tạo report.

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

## Release & Publish

```bash
npm test                    # Run tests
npm run release:check       # Verify trước khi publish
npm version patch           # Bump version
npm publish --access public # Publish
```
