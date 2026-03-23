const path = require("node:path");

const SKILL_DIRNAME = "backlog-integration";
const WORKFLOW_DIRNAME = "workflows";

const TOOL_ALIASES = {
  claude: "claude-code",
  "claude-code": "claude-code",
  cursor: "cursor",
  codex: "codex",
  antigravity: "antigravity",
  opencode: "opencode",
};

const LOCATION_ALIASES = {
  global: "global",
  project: "project-local",
  local: "project-local",
  "project-local": "project-local",
};

function normalizeToolName(tool) {
  const normalized = TOOL_ALIASES[String(tool || "").trim().toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported tool: ${tool}`);
  }
  return normalized;
}

function normalizeLocation(location) {
  const normalized = LOCATION_ALIASES[String(location || "").trim().toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported install location: ${location}`);
  }
  return normalized;
}

function resolveBaseDir({ tool, location, homeDir, cwd, preferGeminiAntigravity }) {
  if (location === "project-local") {
    const projectLocalDirs = {
      "claude-code": ".claude/skills",
      cursor: ".cursor/skills",
      codex: ".codex/skills",
      antigravity: ".agent/skills",
      opencode: ".opencode/skills",
    };
    return path.join(cwd, projectLocalDirs[tool]);
  }

  if (tool === "antigravity" && preferGeminiAntigravity) {
    return path.join(homeDir, ".gemini/antigravity/skills");
  }

  const globalDirs = {
    "claude-code": ".claude/skills",
    cursor: ".cursor/skills",
    codex: ".codex/skills",
    antigravity: ".agent/skills",
    opencode: ".config/opencode/skills",
  };
  return path.join(homeDir, globalDirs[tool]);
}

function resolveWorkflowBaseDir({ tool, location, homeDir, cwd, preferGeminiAntigravity }) {
  if (location === "project-local") {
    const projectLocalDirs = {
      "claude-code": ".claude/commands",
      cursor: ".cursor/workflows",
      codex: ".codex/workflows",
      antigravity: ".agents/workflows",
      opencode: ".opencode/workflows",
    };
    return path.join(cwd, projectLocalDirs[tool]);
  }

  if (tool === "antigravity" && preferGeminiAntigravity) {
    return path.join(homeDir, ".gemini/antigravity/global_workflows");
  }

  const globalDirs = {
    "claude-code": ".claude/commands",
    cursor: ".cursor/workflows",
    codex: ".codex/workflows",
    antigravity: ".agent/workflows",
    opencode: ".config/opencode/workflows",
  };
  return path.join(homeDir, globalDirs[tool]);
}

function resolveInstallPath({
  tool,
  location,
  homeDir,
  cwd,
  preferGeminiAntigravity = false,
}) {
  const normalizedTool = normalizeToolName(tool);
  const normalizedLocation = normalizeLocation(location);
  const baseDir = resolveBaseDir({
    tool: normalizedTool,
    location: normalizedLocation,
    homeDir,
    cwd,
    preferGeminiAntigravity,
  });

  return path.join(baseDir, SKILL_DIRNAME);
}

function resolveWorkflowPath({
  tool,
  location,
  homeDir,
  cwd,
  preferGeminiAntigravity = false,
}) {
  const normalizedTool = normalizeToolName(tool);
  const normalizedLocation = normalizeLocation(location);
  return resolveWorkflowBaseDir({
    tool: normalizedTool,
    location: normalizedLocation,
    homeDir,
    cwd,
    preferGeminiAntigravity,
  });
}

module.exports = {
  SKILL_DIRNAME,
  WORKFLOW_DIRNAME,
  normalizeLocation,
  normalizeToolName,
  resolveInstallPath,
  resolveWorkflowPath,
};
