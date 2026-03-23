const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("skills.sh-compatible skill assets exist under skills/backlog-integration", () => {
  const skillDir = path.join(__dirname, "..", "skills", "backlog-integration");
  const skillDoc = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");

  assert.equal(fs.existsSync(path.join(skillDir, "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(skillDir, "scripts", "backlog_api.py")), true);
  assert.equal(fs.existsSync(path.join(skillDir, "scripts", "url_parser.py")), true);
  assert.equal(fs.existsSync(path.join(skillDir, "scripts", "git_ops.sh")), true);
  assert.equal(fs.existsSync(path.join(skillDir, "scripts", "mcp_backlog.sh")), true);
  assert.match(skillDoc, /^---\nname: backlog-integration\ndescription: /);
});

test("skill templates exist under scripts/templates", () => {
  const templatesDir = path.join(__dirname, "..", "skills", "backlog-integration", "scripts", "templates");

  assert.equal(fs.existsSync(path.join(templatesDir, "analysis_comment.md")), true);
  assert.equal(fs.existsSync(path.join(templatesDir, "fix_comment.md")), true);
  assert.equal(fs.existsSync(path.join(templatesDir, "client_report.md")), true);
  assert.equal(fs.existsSync(path.join(templatesDir, "client_summary.md")), true);
  assert.equal(fs.existsSync(path.join(templatesDir, "pr_description.md")), true);
});

test("skills repo includes examples", () => {
  const rootDir = path.join(__dirname, "..");

  assert.equal(
    fs.existsSync(path.join(rootDir, "skills", "backlog-integration", "examples", "mcp_config_example.json")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, "skills", "backlog-integration", "examples", "sample_bugfix.md")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, "skills", "backlog-integration", "examples", "backlog.json.template")),
    true
  );
});

test("workflows directory contains auto-bugfix.md", () => {
  const workflowDir = path.join(__dirname, "..", "workflows");
  const content = fs.readFileSync(path.join(workflowDir, "auto-bugfix.md"), "utf8");

  assert.equal(fs.existsSync(path.join(workflowDir, "auto-bugfix.md")), true);
  assert.match(content, /^---\ndescription: /);
});
