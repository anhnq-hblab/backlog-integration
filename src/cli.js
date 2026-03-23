const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { stdin, stdout } = require("node:process");

const { installSkill, installWorkflows } = require("./install");
const {
  normalizeLocation,
  normalizeToolName,
  resolveInstallPath,
  resolveWorkflowPath,
} = require("./paths");
const { createWizardState, reduceWizardState, renderWizard } = require("./wizard");

const SUPPORTED_TOOLS = ["claude-code", "cursor", "codex", "antigravity", "opencode"];
const TOOL_CHOICES = [
  { label: "Claude Code", value: "claude-code" },
  { label: "Cursor", value: "cursor" },
  { label: "Codex", value: "codex" },
  { label: "Antigravity", value: "antigravity" },
  { label: "OpenCode", value: "opencode" },
  { label: "All", value: "all" },
];
const LOCATION_CHOICES = [
  { label: "Global", value: "global" },
  { label: "Project-local", value: "project-local" },
];

function printHelp() {
  console.log(`backlog-integration

Usage:
  backlog-integration install
  backlog-integration install --tool <name|all> --location <global|project-local> [--project-path <dir>] [--dest <dir>]
  backlog-integration help

Options:
  --tool        claude-code | claude | cursor | codex | antigravity | opencode | all
  --location    global | project-local | project | local
  --project-path
                Project root used for project-local installs. Defaults to current working directory.
  --dest        Override the resolved install directory completely.

Behavior:
  If --tool or --location is missing, the installer switches to interactive mode.
  Interactive mode uses square checkboxes with Space to toggle, ↑↓ to move, ← back, and → or Enter to continue.
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }

  return { command, options };
}

function shouldUseInteractiveInstall(options) {
  return !(options.tool && options.location);
}

function normalizeChoiceValues(values, choices, normalizer) {
  const items = Array.isArray(values) ? values : [values];
  return items.map((value) => {
    const mapped = choices.find((choice) => choice.label === value)?.value;
    return mapped || normalizer(value);
  });
}

function resolveInteractiveAnswers({ tools, locations }) {
  return {
    tools: normalizeChoiceValues(tools, TOOL_CHOICES, normalizeToolName),
    locations: normalizeChoiceValues(locations, LOCATION_CHOICES, normalizeLocation),
  };
}

function resolveTools(toolOption) {
  if (!toolOption) {
    throw new Error("Missing required option: --tool");
  }

  if (toolOption === "all") {
    return SUPPORTED_TOOLS;
  }

  return toolOption
    .split(",")
    .map((item) => normalizeToolName(item));
}

async function promptForManyWithReadline(rl, label, choices) {
  stdout.write(`${label}\n`);
  choices.forEach((choice, index) => {
    stdout.write(`  [ ] ${index + 1}. ${choice.label}\n`);
  });

  const answer = await rl.question("Select one or more (comma separated): ");
  const selected = answer
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => choices[Number(item) - 1])
    .filter(Boolean)
    .map((item) => item.label);

  if (!selected.length) {
    throw new Error(`Invalid selection for ${label}`);
  }

  return selected;
}

async function runInteractiveWizard(dependencies = {}) {
  const input = dependencies.input || stdin;
  const output = dependencies.output || stdout;
  const emitKeypressEvents = dependencies.emitKeypressEvents || readline.emitKeypressEvents;
  const steps = [
    {
      id: "tools",
      title: "Choose tools",
      choices: TOOL_CHOICES.filter((choice) => choice.value !== "all"),
    },
    {
      id: "locations",
      title: "Choose install locations",
      choices: LOCATION_CHOICES,
    },
  ];

  let state = createWizardState(steps);

  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(input.isRaw);
    emitKeypressEvents(input);
    if (input.isTTY && typeof input.setRawMode === "function") {
      input.setRawMode(true);
    }

    function cleanup() {
      input.removeListener("keypress", onKeypress);
      if (input.isTTY && typeof input.setRawMode === "function") {
        input.setRawMode(wasRaw);
      }
      if (typeof input.pause === "function") {
        input.pause();
      }
      output.write("\n");
    }

    function draw() {
      output.write("\x1Bc");
      output.write(`${renderWizard(state)}\n`);
    }

    function onKeypress(_, key = {}) {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Installation cancelled"));
        return;
      }

      state = reduceWizardState(state, key);
      draw();

      if (state.done) {
        cleanup();
        resolve(state.answers);
      }
    }

    draw();
    input.on("keypress", onKeypress);
    input.resume();
  });
}

async function promptForInstallOptions(existingOptions, dependencies = {}) {
  if (existingOptions.tool && existingOptions.location) {
    return {
      tools: resolveTools(existingOptions.tool),
      locations: existingOptions.location.split(",").map((item) => normalizeLocation(item)),
    };
  }

  if (dependencies.promptMany) {
    const tools = await dependencies.promptMany("Choose tools:", TOOL_CHOICES);
    const locations = await dependencies.promptMany("Choose install locations:", LOCATION_CHOICES);
    return resolveInteractiveAnswers({ tools, locations });
  }

  if (dependencies.rl) {
    const tools = await promptForManyWithReadline(dependencies.rl, "Choose tools:", TOOL_CHOICES);
    const locations = await promptForManyWithReadline(
      dependencies.rl,
      "Choose install locations:",
      LOCATION_CHOICES
    );
    return resolveInteractiveAnswers({ tools, locations });
  }

  const { tools, locations } = await runInteractiveWizard(dependencies);
  return resolveInteractiveAnswers({ tools, locations });
}

function buildInstallMatrix({ tools, locations }) {
  const installs = [];
  for (const tool of tools) {
    for (const location of locations) {
      installs.push({ tool, location });
    }
  }
  return installs;
}

async function runInstall(options) {
  const assetRoot = path.resolve(__dirname, "..", "skills", "backlog-integration");
  const homeDir = os.homedir();
  const projectPath = path.resolve(process.cwd());
  const installs = buildInstallMatrix({
    tools: options.tools || resolveTools(options.tool),
    locations:
      options.locations ||
      String(options.location || "global")
        .split(",")
        .map((item) => normalizeLocation(item)),
  });

  for (const { tool, location } of installs) {
    const preferGeminiAntigravity =
      tool === "antigravity" &&
      fs.existsSync(path.join(homeDir, ".gemini/antigravity/skills")) &&
      !fs.existsSync(path.join(homeDir, ".agent/skills"));
    const destDir = options.dest
      ? path.resolve(options.dest)
      : resolveInstallPath({
          tool,
          location,
          homeDir,
          cwd: projectPath,
          preferGeminiAntigravity,
        });

    await installSkill({ assetRoot, destDir });
    console.log(`${tool} (${location}): skill installed to ${destDir}`);

    const workflowDir = options.dest
      ? path.resolve(options.dest, "..", "workflows")
      : resolveWorkflowPath({
          tool,
          location,
          homeDir,
          cwd: projectPath,
          preferGeminiAntigravity,
        });

    const workflowResult = await installWorkflows({ assetRoot, destDir: workflowDir });
    if (workflowResult.installed) {
      console.log(`${tool} (${location}): workflows installed to ${workflowDir}`);
    }
  }
}

async function run(argv) {
  const { command, options } = parseArgs(argv);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command !== "install") {
    throw new Error(`Unsupported command: ${command}`);
  }

  const installOptions = shouldUseInteractiveInstall(options)
    ? await promptForInstallOptions(options)
    : options;

  await runInstall(installOptions);
  return 0;
}

module.exports = {
  buildInstallMatrix,
  parseArgs,
  promptForInstallOptions,
  resolveInteractiveAnswers,
  runInteractiveWizard,
  run,
  shouldUseInteractiveInstall,
};
