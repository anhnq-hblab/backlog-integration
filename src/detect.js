const { execSync } = require("node:child_process");
const path = require("node:path");

function detectGitRemoteUrl(cwd) {
  try {
    const output = execSync("git remote -v", { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const match = output.match(/^origin\s+(.+?)\s+\(fetch\)/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function parseGitHost(remoteUrl) {
  if (!remoteUrl) {
    return null;
  }

  const url = remoteUrl
    .replace(/^git@/, "https://")
    .replace(/\.git$/, "")
    .replace(/^ssh:\/\//, "https://");

  if (url.includes("github.com")) {
    return "github";
  }
  if (url.includes("gitlab.com") || url.includes("gitlab")) {
    return "gitlab";
  }
  if (url.includes("backlog.com") || url.includes("backlogtool.com")) {
    return "backlog";
  }

  return null;
}

function parseBacklogSpace(remoteUrl) {
  if (!remoteUrl) {
    return null;
  }

  const match = remoteUrl.match(/([\w-]+\.backlog(?:tool)?\.com)/);
  return match ? match[1] : null;
}

function detectProjectKey(cwd) {
  try {
    const branchOutput = execSync("git branch -r", { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const match = branchOutput.match(/([A-Z][A-Z0-9_]+-\d+)/);
    if (match) {
      return match[1].replace(/-\d+$/, "");
    }
  } catch {
    // ignore
  }

  const dirName = path.basename(cwd).toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return dirName || null;
}

function detectConfig(cwd) {
  const remoteUrl = detectGitRemoteUrl(cwd);
  const gitHost = parseGitHost(remoteUrl);
  const backlogSpace = parseBacklogSpace(remoteUrl);
  const projectKey = detectProjectKey(cwd);

  return {
    backlog_space: backlogSpace || "your-team.backlog.com",
    backlog_api_key: "",
    project_key: projectKey || "PROJ",
    git_host: gitHost || "github",
    git_remote: "origin",
    auto_branch: true,
    auto_push: true,
    log_template: "structured",
    report_lang: "vi",
    _detected: {
      remote_url: remoteUrl,
      git_host_detected: gitHost !== null,
      backlog_space_detected: backlogSpace !== null,
      project_key_detected: projectKey !== null,
    },
  };
}

module.exports = {
  detectConfig,
  detectGitRemoteUrl,
  parseGitHost,
  parseBacklogSpace,
  detectProjectKey,
};
