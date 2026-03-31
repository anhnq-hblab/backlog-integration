---
description: Auto-fix bug from Google Sheets row (no Backlog dependency)
---

# /auto-bugfix-sheet — AI Bug Auto-Fix (Google Sheets Context)

## QUICK REFERENCE

```
GD0: Load .brain/google_sheets.json → detect capabilities
GD1: sheets_api.py get_row_context → validate required fields
GD2: Search codebase → root cause → CONFIDENCE GATE
GD3: create_branch → fix code → run tests
GD4: commit → generate report
GD5: (batch) process multiple rows sequentially
```

---

## EXECUTION RULES

1. Do NOT call Backlog MCP tools or `backlog_api.py` — this workflow has no Backlog dependency
2. Google auth must be configured for private sheets
3. Required outputs: code diff + test results + commit + markdown report

---

## GD 0: Init

### 0.1. Load Config

Read `.brain/google_sheets.json`. Required fields:

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

If missing → ask user to create config (see `examples/google_sheets.json.template`).

### 0.2. Detect Capabilities

```
Can read files / run Python?  → required
Can modify codebase?          → required for "full" mode
Can run tests?                → optional

Mode:
  "full": parse row + analyze + fix + test + commit + report
  "analyze_only": parse row + analyze + report (no code changes)
```

---

## GD 1: Fetch Bug Context

### 1.1. Parse Input

Required: Google Sheets URL + sheet name + row selector (`row_number` or `bug_id`).

### 1.2. Fetch Row

```bash
python3 scripts/sheets_api.py --action get_row_context \
  --sheet-url "https://docs.google.com/spreadsheets/d/..." \
  --sheet-name "bugs" --row-number 12 \
  --config .brain/google_sheets.json
```

Or by bug ID:
```bash
python3 scripts/sheets_api.py --action get_row_context \
  --sheet-url "..." --sheet-name "bugs" --bug-id "BUG-123" \
  --config .brain/google_sheets.json
```

### 1.3. Validate Context

Required fields (fail if missing):
- `title`
- `description` or `steps_to_reproduce`
- `actual_result`

### 1.4. Write Phase Summary

Compact summary (under 100 tokens):
```
Bug: BUG-123 — "Login button unresponsive on mobile"
Severity: High
Key info: onClick handler not attached on viewport < 768px
Module: auth/login
```

---

## GD 2: Root Cause Analysis

### Steps

1. Extract keywords from bug context (function names, error messages, UI elements)
2. Search codebase for keywords → top 5 relevant files
3. Read affected files, trace call chain
4. Write root cause summary (1-3 sentences)

### Output

```
root_cause: "Login.tsx:42 — onClick bound inside media query that excludes mobile viewport"
affected_files: ["src/components/Login.tsx", "src/styles/auth.css"]
confidence: HIGH | MEDIUM | LOW
```

### CONFIDENCE GATE

| Confidence | Action |
|------------|--------|
| **HIGH** | Proceed to GD 3 automatically |
| **MEDIUM** | Show analysis, ask user "Proceed?" |
| **LOW** | Show analysis, ask for guidance. Do NOT auto-fix |

---

## GD 3: Implement Fix

### 3.1. Create Branch

```bash
source scripts/git_ops.sh
create_branch "SHEET-12" "login-mobile-fix"
```

### 3.2. Fix Code

- Edit affected files — fix root cause
- Keep changes minimal

### 3.3. Validate

- Run project tests
- Run linter if available

| Result | Action |
|--------|--------|
| Tests pass | Proceed to GD 4 |
| Tests fail (related) | Fix once, retry |
| Tests fail (unrelated) | Note, proceed |

---

## GD 4: Commit + Report

### 4.1. Commit

```bash
source scripts/git_ops.sh
commit_changes "SHEET-12" "fix: login button responsive on mobile"
```

### 4.2. Generate Report

Fill `templates/client_summary.md` or `templates/fix_comment.md` with:
- Sheet reference (URL + row/bug_id)
- Root cause from GD 2
- Changed files from GD 3
- Test results
- Commit hash

Save to `reports/`.

---

## GD 5: Batch (Optional)

When processing multiple rows:

1. List rows to process, show summary table, ask user to confirm order
2. Process each row: GD 1 → GD 4
3. Clear context between rows (keep only summaries)
4. On failure: log error, continue to next (or fail-fast per user preference)
5. Show batch summary table at end

---

## Error Recovery

| Error | Action |
|-------|--------|
| Google auth fails | Check service account config, ask user |
| Sheet not accessible | Verify sheet is shared with service account |
| Row not found | Show available rows, ask user to reselect |
| Required fields missing | Show which fields, ask user to check sheet |
| Tests fail after fix | Retry fix once, then ask user |
| Confidence = LOW | Stop, report to user |
