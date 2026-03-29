---
description: Auto-fix bug from Backlog.com — workflow/spec for MCP-first agent environments
---

# WORKFLOW: /auto-bugfix - AI Bug Auto-Fix (Backlog Integration)

Tai lieu nay mo ta workflow mong muon cho agent environment co the doc va thuc thi markdown workflow.

Can phan biet ro:
- package `backlog-integration` hien chi cung cap CLI `install` va `setup`, cung voi cac script/tai lieu di kem
- workflow duoi day la operational spec cho tool/agent
- nhieu buoc phu thuoc vao MCP, subagent, worktree, git hosting, va kha nang cua runtime; CLI package khong tu minh orchestration toan bo flow nay

---

## QUY TAC THUC THI BAT BUOC (IMPORTANT)

De tranh runtime hieu sai va uu tien sai cong cu, ap dung thu tu bat buoc sau:

1. **MCP-first cho issue operations**
   - Neu co MCP backlog server, **bat buoc** dung MCP tools cho cac thao tac chinh: fetch issue, fetch comments, update issue, add comment.
   - Khong dung Python script lam duong chinh neu MCP da san sang.

2. **Python scripts chi la fallback/co tac vu phu tro**
   - `scripts/backlog_api.py` chi dung cho:
     - download attachments/images
     - fallback trong truong hop **khong co MCP** hoac MCP loi
   - `scripts/url_parser.py` la utility parser, khong phai backlog client thay the MCP.

3. **CLI package boundary**
   - Package `backlog-integration` khong orchestration full flow bugfix.
   - Workflow runtime/agent phai tu quyet dinh mode (`full` / `mcp_only` / `legacy`) theo capability detection.

4. **Execution priority matrix**

| Capability | Fetch/Update issue | Attachments/images |
|------------|--------------------|--------------------|
| MCP available | MCP tools (required) | `backlog_api.py --action download_images` (optional) |
| MCP unavailable | `backlog_api.py --action get_issue_with_images` | `backlog_api.py --action download_images` |

---

## GD 0: Config + Capability Detection

### 0.1. Config Check

Kiem tra `.brain/backlog.json`.

Neu chua co:
- co the chay `backlog-integration setup` de tao file co ban
- hoac guided setup trong tool neu runtime cua ban ho tro

Luu y ve package hien tai:
- `setup` chi ghi mot config object co ban
- `setup` khong merge voi config cu
- `setup` khong tu dien day du cac field nang cao trong tai lieu nay

Output co ban tu `setup` hien tai:

```json
{
  "backlog_space": "myteam.backlog.com",
  "backlog_api_key": "your-api-key",
  "project_key": "PROJ",
  "git_host": "github",
  "git_remote": "origin",
  "auto_branch": true,
  "auto_push": true,
  "log_template": "structured",
  "report_lang": "vi"
}
```

Neu runtime cua ban can them field nang cao nhu `execution_mode`, `review_layers`, `batch_concurrency`, hay `lazy_fetch`, can bo sung thu cong hoac de workflow/agent quan ly rieng.

### 0.2. Capability Detection

Phan nay la workflow-level behavior, khong duoc CLI package enforce.

```
Detect runtime capabilities:
1. MCP backlog server available?
2. Subagent support?
3. Git worktree support?

Set execution_mode:
  - "full": MCP + subagent + worktree
  - "mcp_only": MCP + sequential processing
  - "legacy": Python REST + sequential

Decision rule (strict):
  IF MCP available -> MUST use MCP for issue fetch/update/comment operations.
  IF MCP unavailable -> use Python REST fallback scripts.
```

### 0.3. State Resume Check

Neu runtime co su dung `.brain/bugfix_state.json`, co the resume theo issue.

Luu y:
- file state nay khong duoc CLI package tao hay quan ly
- day la quy uoc workflow de agent co the luu va doc lai state

Vi du:

```json
{
  "PROJ-123": {
    "backlog_status": "In Progress",
    "agent_phase": "review",
    "agent_status": "in_progress",
    "worktree": ".worktrees/bugfix/PROJ-123-cart-fix",
    "branch": "bugfix/PROJ-123-cart-fix",
    "started_at": "2026-03-26T10:00:00Z",
    "updated_at": "2026-03-26T10:15:00Z",
    "analysis": { "confidence": "HIGH", "root_cause_file": "src/cart.js" },
    "pr_url": null,
    "errors": []
  }
}
```

---

## GD 1: Fetch Bug Info

### 1.1. Parse Input

Ho tro input issue key hoac Backlog URL, vi du:

```bash
# optional parser utility
python3 scripts/url_parser.py "PROJ-123"
python3 scripts/url_parser.py "https://myteam.backlog.com/view/PROJ-123"
```

Neu >1 issue, runtime co the xu ly theo batch mode.

Luu y quan trong:
- parser utility nay khong thay the MCP issue client
- neu MCP co san, issue data van phai lay qua MCP tools

### 1.2. Fetch tu Backlog

**Neu co MCP:**
- bat buoc dung MCP tools nhu `get_issue`, `get_issue_comments`, `update_issue`, `add_issue_comment`
- khong dung `scripts/backlog_api.py --action get_issue_with_images` khi MCP healthy

**Neu can binary attachments:**
- dung `scripts/backlog_api.py --action download_images`

**Neu khong co MCP:**
- co the fallback bang `scripts/backlog_api.py --action get_issue_with_images`

Neu MCP tam thoi loi:
- retry MCP theo policy cua runtime
- chi fallback Python khi retry that bai hoac MCP unavailable

Luu y:
- package nay ship script Python va workflow reference
- package khong tu thuc hien fetch issue trong qua trinh `install` hoac `setup`

### 1.3. AI Doc Screenshots

Buoc nay chi kha thi neu runtime co image/file viewing.

### 1.4. Hien thi tom tat

Workflow co the tong hop: issue key, title, priority, description, screenshots, comments count.

---

## GD 2: Phan Tich Nguyen Nhan

Phan nay la logic cua agent/workflow:
- doc description, comments, screenshots
- search codebase
- xac dinh root cause
- danh gia pham vi anh huong

CLI package khong cung cap bo may phan tich; no chi ship tai lieu va script phu tro.

---

## GD 3: Auto-Fix

### 3.1. Tao Worktree hoac Branch

Co the dung helper:

```bash
source scripts/git_ops.sh
create_worktree "PROJ-123" "short-description"
create_branch "PROJ-123" "short-description"
```

### 3.2. Implement Fix

Phan implement fix phu thuoc vao tool/agent dang chay workflow.

### 3.3. Update issue status

Neu runtime co MCP, workflow co the dong bo status issue sang `In Progress`.

Luu y:
- `update_issue(...)` khong nam trong CLI package nay
- do la MCP capability cua environment

---

## GD 3.5: Review

Neu runtime co subagent hoac co quy trinh review rieng, workflow co the review sau khi fix:
- code quality
- test coverage
- architecture impact

Day la logic workflow/spec. Package khong co bo review tu dong built-in.

---

## GD 4: Git / PR

Workflow co the:
- commit
- push
- tao PR
- merge

Package chi ship `git_ops.sh` de ho tro mot so thao tac git. Phan tao PR hay thao tac voi git host can phu thuoc runtime/tool khac.

---

## GD 5: Log ve Backlog

Neu runtime co MCP, workflow co the:
- them comment
- update status issue

Neu khong co MCP, co the can implementation bo sung ngoai package nay.

---

## GD 6: Report

Package co ship cac template markdown:
- `scripts/templates/analysis_comment.md`
- `scripts/templates/fix_comment.md`
- `scripts/templates/client_report.md`
- `scripts/templates/client_summary.md`
- `scripts/templates/pr_description.md`

Workflow co the dung cac template nay de dien noi dung, nhung package khong tu dong render report trong luc `install` hoac `setup`.

---

## GD 7: Batch

Xu ly batch la behavior o muc workflow/runtime.

Package hien tai:
- khong co bo dieu phoi batch trong CLI
- chi cung cap tai lieu va utility scripts de workflow co the tham chieu

---

## Ghi chu quan trong

- Neu ban can tai lieu phan anh chinh xac package hien tai, uu tien README.
- Neu ban can mo ta workflow van hanh mong muon cho agent environment, dung file nay.
- Khi README va workflow spec khac nhau, hay hieu rang README mo ta implementation package, con file nay mo ta cach workflow co the hoat dong trong mot runtime day du capability.
