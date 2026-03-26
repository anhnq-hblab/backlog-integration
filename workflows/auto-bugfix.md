---
description: Auto-fix bug from Backlog.com — MCP-first, subagent architecture
---

# WORKFLOW: /bugfix - AI Bug Auto-Fix (Backlog Integration)

Ban la **Antigravity Bug Hunter**. Tu dong: Fetch bug → Phan tich → Fix (worktree) → Review (multi-layer) → Push → PR → Log Backlog → Report.

---

## GD 0: Config + Capability Detection

### 0.1. Config Check

Kiem tra `.brain/backlog.json`. Neu chua co → chay guided setup. Neu co → validate.

**Guided Setup** (hoi user 1 lan): Space URL, API Key, Project Key, Git Host (backlog/github/gitlab), Report lang (ja/en/vi). Tao `.brain/backlog.json`:

```json
{
  "backlog_space": "myteam.backlog.com",
  "backlog_api_key": "your-api-key",
  "project_key": "PROJ",
  "git_host": "github",
  "git_remote": "origin",
  "auto_branch": true,
  "auto_push": true,
  "report_lang": "vi",
  "execution_mode": "auto",
  "review_layers": ["code_quality", "test_coverage", "architecture"],
  "review_max_iterations": 2,
  "report_auto": false,
  "comment_format": "auto",
  "batch_concurrency": 2,
  "batch_priority_order": true,
  "lazy_fetch": true
}
```

Dam bao `.brain/` nam trong `.gitignore`.

**Validate:** `backlog_space` + `backlog_api_key` khong rong, `git_host` ∈ {backlog, github, gitlab}, `project_key` match `[A-Z][A-Z0-9_]+`.

### 0.2. Capability Detection

```
Detect AI tool capabilities:
1. MCP backlog server available? → test get_priorities() hoac get_project_list()
2. Subagent support? → check if tool supports Task/subagent spawning
3. Git worktree support? → check `git worktree list` works

Set execution_mode:
  - "full":     MCP + subagent + worktree (Cursor, Antigravity)
  - "mcp_only": MCP + sequential processing (Cline, Windsurf basic)
  - "legacy":   Python REST + sequential (ChatGPT, Claude web, no MCP)

If execution_mode = "auto" in config → detect and choose best mode.
If execution_mode is set explicitly → use that mode.
```

### 0.3. State Resume Check

Doc `.brain/bugfix_state.json`. Neu issue da co state → hoi user:

```
"Issue [KEY] dang o phase [PHASE] (status: [STATUS]).
1. Tiep tuc tu phase [PHASE]
2. Bat dau lai tu dau
3. Cancel"
```

State file format:
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

**State mapping — auto-sync Backlog status tai 2 diem:**

| Agent Phase | Agent Status | Backlog Status | Auto-sync? |
|-------------|-------------|----------------|------------|
| fetch | in_progress | Open | No |
| analyze | in_progress | Open | No |
| fix | in_progress | In Progress (2) | Yes |
| review | in_progress | In Progress (2) | No |
| push | in_progress | In Progress (2) | No |
| pr_created | approved | In Progress (2) | No |
| logged | completed | Resolved (3) | Yes |
| blocked | blocked | Open | No |

---

## GD 1: Fetch Bug Info

### 1.1. Parse Input

Ho tro: `/bugfix PROJ-123`, URL, hoac batch. Parse bang `url_parser.py`:
```bash
python3 ~/.gemini/antigravity/skills/backlog-integration/scripts/url_parser.py "INPUT"
```

**Batch mode:** Neu >1 issue → chuyen sang Batch Processing (xem GD 7).

### 1.2. Fetch tu Backlog

**Full / MCP-Only mode:**
```
# MCP (primary)
get_issue(issueIdOrKey: "PROJ-123")
get_issue_comments(issueIdOrKey: "PROJ-123")

# Image download (Python REST — MCP khong ho tro binary)
python3 backlog_api.py --action download_images --issue "PROJ-123" \
  --output-dir reports/attachments --config .brain/backlog.json
```

**Legacy mode (khong co MCP):**
```bash
python3 backlog_api.py --action get_issue_with_images --issue "PROJ-123" \
  --config .brain/backlog.json
```

**Token optimization — Lazy Loading:**
- Phase 1: Fetch chi issue summary + description (khong comments)
- Phase 2: AI doc description, quyet dinh can them info khong
- Phase 3: Chi fetch comments/images khi can thiet
- Moi buoc tao "summary note" (~200 tokens) thay vi giu raw data

### 1.3. AI Doc Screenshots

Dung `view_file` xem TAT CA anh da download. Mo ta: UI element loi, trang thai, "actual" vs "expected".

### 1.4. Hien thi tom tat

Format: Issue key, Title, Priority, Assigned, Description (tom tat), Screenshots (mo ta AI), Comments count.

**Update state:** `agent_phase: "fetch"`, `agent_status: "in_progress"`

---

## GD 2: Phan Tich Nguyen Nhan

### 2.1. Context Loading
1. Doc description + comments + screenshots
2. So sanh "Actual" vs "Expected" tu anh
3. Load `.brain/brain.json` (project context)
4. Search codebase cho files lien quan

### 2.2. Root Cause Analysis

Output structured:
- **Bug info:** Issue key, Title, Severity
- **Visual Symptoms:** Mo ta tu screenshots
- **Nguyen nhan:** File:Line + mo ta cu the
- **Affected Files:** primary + secondary
- **Impact:** Scope module/feature

### 2.2.1. Cross-Project Impact

Scan workspace tim related projects (BE, other FE). Voi moi project: search code lien quan → danh gia can fix khong.

Output table: `| Project | Lien quan? | Can fix? | Ly do |`

Check BE khi: validation logic, API behavior, DB schema, business logic thay doi.

### 2.3. Confidence Gate

| Level | Criteria | Action |
|-------|----------|--------|
| HIGH | Root cause ro, 1-3 files | Auto-fix + push + log |
| MEDIUM | Likely root cause, can verify | Fix + push + warning |
| LOW | Khong xac dinh, >5 files | **SKIP fix** — chi log analysis |

**Context pruning:** Sau GD 2, tao summary note (~150 tokens) voi root cause + affected files. Drop raw search results va full file contents khoi context.

**Update state:** `agent_phase: "analyze"`, ghi `analysis.confidence` + `analysis.root_cause_file`

---

## GD 3: Auto-Fix

### 3.1. Tao Worktree (Full mode)

```bash
source git_ops.sh
create_worktree "PROJ-123" "short-description"
# → .worktrees/bugfix/PROJ-123-short-description
```

**MCP-Only / Legacy mode:** Dung `create_branch` thay vi worktree:
```bash
create_branch "PROJ-123" "short-description"
```

### 3.2. Implement Fix

**Full mode — Subagent development:**
Spawn `fullstack-developer` hoac `best-of-n-runner` subagent voi context:
- Root cause analysis summary (tu GD 2)
- Affected files list
- Worktree path
- Project tech stack (tu `.brain/brain.json`)

Subagent tu dong: fix code → chay lint/format → chay tests (neu co).

**MCP-Only / Legacy mode:**
Agent tu fix truc tiep trong conversation. Phan loai:
- Simple (1-3 files): fix ngay
- Medium (3-5): fix + warning
- Complex (>5): fix + canh bao can review ky

### 3.3. Hien thi diff

Show diff summary sau khi fix xong.

**Context pruning:** Drop diff details, chi giu changed files list (~100 tokens).

**Update state:** `agent_phase: "fix"`, `agent_status: "in_progress"`
**Backlog auto-sync:** MCP `update_issue(issueIdOrKey, statusId: 2)` → "In Progress"

---

## GD 3.5: Multi-Layer Review

> [!IMPORTANT]
> Chay SAU khi fix code (GD 3) va TRUOC git operations (GD 4).
> Config `review_layers` trong `.brain/backlog.json` de chon layers.
> Config `review_skip_for` de skip review cho confidence level cu the (VD: "LOW").

### Full mode — Parallel subagent review:

Spawn 3 subagents dong thoi:

| Layer | Subagent | Focus | Output |
|-------|----------|-------|--------|
| 1. Code Quality | `principal-engineer` | Logic correctness, SOLID, regression risk | Pass/Warn/Fail + suggestions |
| 2. Test Coverage | `qa-engineer` | Test coverage, edge cases missed | Missing tests + auto-generate |
| 3. Architecture | `solution-architect` | Cross-module impact, API contracts, DB migration | Impact report |

### MCP-Only / Legacy mode — Sequential self-review:

Agent tu review 3 layer sequential. Doi vai (role-play) cho moi layer:

```
Layer 1: "Bay gio ban la Senior Code Reviewer. Review code changes nay, chi ra:
- Logic errors, code smells, SOLID violations
- Regression risk
- Output: PASS / WARN / FAIL + details"

Layer 2: "Bay gio ban la QA Engineer. Danh gia:
- Test coverage cho changes
- Edge cases missed
- Can viet them test nao?
- Output: PASS / WARN / FAIL + missing tests"

Layer 3: "Bay gio ban la Solution Architect. Danh gia:
- Cross-module impact
- API contract changes?
- DB migration can khong?
- Output: PASS / WARN / FAIL + impact notes"
```

### Review Gate

```
if ALL layers PASS:
  → Tiep tuc GD 4
elif co WARNINGS:
  → Tiep tuc GD 4 + attach warnings vao PR description
elif co FAILURES (iteration < review_max_iterations):
  → Quay lai GD 3.2 fix lai (max 2 iterations)
elif CRITICAL hoac max iterations reached:
  → Block, bao user: "Code can manual review. Issues: [list]"
  → Update state: agent_status = "blocked"
```

**Context pruning:** Drop review details, chi giu Pass/Fail + key warnings (~100 tokens).

**Update state:** `agent_phase: "review"`

---

## GD 4: Git Operations

### Safety Guards
- **KHONG BAO GIO:** push len main/master/develop, force push, commit secrets
- **LUON:** tao branch `bugfix/*`, chay lint/test truoc commit

### Commit & Push

```bash
source git_ops.sh

# Neu dung worktree, cd vao worktree truoc
cd .worktrees/bugfix/PROJ-123-desc

commit_changes "PROJ-123" "fix: description"
# Backlog Git: them --backlog-keywords cho auto-status

push_branch
```

### Hoi User: PR hay Merge Local?

```
"Code fix xong! Anh muon:
1. Tao PR → develop (auto push + create PR)
2. Merge local → develop (git merge)
3. Review truoc (em show diff)"
```

### Tao PR

**Backlog Git (MCP):**
```
add_pull_request(
  projectIdOrKey: "PROJ",
  repoIdOrName: "repo-name",
  summary: "[PROJ-123] fix: description",
  description: "PR body from template",
  base: "develop",
  branch: "bugfix/PROJ-123-desc"
)
```

**GitHub:** `gh pr create --title "[KEY] fix: desc" --body "$(cat pr_body.md)" --base develop`

**GitLab:** API call. **Legacy:** Hien thi link PR manual.

PR body populate tu template `pr_description.md`. Neu review co warnings → append vao PR body.

**Token optimization — PR format:**
- Simple bugs (confidence HIGH, 1-3 files): short format (root cause + solution + files)
- Complex bugs: full format (6 sections)
- Config: `pr_format: "auto"` | `"short"` | `"full"`

### Cleanup Worktree (Full mode)

Sau khi PR created hoac merged:
```bash
cleanup_worktree "PROJ-123" "desc"
```

**Update state:** `agent_phase: "push"` → `"pr_created"`, ghi `pr_url`

---

## GD 5: Log Len Backlog

### Post Comment (MCP-First)

> [!IMPORTANT]
> Content phai dung **multiline string that**, KHONG dung `\n` escape sequence.

**Full / MCP-Only mode:**
```
add_issue_comment(issueIdOrKey: "PROJ-123", content: "...")
```

**Legacy mode:**
```bash
python3 backlog_api.py --action add_comment --issue "PROJ-123" \
  --content "..." --config .brain/backlog.json
```

**Comment format — 6 muc (hoac 4 cho simple bugs):**

1. **Nguyen Nhan** — file, line, logic sai
2. **Giai Phap** — thay doi cu the
3. **Anh Huong** — scope, risk, side effects
4. **Cross-Project Impact** — table: Repo | Anh huong? | Can fix? | Ghi chu
5. **Estimate** — complexity + time
6. **PR** — branch, PR link, commit, changes

Footer: `*Generated by Antigravity AI*`

**Token optimization — comment_format:**
- `"auto"`: simple bugs (HIGH confidence, <=3 files) → skip sections 4+5
- `"full"`: luon dung 6 sections
- `"short"`: chi 3 sections (1-2-6)

### Update Status

```
update_issue(issueIdOrKey: "PROJ-123", statusId: 3)  # Resolved
```

Hoac hoi user chon: Processing (2) / Resolved (3) / Giu nguyen.

**Update state:** `agent_phase: "logged"`, `agent_status: "completed"`
**Backlog auto-sync:** statusId: 3 → Resolved

---

## GD 6: Report

**Config `report_auto`:**
- `true`: tu dong tao ca 2 report
- `false` (default): hoi user "Tao report khong?"

### Full Report
Populate template `client_report.md`: AS-IS (problem), TO-BE (solution), File Changes (diff), Comparison (impact), Git Reference. Generate mermaid diagrams.
→ `reports/[YYMMDD]-[issue-key]-report.md`

### Summary Report
Populate template `client_summary.md` voi 6 muc (khop comment Backlog).

> [!NOTE]
> Muc 4 phai giai thich BE co bi anh huong khong + ly do.

→ `reports/[YYMMDD]-[issue-key]-summary.md`

---

## GD 7: Batch Processing

Khi >1 issue trong input.

### 7.1. Lightweight Triage

Fetch chi summary cho tat ca issues (khong full data):

**MCP mode:**
```
# Fetch moi issue chi summary + priority + status
get_issue(issueIdOrKey: "PROJ-123")  # chi doc summary fields
get_issue(issueIdOrKey: "PROJ-456")
get_issue(issueIdOrKey: "PROJ-789")
```

Hien thi overview table:
```
| # | Issue | Title | Priority | Status |
|---|-------|-------|----------|--------|
| 1 | PROJ-123 | Cart total bug | High | Open |
| 2 | PROJ-456 | Login error | Critical | Open |
| 3 | PROJ-789 | UI alignment | Low | Open |
```

Neu `batch_priority_order: true` → sap xep theo priority (Critical > High > Medium > Low).

Hoi user confirm thu tu.

### 7.2. Processing

**Full mode — Parallel subagents:**
- Moi issue chay trong subagent rieng (`best-of-n-runner`) voi worktree rieng
- Max `batch_concurrency` issues dong thoi (default: 2)
- Moi subagent chay full GD 1→6 cho 1 issue
- State luu rieng cho tung issue trong `bugfix_state.json`

**MCP-Only / Legacy mode — Sequential:**
- Loop tung issue, chay GD 1→6
- Checkout `develop` truoc moi issue
- Tao branch rieng cho moi issue
- Hien thi progress `[1/N]...`

### 7.3. Lazy Loading

- Chi fetch full data (comments, images) khi bat dau process issue do
- Khong fetch het mot luc
- Summarize data ngay sau khi fetch → giam context

### 7.4. Error Handling

Neu 1 issue fail → skip, tiep tuc issue ke. Log error vao state:
```json
{
  "PROJ-456": {
    "agent_phase": "analyze",
    "agent_status": "blocked",
    "errors": ["Could not determine root cause"]
  }
}
```

### 7.5. Batch Summary

Cuoi cung hien thi:
```
| # | Issue | Branch | PR | Status |
|---|-------|--------|-----|--------|
| 1 | PROJ-456 | bugfix/PROJ-456-... | #12 | Done |
| 2 | PROJ-123 | bugfix/PROJ-123-... | #13 | Done |
| 3 | PROJ-789 | — | — | Blocked: no root cause |
```

---

## NEXT STEPS:
```
1. Fix bug khac? /bugfix [ISSUE]
2. Xem code da fix? Em show diff
3. Luu context? /save-brain
4. Lam viec khac? /next
```

---

## Error Handling (An khoi User)

| Loi | Xu ly |
|------|--------|
| API 401 | "API key het han. Anh kiem tra lai?" |
| API 404 | "Issue khong ton tai: [KEY]" |
| API timeout | Retry 1x sau 3s → "Backlog dang cham" |
| MCP unavailable | Tu dong chuyen sang legacy mode |
| Push rejected | Hoi: Force push / Doi ten branch / Cancel |
| Merge conflict | "Anh can resolve thu cong" |
| No root cause | Hoi them context hoac skip → chi log len Backlog |
| ConnectionError | "Khong ket noi duoc Backlog. Check mang?" |
| JSONDecodeError | "Config bi loi format. Em tao lai?" |
| Worktree conflict | Cleanup worktree cu, tao lai |
| Review blocked | "Code can manual review. Em list issues cho anh." |
| Subagent timeout | Fallback sang sequential processing |
