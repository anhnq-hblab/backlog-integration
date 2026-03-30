const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
);

test("package.json includes publish-ready npm metadata", () => {
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
  });
  assert.ok(Array.isArray(packageJson.keywords));
  assert.ok(packageJson.keywords.includes("codex"));
  assert.ok(packageJson.keywords.includes("cursor"));
  assert.ok(packageJson.keywords.includes("claude-code"));
  assert.ok(packageJson.keywords.includes("skill"));
  assert.equal(packageJson.name, "backlog-integration");
  assert.ok(packageJson.version);
  assert.equal(packageJson.skills.name, "backlog-integration");
  assert.ok(packageJson.files.includes("skills"));
});

test("package.json exposes a release smoke-test script", () => {
  assert.equal(
    packageJson.scripts["release:check"],
    "npm test && npm pack --dry-run"
  );
});

test("README documents usage and publish flow", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");

  assert.match(readme, /npm publish --access public/);
  assert.match(readme, /npx.*install/);
  assert.match(readme, /npx.*setup/);
});

test("npm pack excludes Python cache artifacts", () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "bli-npm-cache-"));
  const result = spawnSync("npm", ["pack", "--dry-run", "--cache", cacheDir], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.doesNotMatch(output, /__pycache__/);
  assert.doesNotMatch(output, /\.pyc/);
});
