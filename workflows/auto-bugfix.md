---
description: Auto-fix bug from Backlog.com — MCP-first agent workflow
---

# /auto-bugfix — AI Bug Auto-Fix (Backlog Integration)

## QUICK REFERENCE

```
GD0: Load .brain/backlog.json → detect MCP + subagent → check state resume
GD1: Parse input → get_issue → check attachments count → get_comments ∥ download_images
     → ANALYZE images: extract error text, UI elements, visual diff → build keyword list
GD2: Search codebase → identify root cause → write summary → CONFIDENCE GATE
     (full mode: parallel search subagents)
GD3: create_worktree → implement fix → run tests → update state
GD3.5: Review — 3 parallel subagents: code quality ∥ test ∥ architecture
GD4: commit → push → create PR → update state
GD5: MCP add_comment ∥ update_issue (parallel MCP calls)
GD6: Fill report template → save to reports/
GD7: (batch) Triage → parallel subagents in worktrees (max concurrency from config)
```

`∥` = parallel when subagent/concurrent calls available, sequential otherwise.

---

## EXECUTION RULES

### Tool Priority

| Operation | Primary | Fallback (MCP unavailable) |
|-----------|---------|---------------------------|
| Fetch/update issue | MCP tools (required) | `backlog_api.py --action get_issue_with_images` |
| Download images | `backlog_api.py --action download_images` | same |
| Parse URL/key | `url_parser.py` | manual regex |
| Git operations | `git_ops.sh` helpers | raw git CLI |

**Rule:** If MCP is available, MUST use MCP for issue operations. Never use Python script as primary when MCP is healthy.

### Execution Modes

```
IF MCP + subagent + worktree → mode = "full"
IF MCP only                  → mode = "mcp_only"
IF no MCP                    → mode = "legacy"
```

---

## GD 0: Init

### 0.1. Load Config

Read `.brain/backlog.json`. Required fields:

```json
{
  "backlog_space": "myteam.backlog.com",
  "backlog_api_key": "...",
  "project_key": "PROJ",
  "git_host": "github",
  "git_remote": "origin",
  "auto_branch": true,
  "auto_push": true,
  "report_lang": "vi"
}
```

If missing → run `npx backlog-integration setup` or ask user.

### 0.2. Resolve Skill Directory

**Do this before any script call.** Scripts are in the skill install dir, NOT in the user's project.

```bash
SKILL_DIR=$(find \
  "${HOME}/.claude/skills" \
  "${HOME}/.gemini/antigravity/skills" \
  "${HOME}/.cursor/skills" \
  "${HOME}/.codex/skills" \
  "${HOME}/.config/opencode/skills" \
  ".claude/skills" ".cursor/skills" ".codex/skills" ".agent/skills" \
  -name "backlog_api.py" -path "*/backlog-integration/scripts/*" \
  2>/dev/null | head -1 | xargs dirname)

[ -z "$SKILL_DIR" ] && echo "ERROR: skill not found. Run: npx backlog-integration install" && exit 1
```

Use `$SKILL_DIR` for all script calls in this workflow.

### 0.3. Detect Capabilities

Check:
1. MCP backlog server available? → try a lightweight MCP call
2. Subagent support? → check runtime capability
3. Git worktree support? → `git worktree list`

Set `execution_mode` accordingly.

### 0.3. State Resume

Read `.brain/bugfix_state.json`. If issue already has state:
- Resume from `agent_phase` (skip completed phases)
- Log: "Resuming {issue_key} from phase {agent_phase}"

If no state file or issue not found → start fresh.

**Output:** `execution_mode`, config loaded, resume point (if any)

---

## GD 1: Fetch Bug Info

### 1.1. Parse Input

```bash
python3 "$SKILL_DIR/url_parser.py" "PROJ-123"
# or
python3 "$SKILL_DIR/url_parser.py" "https://myteam.backlog.com/view/PROJ-123"
```

If multiple issues → go to GD 7 (Batch).

### 1.2. Phased Fetch (Lazy Loading)

**Phase A — Summary only:**
```
MCP: get_issue(issueIdOrKey) → title, description, priority, status
```

Read description. Decide:
- Description clearly describes the bug with specific error/location → Phase A is sufficient
- Description vague or references comments → go to Phase B
- Description contains `#image()` refs → go to Phase C after B

**Phase B+C — Comments and Images:**

**IMPORTANT: Always check for attachments, not just `#image()` refs.**
Backlog issues with screenshots often have attachments listed separately without `#image()` in the description.
Check: `description contains #image()` OR `issue has attachments count > 0`.

If both comments and images are needed, run them in parallel:

```
┌─ mode: full (subagent available) ──────────────────────────┐
│                                                             │
│  Subagent 1: MCP get_issue_comments(issueIdOrKey,          │
│              count=10, order="desc")                        │
│                                          ← run parallel    │
│  Subagent 2: python3 "$SKILL_DIR/backlog_api.py"            │
│              --action download_images --issue PROJ-123      │
│              --output-dir reports/attachments/              │
│              --config .brain/backlog.json                   │
│                                                             │
│  Wait for both → merge results                             │
└─────────────────────────────────────────────────────────────┘

┌─ mode: mcp_only / legacy (no subagent) ────────────────────┐
│  Step B: MCP get_issue_comments (or Python fallback)       │
│  Step C: download_images (if attachments > 0)              │
└─────────────────────────────────────────────────────────────┘
```

### 1.4. Image Analysis (when images downloaded)

**DO NOT skip this step if images were downloaded.** For UI/frontend bugs especially, screenshots often contain more precise information than the description.

Analyze each downloaded image and extract:

```
For each image:
1. ERROR MESSAGES — exact text of any error popup, toast, alert
2. UI ELEMENTS — component names, button labels, dropdown options visible
3. URLs/routes — any URL visible in browser address bar
4. BEFORE/AFTER — if multiple images, identify which shows expected vs actual
5. KEY DIFFERENCES — if comparing screenshots, list specific differences

Output format (feed directly into GD 2 as search keywords):
{
  "extracted_keywords": ["suspended", "contract_suspended", "Managed by", "OEM Admin"],
  "error_messages": ["Your account has been suspended. Please contact admin."],
  "ui_elements": ["Managed by dropdown", "Organization Admin form"],
  "routes": ["/admin/users/create", "/admin/users/123/edit"],
  "visual_diff": "Create form shows [OEM Admin, Agency Admin]; Edit form shows [Agency Admin] only"
}
```

**Why this matters:** Exact error text → direct grep for i18n keys. Component names → faster file search. Visual diff → confirms root cause before coding.

If runtime cannot view images (no multimodal support):
- Skip image analysis
- Note in state: `"images_analyzed": false, "reason": "no multimodal support"`
- Rely on description/comments for keywords only

### 1.3. Write Phase Summary

Summarize to compact format (keep under 200 tokens). Include image analysis output if available:

```
Issue: PROJ-123 — "Cart total wrong when discount > 100%"
Priority: High
Description hint: discount calculation error
Images: 2 screenshots
  → error_text: "NaN" in cart total display
  → ui_elements: [CartSummary, DiscountInput]
  → visual_diff: "Normal discount shows correct total; 100% discount shows NaN"
  → search_keywords: ["cart", "discount", "NaN", "CartSummary", "DiscountInput"]
Comments: QA confirmed reproducible on staging (comment #5)
images_analyzed: true
```

**Write state:**
```json
{
  "PROJ-123": {
    "agent_phase": "fetch",
    "agent_status": "completed",
    "started_at": "...",
    "updated_at": "..."
  }
}
```

---

## GD 2: Root Cause Analysis

### Steps (mode: mcp_only / legacy — sequential)

1. **Build keyword list** from ALL available sources (in priority order):
   - Image analysis output (if `images_analyzed: true`) → use `extracted_keywords` + `error_messages` + `ui_elements` first
   - Bug description: function names, error messages, file paths, UI element names
   - Comments: QA reproduction steps, dev notes
   - Example for HBU1895-1281: `["contract_suspended", "suspended", "Managed by", "editParentRoles", "ORGANIZATION_ADMIN"]` — most came from screenshots

2. **Search codebase:** grep keywords → identify top 5 relevant files
3. **Read affected files:** trace the call chain from entry point to bug location
4. **Cross-check with visual diff** (if available): confirm root cause matches what screenshots show
5. **Identify root cause:** write 1-3 sentence explanation
6. **Assess scope:** list all files that may need changes

### Steps (mode: full — parallel search subagents)

When subagent is available, split search into parallel tracks:

```
┌─ Subagent A: Image-derived keywords ───────────────────────┐
│  Input: extracted_keywords + error_messages from GD 1.4    │
│  grep exact error text, i18n keys, component names         │
│  → top 3 candidate files                                   │
│  (skip if images_analyzed: false)                          │
└─────────────────────────────────────────────────────────────┘
┌─ Subagent B: Description/comment keywords ─────────────────┐
│  grep function names, file paths from description/comments  │
│  → top 3 candidate files                                   │
└─────────────────────────────────────────────────────────────┘
┌─ Subagent C: Recent changes search ────────────────────────┐
│  git log --since="2 weeks" for affected area               │
│  → recent commits that may have introduced the bug         │
└─────────────────────────────────────────────────────────────┘

Wait all → merge unique candidate files → read + trace → root cause
Cross-check: root cause should explain the visual diff from screenshots
```

This reduces GD 2 wall time by ~60% for complex bugs with multiple search signals.
Subagent A (image keywords) typically finds the deepest leads for UI/frontend bugs.

### Output — Write to State

```json
{
  "PROJ-123": {
    "agent_phase": "analyze",
    "agent_status": "completed",
    "analysis": {
      "root_cause": "discount_calculator.js:47 — divides by (1 - discount_rate) without checking rate >= 1.0",
      "affected_files": ["src/cart/discount_calculator.js", "src/cart/cart_total.js"],
      "confidence": "HIGH",
      "scope": "narrow"
    }
  }
}
```

### CONFIDENCE GATE

| Confidence | Action |
|------------|--------|
| **HIGH** | Proceed to GD 3 automatically |
| **MEDIUM** | Show analysis to user, ask "Proceed with fix?" — wait for confirmation |
| **LOW** | Show analysis to user, explain uncertainty, ask for guidance. Do NOT auto-fix |

---

## GD 3: Auto-Fix

### 3.1. Create Worktree (or Branch)

```bash
source "$SKILL_DIR/git_ops.sh"

# Preferred — isolated worktree
create_worktree "PROJ-123" "cart-discount-fix"

# Fallback — standard branch (if worktree not supported)
create_branch "PROJ-123" "cart-discount-fix"
```

### 3.2. Implement Fix

1. Navigate to worktree path (if using worktree)
2. Edit affected files — fix the root cause identified in GD 2
3. Keep changes minimal and focused on the bug
4. Do NOT refactor surrounding code or add unrelated improvements

### 3.4. Validate

1. Run project tests: `npm test` / `pytest` / project-specific test command
2. Run linter if available
3. Verify the fix addresses the root cause

| Test Result | Action |
|-------------|--------|
| All pass | Proceed to GD 3.5 |
| Tests fail (related to fix) | Fix the failing tests, retry once |
| Tests fail (unrelated) | Note pre-existing failures, proceed |
| No test suite | Proceed with warning |

### 3.5. Write State

```json
{
  "PROJ-123": {
    "agent_phase": "fix",
    "agent_status": "completed",
    "worktree": ".worktrees/bugfix/PROJ-123-cart-discount-fix",
    "branch": "bugfix/PROJ-123-cart-discount-fix"
  }
}
```

---

## GD 3.5: Review

### Mode: full (3 parallel review subagents)

```
┌─ Subagent: Code Quality ───────────────────────────────────┐
│  Role: senior-reviewer                                     │
│  Input: diff from GD 3 + root cause from GD 2             │
│  Check:                                                    │
│   - Fix addresses root cause (not just symptoms)           │
│   - No regression risk                                     │
│   - Edge cases handled (null, empty, boundary)             │
│   - No hardcoded values or magic numbers                   │
│  Output: PASS / WARN(reason) / FAIL(reason)                │
└─────────────────────────────────────────────────────────────┘
┌─ Subagent: Test Adequacy ──────────────────────────────────┐
│  Role: qa-engineer                                         │
│  Input: diff + test results from GD 3.4                    │
│  Check:                                                    │
│   - Existing tests still pass                              │
│   - New test added for bug scenario                        │
│   - Edge case from root cause is covered                   │
│  Output: PASS / WARN(missing tests) / FAIL(tests broken)  │
└─────────────────────────────────────────────────────────────┘
┌─ Subagent: Architecture Impact ────────────────────────────┐
│  Role: solution-architect                                  │
│  Input: diff + affected files list                         │
│  Check:                                                    │
│   - Changes scoped to affected files only                  │
│   - No API contract changes (unless intentional)           │
│   - No database migration needed                           │
│  Output: PASS / WARN(broad scope) / FAIL(breaking change)  │
└─────────────────────────────────────────────────────────────┘

Wait all → merge results into review_result
```

### Mode: mcp_only / legacy (sequential self-review)

Check all items as a single agent, in order:

- [ ] Fix addresses the root cause (not just symptoms)
- [ ] No regression risk to existing functionality
- [ ] Edge cases handled (null, empty, boundary values)
- [ ] No hardcoded values or magic numbers introduced
- [ ] Existing tests still pass
- [ ] New test added for the bug scenario (if test suite exists)
- [ ] Changes are scoped to affected files only
- [ ] No API contract changes (unless intentional)
- [ ] No database migration needed

### Review Gate

| Result | Action |
|--------|--------|
| All PASS | Proceed to GD 4 |
| Any WARN | Proceed, attach warnings to PR description |
| Any FAIL | Go back to GD 3.3, fix issues (max 1 retry) |
| Critical / multiple FAIL | Stop, report to user |

---

## GD 4: Git + PR

### 4.1. Commit

```bash
source "$SKILL_DIR/git_ops.sh"
commit_changes "PROJ-123" "fix: resolve cart total NaN when discount >= 100%" --backlog-keywords
```

Commit message format: `fix: <concise description> (#issue_key)`

### 4.2. Push

```bash
push_branch "origin" "bugfix/PROJ-123-cart-discount-fix"
```

### 4.3. Create PR

Use git host CLI (`gh`, `glab`, or Backlog MCP):

```bash
# GitHub
gh pr create --title "fix: PROJ-123 cart total NaN" --body "$(cat <<'EOF'
## Bug Fix: PROJ-123

**Root Cause:** discount_calculator.js divides by (1-rate) without bounds check
**Fix:** Add guard clause for discount_rate >= 1.0
**Testing:** Unit tests added + existing tests pass

Closes PROJ-123
EOF
)"
```

For Backlog Git hosting:
```
MCP: add_pull_request(projectIdOrKey, repoIdOrName, ...)
```

### 4.4. Write State

```json
{
  "PROJ-123": {
    "agent_phase": "pr_created",
    "agent_status": "approved",
    "pr_url": "https://github.com/org/repo/pull/42",
    "branch": "bugfix/PROJ-123-cart-discount-fix"
  }
}
```

---

## GD 5: Log to Backlog

### 5.1. Prepare Fix Comment

Fill template `scripts/templates/fix_comment.md`. **Audience: comtor, PM, client — NOT developers.**

**Audience: comtor, PM, khách hàng — KHÔNG phải developer.**

### NEVER include in the comment:
- File names: ~~`ja.json`, `auth.service.ts`, `useUserUpdate.tsx`~~
- Code keys: ~~`editor.blocks.footerStepForm`, `contractStatus`, `editParentRoles`~~
- Line numbers: ~~`auth.service.ts:105`~~
- Code snippets: ~~`if (contractStatus !== ACTIVE) throw...`~~
- Technical jargon: ~~"i18n key", "enum", "REST endpoint", "hook", "service layer"~~

If the root cause is technical (missing translation key, wrong enum value, etc.) → describe the **symptom and business impact**, not the technical detail.

### Field mapping — plain language:

| Field | ❌ Technical (wrong) | ✅ Plain (correct) |
|-------|---------------------|-------------------|
| `root_cause_plain` | "Missing `editor.blocks.footerStepForm` in ja.json" | "Giao diện tiếng Nhật thiếu bản dịch cho tên của Navigation Block, dẫn đến hiển thị sai ngôn ngữ" |
| `root_cause_plain` | "`auth.service.ts:105` throws `contract_suspended` for CANCELED" | "Hệ thống không phân biệt tài khoản bị tạm khóa vs đã hủy, hiển thị sai thông báo" |
| `affected_area` | "`useUserUpdate.tsx`, `admin_fe`" | "Form chỉnh sửa Org Admin" |
| `solution_plain` | "Added `contract_canceled` i18n key, branched enum check" | "Thêm thông báo riêng cho tài khoản đã hủy và bổ sung lựa chọn còn thiếu trong dropdown" |
| `scope_plain` | "2 files changed in backend + admin_fe" | "Hẹp — chỉ ảnh hưởng màn hình đăng nhập và form quản lý user" |
| `risk_plain` | "Low regression risk on enum branch" | "Thấp — chỉ thay đổi text hiển thị, không ảnh hưởng logic nghiệp vụ" |

### Example — HBU1895-803 (i18n bug):

```markdown
## 1. Nguyên Nhân
Giao diện tiếng Nhật của Navigation Block trong sidebar bị hiển thị sai:
tên các nút bị trộn lẫn tiếng Anh và tiếng Nhật, hoặc hiển thị cùng một tên
cho tất cả các nút thay vì tên riêng biệt.

> *(Khu vực bị ảnh hưởng: Sidebar chỉnh sửa Navigation Block — trang Step Form LP)*

## 2. Giải Pháp
Bổ sung bản dịch tiếng Nhật còn thiếu cho các nút trong Navigation Block
và cập nhật tên tiếng Anh đúng theo thiết kế.
Sau fix, sidebar sẽ hiển thị đúng tên theo từng ngôn ngữ.

## 3. Ảnh Hưởng
- **Phạm vi:** Hẹp — chỉ ảnh hưởng phần sidebar của Navigation Block
- **Rủi ro:** Thấp — chỉ thay đổi text hiển thị, không ảnh hưởng chức năng
- **Side effects:** Không có
```

**Simple bug optimization:** Bỏ section 5 (Cross-Project) và 6 (Estimate) khi `scope = "narrow"` và `confidence = "HIGH"`.

### 5.2. Post to Backlog (parallel MCP calls)

These two MCP calls are independent — run them in parallel:

```
MCP call 1: add_issue_comment(issueIdOrKey, content)    ← fix comment
MCP call 2: update_issue(issueIdOrKey, statusId=3)      ← Resolved
```

If runtime doesn't support parallel tool calls, run sequentially (comment first, then status).

### 5.3. Write State

```json
{
  "PROJ-123": {
    "agent_phase": "logged",
    "agent_status": "completed"
  }
}
```

---

## GD 6: Report

Generate report only when:
- User explicitly requests it, OR
- Config has `"report_auto": true`

### Templates Available

| Template | When to use |
|----------|-------------|
| `fix_comment.md` | Always — posted to Backlog in GD 5 |
| `analysis_comment.md` | When user asks for detailed analysis |
| `pr_description.md` | Used in GD 4 for PR body |
| `client_summary.md` | When user requests client-facing report |
| `client_report.md` | When user requests full technical report |

Save generated reports to `reports/{issue_key}/`.

---

## GD 7: Batch Mode

When input contains multiple issue keys.

### 7.1. Triage

```
MCP: get_issues(projectIdOrKey=..., statusId=[1], count=20)
```

Display summary table:

```
| # | Issue | Title | Priority | Status |
|---|-------|-------|----------|--------|
| 1 | PROJ-123 | Cart NaN | Critical | Open |
| 2 | PROJ-456 | Login slow | High | Open |
| 3 | PROJ-789 | Typo in footer | Low | Open |
```

Ask user: "Process in this order? (Y/n/reorder)"

### 7.2. Processing — Choose Mode

**Mode: full (subagent + worktree available)**

Run issues in parallel, each in its own worktree + subagent:

```
┌─ Subagent 1 ─────────────────────────────────────┐
│  Worktree: .worktrees/bugfix/PROJ-123-cart-nan    │
│  Run: GD 1 → GD 5 (full single-issue flow)       │
│  Context: isolated (own conversation)             │
└───────────────────────────────────────────────────┘
┌─ Subagent 2 ─────────────────────────────────────┐
│  Worktree: .worktrees/bugfix/PROJ-456-login-slow  │
│  Run: GD 1 → GD 5 (full single-issue flow)       │
│  Context: isolated (own conversation)             │
└───────────────────────────────────────────────────┘
         ... (up to batch_concurrency limit)

Concurrency limit: config "batch_concurrency" (default: 2)
```

Each subagent:
- Gets its own worktree (no git conflicts)
- Has isolated context (no token overflow)
- Writes its own state entry in `bugfix_state.json`
- Reports result back: {issue_key, status, pr_url, error}

Orchestrator waits for batch to finish, then starts next batch if more issues remain.

**Mode: mcp_only / legacy (no subagent)**

Process sequentially:
1. Run GD 1 → GD 5 for each issue in order
2. Write state after each issue completes
3. Clear working context between issues (keep only state summaries)
4. If one issue fails → log error in state, continue to next

### 7.3. Batch Summary

After all issues processed, show:

```
| Issue | Status | PR | Time |
|-------|--------|----|------|
| PROJ-123 | ✅ Fixed | #42 | — |
| PROJ-456 | ✅ Fixed | #43 | — |
| PROJ-789 | ❌ LOW confidence, skipped | — | — |
```

---

## State Lifecycle Reference

| Agent Phase | Agent Status | Backlog Status | Trigger |
|-------------|-------------|----------------|---------|
| fetch | in_progress → completed | Open | GD 1 start/end |
| analyze | in_progress → completed | Open | GD 2 start/end |
| fix | in_progress → completed | In Progress (2) | GD 3 start/end |
| review | in_progress → completed | In Progress (2) | GD 3.5 start/end |
| pr_created | approved | In Progress (2) | GD 4 end |
| logged | completed | Resolved (3) | GD 5 end |
| blocked | blocked | Open | Any phase failure |

State is written to `.brain/bugfix_state.json` after each phase transition.

---

## Error Recovery

| Error | Action |
|-------|--------|
| MCP unavailable at start | Switch to `legacy` mode, use Python scripts |
| MCP fails mid-workflow | Retry once → if fails again, switch to `legacy` for remaining steps |
| Tests fail after fix | Retry fix once (GD 3.3 → 3.4 loop, max 1 retry) |
| Git push rejected | Pull + rebase, retry push once |
| Confidence = LOW | Stop, report to user, do not auto-fix |
| State file corrupted | Start fresh, log warning |
