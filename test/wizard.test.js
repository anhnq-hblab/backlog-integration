const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createWizardState,
  reduceWizardState,
  renderWizard,
} = require("../src/wizard");

function buildSteps() {
  return [
    {
      id: "tools",
      title: "Choose tools",
      choices: [
        { label: "Claude Code", value: "claude-code" },
        { label: "Codex", value: "codex" },
      ],
    },
    {
      id: "locations",
      title: "Choose locations",
      choices: [
        { label: "Global", value: "global" },
        { label: "Project-local", value: "project-local" },
      ],
    },
  ];
}

test("renderWizard uses square checkboxes and step hints", () => {
  const state = createWizardState(buildSteps());
  const output = renderWizard(state);

  assert.match(output, /┌/);
  assert.match(output, /└/);
  assert.match(output, /\[ \] Claude Code/);
  assert.match(output, /\[ \] Codex/);
  assert.match(output, /↑↓ move/);
  assert.match(output, /← back/);
  assert.match(output, /→ next/);
});

test("renderWizard highlights the current row", () => {
  const state = createWizardState(buildSteps());
  const output = renderWizard(state);

  assert.match(output, /\x1b\[7m/);
  assert.match(output, /\x1b\[0m/);
});

test("reduceWizardState toggles selection and moves between steps", () => {
  let state = createWizardState(buildSteps());

  state = reduceWizardState(state, { name: "space" });
  assert.deepEqual(state.answers.tools, ["claude-code"]);

  state = reduceWizardState(state, { name: "down" });
  state = reduceWizardState(state, { name: "space" });
  assert.deepEqual(state.answers.tools, ["claude-code", "codex"]);

  state = reduceWizardState(state, { name: "right" });
  assert.equal(state.stepIndex, 1);

  state = reduceWizardState(state, { name: "space" });
  assert.deepEqual(state.answers.locations, ["global"]);

  state = reduceWizardState(state, { name: "left" });
  assert.equal(state.stepIndex, 0);
  assert.deepEqual(state.answers.tools, ["claude-code", "codex"]);
});

test("reduceWizardState marks wizard complete on enter at last step", () => {
  let state = createWizardState(buildSteps());

  state = reduceWizardState(state, { name: "space" });
  state = reduceWizardState(state, { name: "right" });
  state = reduceWizardState(state, { name: "space" });
  state = reduceWizardState(state, { name: "return" });

  assert.equal(state.done, true);
  assert.deepEqual(state.answers, {
    tools: ["claude-code"],
    locations: ["global"],
  });
});
