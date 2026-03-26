# backlog-integration

[![npm version](https://img.shields.io/npm/v/backlog-integration.svg)](https://www.npmjs.com/package/backlog-integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Skill tích hợp [Backlog.com](https://backlog.com) cho AI coding tools — tự động fetch bug → phân tích → fix code → push → tạo PR → log kết quả lên Backlog.

Hỗ trợ: **Antigravity** · **Claude Code** · **Cursor** · **Codex** · **OpenCode**

## Tính năng

- 🔌 **MCP-first** — Ưu tiên dùng `backlog-mcp-server`, fallback REST API khi cần
- 🤖 **Auto-bugfix workflow** — Từ issue key đến PR chỉ 1 lệnh `/auto-bugfix`
- 🔍 **Auto-detect config** — Tự nhận diện `git_host`, `backlog_space`, `project_key` từ git remote
- 📦 **Multi-tool installer** — Cài skill + workflow cho 1 hoặc nhiều AI tools cùng lúc
- 🌳 **Worktree isolation** — Fix bug trong git worktree riêng, không ảnh hưởng branch chính
- 📝 **Template system** — Report, comment, PR description theo template chuẩn
- 🔄 **Batch mode** — Fix nhiều bug cùng lúc

## Yêu cầu

- **Node.js** ≥ 18
- **Git CLI**
- **Python 3.8+** với `requests` (cho REST API fallback & image download)
- (Khuyến nghị) [`backlog-mcp-server`](https://www.npmjs.com/package/backlog-mcp-server):

```bash
npm install -g backlog-mcp-server
```

## Cài đặt

### Bước 1: Install skill + workflows

```bash
# Interactive — chọn tool và location bằng wizard
npx backlog-integration install

# Non-interactive — chỉ định tool và location
npx backlog-integration install --tool antigravity --location global
npx backlog-integration install --tool cursor --location project-local
npx backlog-integration install --tool all --location global
```

**Interactive wizard** sử dụng `Space` để chọn, `↑↓` di chuyển, `←` quay lại, `→` hoặc `Enter` để tiếp tục.

### Bước 2: Setup config cho project

```bash
cd your-project

# Auto-detect config từ git remote
npx backlog-integration setup

# Hoặc truyền API key luôn
npx backlog-integration setup --api-key "YOUR_BACKLOG_API_KEY"
```

Setup tự động:
- ✅ Detect `git_host` (github / gitlab / backlog) từ git remote URL
- ✅ Detect `backlog_space` từ Backlog domain trong remote URL
- ✅ Detect `project_key` từ branch names
- ⚠️ `backlog_api_key` — lấy thủ công từ **Profile → API Settings** trên Backlog

Config được lưu tại `.brain/backlog.json` và tự thêm `.brain/` vào `.gitignore`.

### Phát triển local

```bash
git clone https://github.com/anhnq-hblab/backlog-integration.git
cd backlog-integration
npm link

# Giờ có thể dùng CLI trực tiếp
backlog-integration install
backlog-integration setup

# Gỡ link
npm unlink -g backlog-integration
```

## Sử dụng

Sau khi install + setup xong, trong AI tool gõ:

```
/auto-bugfix PROJ-123
/auto-bugfix https://your-team.backlog.com/view/PROJ-123
/auto-bugfix PROJ-123 PROJ-456 PROJ-789    # batch mode
```

AI sẽ tự động: **Fetch bug** → **Đọc screenshots** → **Phân tích root cause** → **Fix code** → **Push** → **Tạo PR** → **Log lên Backlog** → **Tạo report**.

## Cấu hình

### `.brain/backlog.json`

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

| Field | Mô tả | Auto-detect |
|-------|--------|:-----------:|
| `backlog_space` | Domain Backlog (VD: `hblab.backlogtool.com`) | ✅ |
| `backlog_api_key` | API key từ Backlog Profile → API Settings | ❌ |
| `project_key` | Mã project trên Backlog (VD: `HBU1895`) | ✅ |
| `git_host` | `github` / `gitlab` / `backlog` | ✅ |
| `git_remote` | Git remote name | Mặc định: `origin` |
| `auto_branch` | Tự tạo branch `bugfix/*` | Mặc định: `true` |
| `auto_push` | Tự push sau khi fix | Mặc định: `true` |
| `log_template` | Format log: `structured` | Mặc định: `structured` |
| `report_lang` | Ngôn ngữ report: `vi` / `en` / `ja` | Mặc định: `vi` |

### Cấu hình nâng cao (trong `.brain/backlog.json`)

| Field | Type | Mặc định | Mô tả |
|-------|------|----------|-------|
| `execution_mode` | string | `"auto"` | `auto` / `full` / `mcp_only` / `legacy` |
| `review_layers` | array | tất cả | `code_quality`, `test_coverage`, `architecture` |
| `review_max_iterations` | int | `2` | Số lần re-fix tối đa |
| `review_skip_for` | string | `null` | Bỏ review cho confidence level |
| `report_auto` | bool | `false` | Tự động tạo report |
| `comment_format` | string | `"auto"` | `auto` / `full` / `short` |
| `pr_format` | string | `"auto"` | `auto` / `short` / `full` |
| `batch_concurrency` | int | `2` | Số issue xử lý song song |
| `batch_priority_order` | bool | `true` | Sắp xếp batch theo priority |
| `lazy_fetch` | bool | `true` | Fetch data khi cần |

## Execution Modes

Workflow tự động phát hiện capabilities và chọn mode phù hợp:

| Mode | MCP | Subagent | Worktree | Khi nào |
|------|:---:|:--------:|:--------:|---------|
| **full** | ✅ | ✅ | ✅ | Cursor, Antigravity |
| **mcp_only** | ✅ | ❌ | ❌ | Cline, Windsurf basic |
| **legacy** | ❌ | ❌ | ❌ | ChatGPT, Claude web, không có MCP |

## Công cụ được hỗ trợ

| Công cụ | Skills path | Workflows path |
|---------|-------------|----------------|
| Antigravity | `~/.gemini/antigravity/skills/` | `~/.gemini/antigravity/global_workflows/` |
| Claude Code | `~/.claude/skills/` | `~/.claude/commands/` |
| Cursor | `~/.cursor/skills/` | `~/.cursor/workflows/` |
| Codex | `~/.codex/skills/` | `~/.codex/workflows/` |
| OpenCode | `~/.config/opencode/skills/` | `~/.config/opencode/workflows/` |

## Thành phần được cài đặt

### Skills (`skills/backlog-integration/`)

| File | Mô tả |
|------|-------|
| `SKILL.md` | Hướng dẫn & architecture reference cho AI |
| `scripts/backlog_api.py` | REST API client — image download & legacy fallback |
| `scripts/url_parser.py` | Parse issue key / URL từ Backlog |
| `scripts/git_ops.sh` | Git operations — worktree, branch, commit, push |
| `scripts/mcp_backlog.sh` | MCP server launcher |
| `scripts/templates/` | Templates cho comment, report, PR description |
| `examples/` | Config templates & sample bugfix report |

### Templates

| Template | File | Mục đích |
|----------|------|----------|
| Analysis comment | `analysis_comment.md` | Root cause analysis trên Backlog |
| Fix comment | `fix_comment.md` | Code fix + git reference trên Backlog |
| Client report | `client_report.md` | AS-IS / TO-BE report đầy đủ |
| Client summary | `client_summary.md` | Tóm tắt cho email/chat |
| PR description | `pr_description.md` | Mô tả Pull Request |

### Workflows

| File | Command | Mô tả |
|------|---------|-------|
| `auto-bugfix.md` | `/auto-bugfix` | Full auto-bugfix workflow |

## CLI Reference

```
backlog-integration <command> [options]

Commands:
  install     Install skill + workflows vào AI tool directories
  setup       Tạo .brain/backlog.json với config auto-detected
  help        Hiển thị help

Options:
  --tool          claude-code | claude | cursor | codex | antigravity | opencode | all
  --location      global | project-local | project | local
  --project-path  Project root cho project-local installs hoặc setup (mặc định: cwd)
  --dest          Override thư mục cài đặt
  --api-key       Backlog API key (cho lệnh setup)
```

## Cập nhật

```bash
npx backlog-integration@latest install
```

> **Lưu ý:** Config `.brain/backlog.json` không bị ảnh hưởng khi cập nhật.

## Development

```bash
# Run tests
npm test

# Verify trước khi publish
npm run release:check

# Bump version + publish
npm version patch
npm publish --access public
```

## License

[MIT](https://opensource.org/licenses/MIT)
