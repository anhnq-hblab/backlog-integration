const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { installSkill } = require("../src/install");

test("installSkill copies skill assets into destination directory", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bli-install-"));
  const assetRoot = path.join(workspace, "assets");
  const destDir = path.join(workspace, "dest", "backlog-integration");

  fs.mkdirSync(path.join(assetRoot, "scripts", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(assetRoot, "SKILL.md"),
    "---\nname: backlog-integration\n---\n"
  );
  fs.writeFileSync(
    path.join(assetRoot, "scripts", "backlog_api.py"),
    "#!/usr/bin/env python3\nprint('ok')\n"
  );
  fs.writeFileSync(
    path.join(assetRoot, "scripts", "templates", "analysis_comment.md"),
    "## Analysis\n"
  );
  fs.writeFileSync(path.join(assetRoot, "package.json"), '{"name":"ignored"}\n');

  const result = await installSkill({
    assetRoot,
    destDir,
  });

  assert.equal(result.installed, true);
  assert.equal(result.destDir, destDir);
  assert.equal(
    fs.readFileSync(path.join(destDir, "SKILL.md"), "utf8"),
    "---\nname: backlog-integration\n---\n"
  );
  assert.equal(
    fs.readFileSync(path.join(destDir, "scripts", "backlog_api.py"), "utf8"),
    "#!/usr/bin/env python3\nprint('ok')\n"
  );
  assert.equal(
    fs.readFileSync(path.join(destDir, "scripts", "templates", "analysis_comment.md"), "utf8"),
    "## Analysis\n"
  );
  assert.equal(fs.existsSync(path.join(destDir, "package.json")), false);
});

test("installSkill replaces existing contents in destination directory", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bli-install-"));
  const assetRoot = path.join(workspace, "assets");
  const destDir = path.join(workspace, "dest", "backlog-integration");

  fs.mkdirSync(path.join(assetRoot, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(destDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(assetRoot, "SKILL.md"), "new skill");
  fs.writeFileSync(path.join(assetRoot, "scripts", "backlog_api.py"), "new script");
  fs.writeFileSync(path.join(destDir, "SKILL.md"), "old skill");
  fs.writeFileSync(path.join(destDir, "scripts", "backlog_api.py"), "old script");

  await installSkill({
    assetRoot,
    destDir,
  });

  assert.equal(fs.readFileSync(path.join(destDir, "SKILL.md"), "utf8"), "new skill");
  assert.equal(
    fs.readFileSync(path.join(destDir, "scripts", "backlog_api.py"), "utf8"),
    "new script"
  );
});
