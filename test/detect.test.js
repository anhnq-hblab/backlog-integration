const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseGitHost,
  parseBacklogSpace,
  detectConfig,
} = require("../src/detect");

test("parseGitHost detects github from URL", () => {
  assert.equal(parseGitHost("https://github.com/org/repo.git"), "github");
  assert.equal(parseGitHost("git@github.com:org/repo.git"), "github");
  assert.equal(
    parseGitHost("https://user:token@github.com/org/repo.git"),
    "github"
  );
});

test("parseGitHost detects gitlab from URL", () => {
  assert.equal(parseGitHost("https://gitlab.com/org/repo.git"), "gitlab");
  assert.equal(parseGitHost("git@gitlab.com:org/repo.git"), "gitlab");
});

test("parseGitHost detects backlog from URL", () => {
  assert.equal(
    parseGitHost("https://hblab.backlogtool.com/git/PROJECT/repo.git"),
    "backlog"
  );
  assert.equal(
    parseGitHost("https://team.backlog.com/git/PROJ/repo.git"),
    "backlog"
  );
});

test("parseGitHost returns null for unknown hosts", () => {
  assert.equal(parseGitHost("https://bitbucket.org/org/repo.git"), null);
  assert.equal(parseGitHost(null), null);
  assert.equal(parseGitHost(""), null);
});

test("parseBacklogSpace extracts space from backlog URL", () => {
  assert.equal(
    parseBacklogSpace("https://hblab.backlogtool.com/git/PROJECT/repo.git"),
    "hblab.backlogtool.com"
  );
  assert.equal(
    parseBacklogSpace("https://myteam.backlog.com/git/PROJ/repo.git"),
    "myteam.backlog.com"
  );
});

test("parseBacklogSpace returns null for non-backlog URLs", () => {
  assert.equal(parseBacklogSpace("https://github.com/org/repo.git"), null);
  assert.equal(parseBacklogSpace(null), null);
});

test("detectConfig returns defaults when git is not available", () => {
  const config = detectConfig("/tmp/nonexistent-dir-for-test");

  assert.equal(config.backlog_api_key, "");
  assert.equal(config.auto_branch, true);
  assert.equal(config.auto_push, true);
  assert.equal(config.report_lang, "vi");
  assert.equal(typeof config._detected, "object");
});
