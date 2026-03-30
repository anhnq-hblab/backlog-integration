---
name: backlog-integration
description: Backlog.com integration — installer package, workflow references, and helper scripts
---

# Backlog Integration Skill

## What This Skill Actually Provides

Trong repo/package hien tai, skill nay cung cap:
- `SKILL.md` de agent tham chieu
- `scripts/` cho URL parsing, git helpers, va Backlog REST image download
- workflow markdown `auto-bugfix`
- workflow markdown `auto-bugfix-sheet` (Google Sheets context, no Backlog)
- CLI installer de copy skill/workflow vao cac AI tools

Skill/package nay khong tu minh dam nhan toan bo orchestration bugfix end-to-end. Cac kha nang nhu MCP issue handling, state resume, subagent review, PR creation, hay report automation phu thuoc vao runtime va tool dang su dung.

## Architecture Boundary

```text
CLI package (implemented here)
  ├── install: copy SKILL.md + scripts + workflows
  ├── setup: generate .brain/backlog.json
  └── detect: git_host, backlog_space, project_key

Helper scripts (implemented here)
  ├── scripts/url_parser.py
  ├── scripts/git_ops.sh
  └── scripts/backlog_api.py

Workflow/spec layer (documented here, runtime-dependent)
  ├── MCP tools: get_issue, update_issue, add_issue_comment, ...
  ├── subagent execution/review
  ├── state file management
  └── PR/log/report orchestration
```

## Prerequisites

- Node.js 18+
- Git CLI
- Python 3.8+ với `requests` neu dung `backlog_api.py`
- `backlog-mcp-server` neu runtime cua ban can MCP
- `.brain/backlog.json` neu workflow can thong tin Backlog

## CLI Behavior You Can Rely On

### `install`

`install` se:
- xoa thu muc skill dich va copy lai tu package
- copy workflow `.md` vao thu muc workflow/command cua tool
- ghi de file workflow cung ten neu da ton tai

`install` se khong:
- merge custom files trong thu muc skill dich
- xoa cac workflow cu khac ten
- sua `.brain/backlog.json`

### `setup`

`setup` se:
- detect `git_host`, `backlog_space`, `project_key`
- tao lai `.brain/backlog.json`

`setup` se khong:
- merge config cu
- giu lai advanced fields da them tay
- giu `backlog_api_key` neu khong truyen lai `--api-key`

## Helper Scripts

### `scripts/backlog_api.py`

Vai tro hien tai:
- download binary attachments/images tu Backlog
- co fallback `get_issue_with_images` cho mot so tinh huong khong co MCP

Khong nen xem script nay la client day du thay cho MCP trong moi tinh huong.

### `scripts/sheets_api.py`

Vai tro hien tai:
- doc bug context tu Google Sheets theo `row_number` hoac `bug_id`
- map row sang normalized object de agent phan tich/sua bug
- ho tro auth `service_account` (khuyen nghi)

Luu y:
- can cau hinh `.brain/google_sheets.json`
- can share sheet cho service account email neu sheet private

### `scripts/url_parser.py`

Parse:
- `PROJ-123`
- `https://myteam.backlog.com/view/PROJ-123`

### `scripts/git_ops.sh`

Ship cac helper nhu:
- `create_worktree`
- `cleanup_worktree`
- `create_branch`
- `commit_changes`
- `push_branch`
- `merge_worktree`

Day la helper script; runtime co dung hay khong phu thuoc workflow cua tool.

## Workflow-Level Capabilities

Tai lieu trong repo co mo ta cac capability sau:
- MCP-first fetch/update issue
- execution modes: `full`, `mcp_only`, `legacy`
- state management qua `.brain/bugfix_state.json`
- multi-layer review
- batch processing
- report/template generation
- Google Sheets row-context bugfix mode (khong dung Backlog)

Nhung can hieu rang:
- day la operational guidance cho agent
- package nay khong enforce hay guarantee cac capability do
- kha nang thuc thi phu thuoc vao environment ho tro MCP, subagent, image viewing, git hosting, va command execution

## Config Reference

`setup` hien tai tao config co ban:

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

Neu workflow cua ban can them field nang cao, hay bo sung thu cong va tranh chay lai `setup` neu chua backup config cu.

## Recommended Reading Order

1. `README.md` cho package behavior thuc te
2. `workflows/auto-bugfix.md` cho workflow/spec
3. `workflows/auto-bugfix-sheet.md` cho workflow doc bug context tu Google Sheets
3. `scripts/` neu can hieu utility cu the
