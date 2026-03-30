# backlog-integration

[![npm version](https://img.shields.io/npm/v/backlog-integration.svg)](https://www.npmjs.com/package/backlog-integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

CLI installer package cho skill `backlog-integration` và workflow `auto-bugfix` dùng với các AI coding tools.

Package này hiện tập trung vào 2 việc:
- cài skill + workflow vào đúng thư mục của tool
- tạo `.brain/backlog.json` từ thông tin auto-detect được

Package này không trực tiếp thực thi toàn bộ flow bugfix end-to-end. Các phần như MCP orchestration, subagent review, state resume, push/PR/log/report nằm ở mức workflow/spec và phụ thuộc vào môi trường chạy thực tế của tool/agent.

Hỗ trợ: **Antigravity** · **Claude Code** · **Cursor** · **Codex** · **OpenCode**

## Tính năng hiện có

- **Multi-tool installer** cho nhiều AI tools
- **Interactive wizard** khi chưa truyền đủ `--tool` hoặc `--location`
- **Project config setup** với auto-detect từ git remote
- **Copy workflow markdown** vào thư mục workflow/command tương ứng của tool
- **Bundle scripts** cho parsing URL, git helpers, và REST image download

## Yêu cầu

- **Node.js** >= 18
- **Git CLI**
- **Python 3.8+** với `requests` nếu bạn dùng `scripts/backlog_api.py`
- **Python 3.8+** với `google-api-python-client` + `google-auth` nếu bạn dùng `scripts/sheets_api.py`
- (Khuyến nghị) [`backlog-mcp-server`](https://www.npmjs.com/package/backlog-mcp-server) nếu workflow của bạn dùng MCP

```bash
npm install -g backlog-mcp-server
```

## Cài đặt

### Bước 1: Install skill + workflows

```bash
# Interactive
npx backlog-integration install

# Non-interactive
npx backlog-integration install --tool antigravity --location global
npx backlog-integration install --tool cursor --location project-local
npx backlog-integration install --tool all --location global
```

Interactive wizard dùng `Space` để chọn, `↑↓` để di chuyển, `←` để quay lại, `→` hoặc `Enter` để tiếp tục.

### Bước 2: Setup config cho project

```bash
cd your-project

npx backlog-integration setup
npx backlog-integration setup --api-key "YOUR_BACKLOG_API_KEY"
```

`setup` hiện tại sẽ:
- detect `git_host` từ git remote
- detect `backlog_space` từ remote URL nếu là Backlog
- detect `project_key` từ remote branches hoặc tên thư mục
- ghi file `.brain/backlog.json`
- thêm `.brain/` vào `.gitignore` nếu file `.gitignore` đã tồn tại

## Hành vi ghi đè cần lưu ý

### Khi chạy `install`

- Skill tại thư mục đích sẽ bị xóa và copy lại từ package.
- Workflow `.md` cùng tên sẽ bị ghi đè bằng bản mới.
- Workflow cũ không trùng tên sẽ không bị xóa.
- `.brain/backlog.json` không bị tác động.

Điều này có nghĩa là cập nhật bằng:

```bash
npx backlog-integration@latest install
```

sẽ cập nhật skill/workflow, nhưng không cập nhật config project của bạn.

### Khi chạy `setup` lại

`setup` hiện tại không merge với config cũ. Nó tạo object config mới từ detect/default rồi ghi đè toàn bộ `.brain/backlog.json`.

Hệ quả:
- nếu không truyền lại `--api-key`, `backlog_api_key` sẽ quay về chuỗi rỗng
- các field nâng cao bạn tự thêm trước đó có thể bị mất
- các custom chỉnh tay không nằm trong object mặc định sẽ không được giữ lại

Nếu bạn đã chỉnh `.brain/backlog.json` thủ công, hãy backup trước khi chạy lại `setup`.

## `.brain/backlog.json`

Output mặc định hiện tại của lệnh `setup`:

```json
{
  "backlog_space": "your-team.backlog.com",
  "backlog_api_key": "",
  "project_key": "PROJ",
  "git_host": "github",
  "git_remote": "origin",
  "auto_branch": true,
  "auto_push": true,
  "log_template": "structured",
  "report_lang": "vi"
}
```

| Field | Mô tả | Nguồn |
|-------|-------|-------|
| `backlog_space` | Domain Backlog | Detect từ remote URL, fallback default |
| `backlog_api_key` | API key Backlog | Chỉ có khi truyền `--api-key`, nếu không là rỗng |
| `project_key` | Mã project | Detect từ remote branches hoặc tên thư mục |
| `git_host` | `github` / `gitlab` / `backlog` | Detect từ remote URL, fallback `github` |
| `git_remote` | Git remote name | Cố định là `origin` |
| `auto_branch` | Cờ mặc định cho workflow/spec | Ghi sẵn bởi `setup` |
| `auto_push` | Cờ mặc định cho workflow/spec | Ghi sẵn bởi `setup` |
| `log_template` | Format log mặc định | Ghi sẵn bởi `setup` |
| `report_lang` | Ngôn ngữ report | Ghi sẵn bởi `setup` |

## Công cụ được hỗ trợ

| Công cụ | Skills path | Workflows path |
|---------|-------------|----------------|
| Antigravity | `~/.gemini/antigravity/skills/` | `~/.gemini/antigravity/global_workflows/` |
| Claude Code | `~/.claude/skills/` | `~/.claude/commands/` |
| Cursor | `~/.cursor/skills/` | `~/.cursor/commands/` |
| Codex | `~/.codex/skills/` | `~/.codex/workflows/` |
| OpenCode | `~/.config/opencode/skills/` | `~/.config/opencode/workflows/` |

Project-local:

| Công cụ | Skills path | Workflows path |
|---------|-------------|----------------|
| Antigravity | `.agent/skills/` | `.agent/workflows/` |
| Claude Code | `.claude/skills/` | `.claude/commands/` |
| Cursor | `.cursor/skills/` | `.cursor/commands/` |
| Codex | `.codex/skills/` | `.codex/workflows/` |
| OpenCode | `.opencode/skills/` | `.opencode/workflows/` |

## Thành phần được cài đặt

Khi chạy `install`, package hiện cài:

- `SKILL.md`
- toàn bộ thư mục `scripts/`
- các file `.md` trong thư mục repo `workflows/`

Lưu ý:
- thư mục `examples/` có trong package source nhưng không được copy vào thư mục cài đặt
- workflow được copy như file markdown; việc tool có nạp và chạy đúng command hay không còn phụ thuộc vào tool đó

## Workflow và capability ở mức spec

Repo có tài liệu workflow `auto-bugfix` và skill reference mô tả các khả năng như:
- MCP-first issue handling
- state resume qua `.brain/bugfix_state.json`
- worktree/subagent review nhiều lớp
- auto comment, update issue, PR, report

Các mục này nên được hiểu là:
- hướng dẫn vận hành cho agent/tooling
- capability mong muốn của workflow
- không phải toàn bộ đều được CLI package này tự thực thi

## Scripts đi kèm

| File | Vai trò hiện tại |
|------|------------------|
| `scripts/backlog_api.py` | REST helper cho image download và fallback `get_issue_with_images` |
| `scripts/sheets_api.py` | Google Sheets helper để đọc bug context theo `row_number` hoặc `bug_id` |
| `scripts/url_parser.py` | Parse issue key / Backlog URL |
| `scripts/git_ops.sh` | Helper cho worktree/branch/commit/push |
| `scripts/mcp_backlog.sh` | Script hỗ trợ MCP cũ, hiện được ghi chú là deprecated |

## Google Sheets mode (không dùng Backlog)

Ngoài workflow Backlog, package có thể ship workflow đọc context bug từ Google Sheets:

- `workflows/auto-bugfix-sheet.md`
- `scripts/sheets_api.py`

Flow mục tiêu:
1. User paste Google Sheet link + sheet/tab + row selector (`row_number` hoặc `bug_id`)
2. Runtime đọc row thành context chuẩn hóa
3. Agent phân tích bug + sửa code
4. Report + commit code (không update Backlog)

### Cấu hình auth cho Google Sheets

Tạo file `.brain/google_sheets.json` (tham khảo `skills/backlog-integration/examples/google_sheets.json.template`):

```json
{
  "google_auth_mode": "service_account",
  "google_service_account_json": "/absolute/path/to/service-account.json",
  "default_sheet_name": "bugs",
  "column_mapping": {
    "bug_id": "Bug ID",
    "title": "Title",
    "description": "Description",
    "steps_to_reproduce": "Steps",
    "expected_result": "Expected",
    "actual_result": "Actual",
    "severity": "Severity",
    "priority": "Priority",
    "module": "Module",
    "attachments": "Attachments",
    "notes": "Notes"
  }
}
```

Lưu ý:
- Chế độ `service_account` phù hợp automation.
- Cần share Google Sheet cho email service account để đọc được dữ liệu private.
- `setup` hiện tại chỉ tạo `.brain/backlog.json`; file Google Sheets config cần tự tạo thủ công.

## Sử dụng sau khi cài

Sau khi install + setup xong, workflow trong tool của bạn có thể dùng các lệnh kiểu:

```text
/auto-bugfix PROJ-123
/auto-bugfix https://your-team.backlog.com/view/PROJ-123
```

Nhưng cần phân biệt:
- package này chỉ cài skill/workflow/config
- việc command có chạy được hay không phụ thuộc vào tool đích và cách tool đó thực thi workflow markdown

## CLI Reference

```text
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

## Phát triển local

```bash
git clone https://github.com/anhnq-hblab/backlog-integration.git
cd backlog-integration
npm link

backlog-integration install
backlog-integration setup

npm unlink -g backlog-integration
```

## Cập nhật

```bash
npx backlog-integration@latest install
```

Kỳ vọng đúng với version hiện tại:
- skill sẽ được thay bằng bản mới
- workflow cùng tên sẽ được cập nhật
- config `.brain/backlog.json` không đổi
- nếu muốn regenerate config thì phải chạy `setup`, và việc đó có thể ghi đè config cũ

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
