---
description: Auto-fix bug from Google Sheets row (no Backlog dependency)
---

# WORKFLOW: /auto-bugfix-sheet - AI Bug Auto-Fix (Google Sheets Context)

Tai lieu nay mo ta workflow khi nguon bug context den tu Google Sheets thay vi Backlog.

---

## QUY TAC THUC THI BAT BUOC

1. Khong goi Backlog MCP tools (`get_issue`, `update_issue`, `add_issue_comment`, ...).
2. Khong dung `scripts/backlog_api.py` cho issue operations.
3. Neu can lay context tu sheet private, phai cau hinh Google auth hop le.
4. Dau ra bat buoc: code diff + ket qua test/check + commit + report markdown.

---

## GD 0: Config + Auth Detection

### 0.1. Config Check

Kiem tra `.brain/google_sheets.json`.

Vi du config (service account):

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

Lua chon auth:
- `service_account` (khuyen nghi cho automation)
- `oauth` (local interactive)

### 0.2. Capability Detection

```
Detect runtime capabilities:
1) Can read files / run Python helper?
2) Can modify codebase?
3) Can run tests/checks?

Set execution_mode:
  - "full": parse row + analyze + fix + test + commit + report
  - "analyze_only": parse row + analyze + report (no code change)
```

---

## GD 1: Fetch Bug Context Tu Google Sheets

### 1.1. Parse Input

Ho tro input:
- full Google Sheets URL
- `sheet_name` (tab)
- row selector: `row_number` hoac `bug_id`

### 1.2. Lay du lieu dong

Su dung helper script:

```bash
python3 scripts/sheets_api.py \
  --action get_row_context \
  --sheet-url "https://docs.google.com/spreadsheets/d/..." \
  --sheet-name "bugs" \
  --row-number 12 \
  --config .brain/google_sheets.json
```

Hoac theo bug id:

```bash
python3 scripts/sheets_api.py \
  --action get_row_context \
  --sheet-url "https://docs.google.com/spreadsheets/d/..." \
  --sheet-name "bugs" \
  --bug-id "BUG-123" \
  --config .brain/google_sheets.json
```

Output la normalized context object phuc vu bug analysis.

### 1.3. Validate Context

Bat buoc co toi thieu:
- `title`
- `description` hoac `steps_to_reproduce`
- `actual_result`

---

## GD 2: Analyze Root Cause

- doc context tu row
- scan codebase
- xac dinh root cause kha di
- danh gia pham vi anh huong

---

## GD 3: Implement Fix

### 3.1. Tao branch

Co the dung helper:

```bash
source scripts/git_ops.sh
create_branch "SHEET-BUG" "short-description"
```

### 3.2. Sua loi

- implement fix theo context
- uu tien thay doi nho, an toan

### 3.3. Validate

- chay test/check lint phu hop project

---

## GD 4: Commit + Report

### 4.1. Commit

```bash
source scripts/git_ops.sh
commit_changes "fix: resolve sheet bug context <bug_id_or_row>"
```

### 4.2. Report

Tao report markdown gom:
- input sheet reference (sheet + row/bug_id)
- root cause
- file thay doi
- test/check result
- commit hash

Co the tai su dung templates:
- `scripts/templates/client_report.md`
- `scripts/templates/client_summary.md`

---

## GD 5: Batch (Optional)

Xu ly nhieu row theo thu tu:
- fail-fast hoac continue-on-error tuy runtime policy
- luu ket qua tung row vao report tong hop

---

## Ghi chu quan trong

- Workflow nay bo qua toan bo phan Backlog sync/status/comment.
- Neu can access sheet private, phai share sheet cho service account hoac cau hinh OAuth hop le.
- Package nay chi ship workflow + scripts tham chieu; runtime/agent quyet dinh orchestration cu the.

