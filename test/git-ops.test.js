const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const scriptPath = path.join(
  __dirname,
  "..",
  "skills",
  "backlog-integration",
  "scripts",
  "git_ops.sh"
);

function runShell(shell, command, cwd) {
  return execFileSync(shell, ["-lc", command], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

test("git_ops.sh can be sourced from zsh without bash-only variable errors", () => {
  const output = runShell("zsh", `source "${scriptPath}"`, __dirname);
  assert.equal(output.trim(), "");
});

test("merge_worktree defaults can merge into develop", () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "bli-git-"));

  runShell("bash", "git init -q -b develop", repoDir);
  fs.writeFileSync(path.join(repoDir, "README.md"), "init\n");
  runShell(
    "bash",
    [
      'git add README.md',
      'git -c user.name="Test User" -c user.email="test@example.com" commit -q -m init',
      `source "${scriptPath}"`,
      'create_branch "PROJ-1" "demo" >/dev/null',
      'printf "branch change\\n" >> README.md',
      'git add README.md',
      'git -c user.name="Test User" -c user.email="test@example.com" commit -q -m change',
      'git checkout -q develop',
      'merge_worktree "PROJ-1" "demo"',
      'git branch --show-current',
      'git log --format=%s -1',
    ].join("\n"),
    repoDir
  );

  const headMessage = runShell("bash", "git log --format=%s -1", repoDir);
  assert.match(headMessage, /Merge bugfix\/PROJ-1-demo into develop/);
});
