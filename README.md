# backlog-integration

`backlog-integration` là skill dạng repo, tương thích với `skills.sh`.

## Bắt đầu nhanh

Repo này bao gồm cấu trúc tương thích `skills.sh` tại `skills/backlog-integration/`.

Khi repo được public, có thể cài đặt bằng luồng CLI:

```bash
npx backlog-integration install
```

Hoặc cài non-interactive:

```bash
npx backlog-integration install --tool antigravity --location global
```

## Công cụ được hỗ trợ

| Công cụ      | Đường dẫn global                               | Đường dẫn project-local          |
| ------------ | ---------------------------------------------- | -------------------------------- |
| Claude Code  | `~/.claude/skills/backlog-integration`         | `./.claude/skills/backlog-integration` |
| Cursor       | `~/.cursor/skills/backlog-integration`         | `./.cursor/skills/backlog-integration` |
| Codex        | `~/.codex/skills/backlog-integration`          | `./.codex/skills/backlog-integration` |
| Antigravity  | `~/.agent/skills/backlog-integration`          | `./.agent/skills/backlog-integration` |
| OpenCode     | `~/.config/opencode/skills/backlog-integration` | `./.opencode/skills/backlog-integration` |

## Thành phần được cài đặt

Skill này cài các tài nguyên cần thiết sau:

- `SKILL.md`
- `scripts/backlog_api.py`
- `scripts/url_parser.py`
- `scripts/git_ops.sh`
- `scripts/mcp_backlog.sh`
- `scripts/templates/` (analysis_comment, fix_comment, client_report, client_summary, pr_description)

Ngoài ra, skill trong repo còn bao gồm:

- `examples/mcp_config_example.json`
- `examples/sample_bugfix.md`

## Chức năng

- **Fetch** bug/issue details từ Backlog.com (MCP hoặc REST API)
- **Parse** URL hoặc issue key thành structured data
- **Git** operations: branch, commit, push với safety guards
- **Log** structured comments (root cause, solution, impact) lên Backlog
- **Report** tạo báo cáo cho khách hàng
- **PR** management qua MCP Git tools

## Release & Publish

```bash
# Verify trước khi publish
npm run release:check

# Dry-run pack
npm pack --dry-run

# Publish
npm publish --access public
```

## Cài từ skills.sh

```bash
npx skills add https://github.com/anhnq/backlog-integration-skill --skill backlog-integration
```
