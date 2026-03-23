const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveInstallPath,
  resolveWorkflowPath,
  normalizeToolName,
  normalizeLocation,
} = require("../src/paths");

test("normalizeToolName accepts supported aliases", () => {
  assert.equal(normalizeToolName("claude"), "claude-code");
  assert.equal(normalizeToolName("claude-code"), "claude-code");
  assert.equal(normalizeToolName("cursor"), "cursor");
  assert.equal(normalizeToolName("codex"), "codex");
  assert.equal(normalizeToolName("antigravity"), "antigravity");
});

test("normalizeLocation accepts project-local aliases", () => {
  assert.equal(normalizeLocation("project"), "project-local");
  assert.equal(normalizeLocation("local"), "project-local");
  assert.equal(normalizeLocation("project-local"), "project-local");
  assert.equal(normalizeLocation("global"), "global");
});

test("resolveInstallPath returns global directories", () => {
  const homeDir = "/tmp/example-home";

  assert.equal(
    resolveInstallPath({
      tool: "claude-code",
      location: "global",
      homeDir,
      cwd: "/tmp/project",
    }),
    "/tmp/example-home/.claude/skills/backlog-integration"
  );

  assert.equal(
    resolveInstallPath({
      tool: "cursor",
      location: "global",
      homeDir,
      cwd: "/tmp/project",
    }),
    "/tmp/example-home/.cursor/skills/backlog-integration"
  );

  assert.equal(
    resolveInstallPath({
      tool: "codex",
      location: "global",
      homeDir,
      cwd: "/tmp/project",
    }),
    "/tmp/example-home/.codex/skills/backlog-integration"
  );
});

test("resolveInstallPath returns project-local directories", () => {
  const cwd = "/tmp/project";

  assert.equal(
    resolveInstallPath({
      tool: "claude-code",
      location: "project-local",
      homeDir: "/tmp/home",
      cwd,
    }),
    "/tmp/project/.claude/skills/backlog-integration"
  );

  assert.equal(
    resolveInstallPath({
      tool: "cursor",
      location: "project-local",
      homeDir: "/tmp/home",
      cwd,
    }),
    "/tmp/project/.cursor/skills/backlog-integration"
  );

  assert.equal(
    resolveInstallPath({
      tool: "codex",
      location: "project-local",
      homeDir: "/tmp/home",
      cwd,
    }),
    "/tmp/project/.codex/skills/backlog-integration"
  );

  assert.equal(
    resolveInstallPath({
      tool: "antigravity",
      location: "project-local",
      homeDir: "/tmp/home",
      cwd,
    }),
    "/tmp/project/.agent/skills/backlog-integration"
  );
});

test("resolveInstallPath prefers ~/.agent for antigravity global installs", () => {
  assert.equal(
    resolveInstallPath({
      tool: "antigravity",
      location: "global",
      homeDir: "/tmp/home",
      cwd: "/tmp/project",
    }),
    "/tmp/home/.agent/skills/backlog-integration"
  );
});

test("resolveInstallPath can prefer ~/.gemini/antigravity/skills for antigravity", () => {
  assert.equal(
    resolveInstallPath({
      tool: "antigravity",
      location: "global",
      homeDir: "/tmp/home",
      cwd: "/tmp/project",
      preferGeminiAntigravity: true,
    }),
    "/tmp/home/.gemini/antigravity/skills/backlog-integration"
  );
});

test("resolveWorkflowPath returns global workflow directories", () => {
  const homeDir = "/tmp/home";

  assert.equal(
    resolveWorkflowPath({ tool: "claude-code", location: "global", homeDir, cwd: "/tmp/p" }),
    "/tmp/home/.claude/commands"
  );

  assert.equal(
    resolveWorkflowPath({ tool: "cursor", location: "global", homeDir, cwd: "/tmp/p" }),
    "/tmp/home/.cursor/workflows"
  );

  assert.equal(
    resolveWorkflowPath({ tool: "antigravity", location: "global", homeDir, cwd: "/tmp/p" }),
    "/tmp/home/.agent/workflows"
  );
});

test("resolveWorkflowPath returns project-local workflow directories", () => {
  const cwd = "/tmp/project";

  assert.equal(
    resolveWorkflowPath({ tool: "claude-code", location: "project-local", homeDir: "/tmp/h", cwd }),
    "/tmp/project/.claude/commands"
  );

  assert.equal(
    resolveWorkflowPath({ tool: "antigravity", location: "project-local", homeDir: "/tmp/h", cwd }),
    "/tmp/project/.agents/workflows"
  );
});

test("resolveWorkflowPath prefers gemini path for antigravity", () => {
  assert.equal(
    resolveWorkflowPath({
      tool: "antigravity",
      location: "global",
      homeDir: "/tmp/home",
      cwd: "/tmp/p",
      preferGeminiAntigravity: true,
    }),
    "/tmp/home/.gemini/antigravity/global_workflows"
  );
});
