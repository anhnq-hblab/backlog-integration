const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInstallMatrix,
  parseArgs,
  promptForInstallOptions,
  runInteractiveWizard,
  shouldUseInteractiveInstall,
  resolveInteractiveAnswers,
} = require("../src/cli");

test("parseArgs reads command and long options", () => {
  const result = parseArgs([
    "install",
    "--tool",
    "codex",
    "--location",
    "project-local",
    "--project-path",
    "/tmp/project",
  ]);

  assert.deepEqual(result, {
    command: "install",
    options: {
      tool: "codex",
      location: "project-local",
      "project-path": "/tmp/project",
    },
  });
});

test("interactive install is used when tool or location is missing", () => {
  assert.equal(shouldUseInteractiveInstall({}), true);
  assert.equal(shouldUseInteractiveInstall({ tool: "codex" }), true);
  assert.equal(shouldUseInteractiveInstall({ location: "global" }), true);
  assert.equal(
    shouldUseInteractiveInstall({ tool: "codex", location: "global" }),
    false
  );
});

test("resolveInteractiveAnswers maps prompts to install options", () => {
  const result = resolveInteractiveAnswers({
    tools: ["Claude Code", "Cursor"],
    locations: ["Project-local", "Global"],
  });

  assert.deepEqual(result, {
    tools: ["claude-code", "cursor"],
    locations: ["project-local", "global"],
  });
});

test("resolveInteractiveAnswers normalizes single selections into arrays", () => {
  const result = resolveInteractiveAnswers({
    tools: "Codex",
    locations: "Global",
  });

  assert.deepEqual(result, {
    tools: ["codex"],
    locations: ["global"],
  });
});

test("buildInstallMatrix expands combinations of tools and locations", () => {
  const result = buildInstallMatrix({
    tools: ["codex", "cursor"],
    locations: ["global", "project-local"],
  });

  assert.deepEqual(result, [
    { tool: "codex", location: "global" },
    { tool: "codex", location: "project-local" },
    { tool: "cursor", location: "global" },
    { tool: "cursor", location: "project-local" },
  ]);
});

test("promptForInstallOptions supports checkbox-style multiple selections", async () => {
  const promptMany = async (label) => {
    if (label === "Choose tools:") {
      return ["Claude Code", "Codex"];
    }
    if (label === "Choose install locations:") {
      return ["Global", "Project-local"];
    }
    throw new Error(`Unexpected label: ${label}`);
  };

  const result = await promptForInstallOptions({}, { promptMany, cwd: "/tmp/current-project" });

  assert.deepEqual(result, {
    tools: ["claude-code", "codex"],
    locations: ["global", "project-local"],
  });
});

test("runInteractiveWizard pauses input after completing", async () => {
  let keypressHandler;
  const writes = [];
  const input = {
    isTTY: true,
    isRaw: false,
    setRawModeCalls: [],
    paused: false,
    setRawMode(value) {
      this.isRaw = value;
      this.setRawModeCalls.push(value);
    },
    on(event, handler) {
      if (event === "keypress") {
        keypressHandler = handler;
      }
    },
    removeListener() {},
    resume() {},
    pause() {
      this.paused = true;
    },
  };
  const output = {
    write(chunk) {
      writes.push(chunk);
    },
  };

  const promise = runInteractiveWizard({
    input,
    output,
    emitKeypressEvents(stream) {
      stream.on("keypress", (value, key) => {
        keypressHandler = (_, nextKey) => key(value, nextKey);
      });
    },
  });
  keypressHandler("", { name: "space" });
  keypressHandler("", { name: "right" });
  keypressHandler("", { name: "space" });
  keypressHandler("", { name: "return" });

  const answers = await promise;

  assert.deepEqual(answers, {
    tools: ["claude-code"],
    locations: ["global"],
  });
  assert.equal(input.paused, true);
  assert.deepEqual(input.setRawModeCalls, [true, false]);
  assert.ok(writes.length > 0);
});
