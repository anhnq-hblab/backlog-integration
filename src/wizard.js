function createWizardState(steps) {
  const answers = Object.fromEntries(steps.map((step) => [step.id, []]));
  const cursors = Object.fromEntries(steps.map((step) => [step.id, 0]));

  return {
    steps,
    stepIndex: 0,
    answers,
    cursors,
    done: false,
  };
}

function getCurrentStep(state) {
  return state.steps[state.stepIndex];
}

function getCurrentCursor(state) {
  const step = getCurrentStep(state);
  return state.cursors[step.id];
}

function setCursor(state, nextCursor) {
  const step = getCurrentStep(state);
  const maxIndex = step.choices.length - 1;
  const bounded = Math.max(0, Math.min(maxIndex, nextCursor));
  return {
    ...state,
    cursors: {
      ...state.cursors,
      [step.id]: bounded,
    },
  };
}

function toggleCurrentChoice(state) {
  const step = getCurrentStep(state);
  const cursor = getCurrentCursor(state);
  const choice = step.choices[cursor];
  const currentValues = state.answers[step.id];
  const exists = currentValues.includes(choice.value);
  const nextValues = exists
    ? currentValues.filter((item) => item !== choice.value)
    : [...currentValues, choice.value];

  return {
    ...state,
    answers: {
      ...state.answers,
      [step.id]: nextValues,
    },
  };
}

function canAdvance(state) {
  const step = getCurrentStep(state);
  return state.answers[step.id].length > 0;
}

function reduceWizardState(state, key) {
  if (state.done) {
    return state;
  }

  switch (key.name) {
    case "up":
      return setCursor(state, getCurrentCursor(state) - 1);
    case "down":
      return setCursor(state, getCurrentCursor(state) + 1);
    case "space":
      return toggleCurrentChoice(state);
    case "left":
      return {
        ...state,
        stepIndex: Math.max(0, state.stepIndex - 1),
      };
    case "right":
      if (!canAdvance(state)) {
        return state;
      }
      if (state.stepIndex === state.steps.length - 1) {
        return {
          ...state,
          done: true,
        };
      }
      return {
        ...state,
        stepIndex: state.stepIndex + 1,
      };
    case "return":
      return reduceWizardState(state, { name: "right" });
    default:
      return state;
  }
}

function renderWizard(state) {
  const step = getCurrentStep(state);
  const selected = new Set(state.answers[step.id]);
  const cursor = getCurrentCursor(state);
  const progress = `Step ${state.stepIndex + 1}/${state.steps.length}`;
  const title = `${step.title}  ${progress}`;
  const contentWidth = Math.max(
    title.length,
    ...step.choices.map((choice) => `[ ] ${choice.label}`.length),
    "Space toggle  ↑↓ move  ← back  → next  Enter confirm".length
  );
  const horizontal = "─".repeat(contentWidth + 2);
  const lines = [
    `┌${horizontal}┐`,
    `│ ${title.padEnd(contentWidth)} │`,
    `├${horizontal}┤`,
  ];

  step.choices.forEach((choice, index) => {
    const checkbox = selected.has(choice.value) ? "[x]" : "[ ]";
    const row = `${checkbox} ${choice.label}`.padEnd(contentWidth);
    if (index === cursor) {
      lines.push(`│\x1b[7m ${row} \x1b[0m│`);
      return;
    }
    lines.push(`│ ${row} │`);
  });

  lines.push(`├${horizontal}┤`);
  lines.push(`│ ${"Space toggle  ↑↓ move  ← back  → next  Enter confirm".padEnd(contentWidth)} │`);
  lines.push(`└${horizontal}┘`);
  return lines.join("\n");
}

module.exports = {
  createWizardState,
  reduceWizardState,
  renderWizard,
};
