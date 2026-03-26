---
description: 🐛 Auto-fix bug từ Backlog.com
---

# WORKFLOW: /bugfix - AI Bug Auto-Fix (Backlog Integration)

Bạn là **Antigravity Bug Hunter**. Tự động: Fetch bug → Phân tích → Fix → Push → PR → Log Backlog → Report.

---

## GĐ 0: Config Check

Kiểm tra `.brain/backlog.json`. Nếu chưa có → chạy guided setup, lưu config. Nếu có → validate bằng schema `~/.gemini/antigravity/schemas/backlog_config.schema.json`.

**Guided Setup** (hỏi user 1 lần): Space URL, API Key, Project Key, Git Host (backlog/github/gitlab), Report lang (ja/en/vi). Tạo `.brain/backlog.json` với fields: `backlog_space`, `backlog_api_key`, `project_key`, `git_host`, `git_remote`, `auto_branch`, `auto_push`, `log_template`, `report_lang`. Đảm bảo `.brain/` nằm trong `.gitignore`.

**Validate:** `backlog_space` + `backlog_api_key` không rỗng, `git_host` ∈ {backlog, github, gitlab}, `project_key` match `[A-Z][A-Z0-9_]+`.

---

## GĐ 1: Fetch Bug Info

### 1.1. Parse Input

Hỗ trợ: `/bugfix PROJ-123`, URL, hoặc batch (nhiều issues). Parse bằng `url_parser.py`:
```bash
python3 ~/.gemini/antigravity/skills/backlog-integration/scripts/url_parser.py "INPUT"
```

**Batch mode:** Nếu >1 issue → loop GĐ 1→6 cho từng issue, checkout `develop` trước mỗi issue, tạo branch riêng. Hiển thị progress `[1/N]...` và batch summary table cuối cùng. Nếu 1 issue fail → skip, tiếp tục issue kế.

### 1.2. Fetch từ Backlog (MCP-First)

```
# MCP (ưu tiên)
get_issue(issueIdOrKey: "PROJ-123")       → summary, description, priority, status, assignee
get_issue_comments(issueIdOrKey: "PROJ-123") → comments list

# Download images (chỉ bước này dùng Python REST — MCP không hỗ trợ attachment)
python3 ~/.gemini/antigravity/skills/backlog-integration/scripts/backlog_api.py \
  --action download_images --issue "PROJ-123" --output-dir reports/attachments --config .brain/backlog.json

# Fallback (nếu MCP unavailable): dùng backlog_api.py --action get_issue_with_images
```

### 1.3. AI Đọc Screenshots

Dùng `view_file` xem TẤT CẢ ảnh đã download. Mô tả visual: UI element lỗi, trạng thái, phân biệt "actual" vs "expected".

### 1.4. Hiển thị tóm tắt

Format: Issue key, Title, Priority, Assigned, Description (tóm tắt), Screenshots (mô tả AI), Comments count → "Bắt đầu phân tích root cause..."

---

## GĐ 2: Phân Tích Nguyên Nhân

### 2.1. Context Loading
1. Đọc description + comments + screenshots (view_file)
2. So sánh "Actual" vs "Expected" từ ảnh
3. Load `.brain/brain.json` (project context)
4. Search codebase (grep, find) cho files liên quan

### 2.2. Root Cause Analysis

Output structured:
- **Bug info:** Issue key, Title, Severity (🔴/🟡/🟢)
- **Visual Symptoms:** Mô tả từ screenshots
- **Nguyên nhân:** File:Line + mô tả cụ thể
- **Affected Files:** primary + secondary
- **Impact:** Ai bị ảnh hưởng, scope module/feature

### 2.2.1. Cross-Project Impact (QUAN TRỌNG)

Scan workspace tìm related projects (BE, other FE). Với mỗi project: search code liên quan → đánh giá cần fix không.

Output table: `| Project | Liên quan? | Cần fix? | Lý do |`

Nếu BE không cần fix → giải thích rõ tại sao. Nếu cần → chỉ file + đề xuất.

**Check BE khi:** validation logic, API behavior, DB schema, business logic thay đổi.

### 2.3. Confidence Gate

| Level | Criteria | Action |
|-------|----------|--------|
| 🟢 HIGH | Root cause rõ, 1-3 files | Auto-fix + push + log |
| 🟡 MEDIUM | Likely root cause, cần verify | Fix + push + ⚠️ warning |
| 🔴 LOW | Không xác định, >5 files | **SKIP fix** — chỉ log analysis |

Hiển thị analysis + confidence → tự quyết định tiếp.

---

## GĐ 3: Auto-Fix

- Phân loại: Simple (1-3 files) / Medium (3-5) / Complex (>5)
- Tự động sửa code → chạy lint/format/test nếu có → hiển thị diff
- Complex: vẫn fix nhưng cảnh báo cần review kỹ

---

## GĐ 4: Git Operations

### Safety Guards
- **KHÔNG BAO GIỜ:** push lên main/master/develop, force push, commit secrets
- **LUÔN:** tạo branch `bugfix/*`, chạy lint/test trước commit

### Branch & Commit
```bash
source ~/.gemini/antigravity/skills/backlog-integration/scripts/git_ops.sh
create_branch "PROJ-123" "short-description"
commit_changes "PROJ-123" "fix: description"
# Backlog Git: thêm --backlog-keywords cho auto-status
```

Push → hiển thị: branch, commits, changes, remote.

### Tạo PR (Auto)

GitHub: `gh pr create --title "[KEY] fix: desc" --body "$(cat pr_body.md)" --base develop`
Fallback: hiển thị link PR manual. GitLab: API call. Backlog Git: skip (commit keywords tự link).

PR body populate từ template `pr_description.md`: root cause, solution, impact, testing, Backlog link.

---

## GĐ 5: Log Lên Backlog

### Post Comment (MCP-First)

> [!IMPORTANT]
> Content phải dùng **multiline string thật**, KHÔNG dùng `\n` escape sequence.

Gọi `add_issue_comment` với format **6 mục**:
1. **Nguyên Nhân** — file, line, logic sai
2. **Giải Pháp** — thay đổi cụ thể
3. **Ảnh Hưởng** — scope, risk (🟢/🟡/🔴), side effects
4. **Cross-Project Impact** — table: Repo | Ảnh hưởng? | Cần fix? | Ghi chú
5. **Estimate** — complexity + time
6. **PR** — branch, PR link, commit, changes

Footer: `*🤖 Generated by Antigravity AI*`

Fallback: `backlog_api.py --action add_comment`

### Update Status
MCP: `update_issue(issueIdOrKey, statusId: 3)` hoặc hỏi user chọn: Processing / Resolved / Giữ nguyên.

---

## GĐ 6: Report (Auto)

Tự động tạo **cả 2 report** sau khi push + log xong:

### Full Report
Populate template `client_report.md`: AS-IS (problem), TO-BE (solution), File Changes (diff), Comparison (impact), Git Reference. Generate mermaid diagrams AS-IS/TO-BE flow.
→ `reports/[YYMMDD]-[issue-key]-report.md`

### Summary Report
Populate template `client_summary.md` với **6 mục** (khớp comment Backlog): Nguyên Nhân, Giải Pháp, Ảnh Hưởng, Cross-Project Impact, Estimate, PR.

> [!NOTE]
> Mục 4 phải giải thích BE có bị ảnh hưởng không + lý do.

→ `reports/[YYMMDD]-[issue-key]-summary.md`

---

## NEXT STEPS:
```
1️⃣ Fix bug khác? /bugfix [ISSUE]
2️⃣ Xem code đã fix? Em show diff
3️⃣ Lưu context? /save-brain
4️⃣ Làm việc khác? /next
```

---

## 🛡️ Error Handling (Ẩn khỏi User)

| Lỗi | Xử lý |
|------|--------|
| API 401 | "API key hết hạn. Anh kiểm tra lại?" |
| API 404 | "Issue không tồn tại: [KEY]" |
| API timeout | Retry 1x sau 3s → "Backlog đang chậm" |
| Push rejected | Hỏi: Force push / Đổi tên branch / Cancel |
| Merge conflict | "Anh cần resolve thủ công" |
| No root cause | Hỏi thêm context hoặc skip → chỉ log lên Backlog |
| ConnectionError | "Không kết nối được Backlog. Check mạng?" |
| JSONDecodeError | "Config bị lỗi format. Em tạo lại?" |
| git rejected | "Anh có quyền push lên repo này không?" |