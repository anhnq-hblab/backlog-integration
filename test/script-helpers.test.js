const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");

test("sheets_api.py reports a friendly error when service account file is missing", () => {
  const configPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "bli-sheets-")),
    "google_sheets.json"
  );

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      google_auth_mode: "service_account",
      google_service_account_json: "/tmp/does-not-exist.json",
      default_sheet_name: "bugs",
      column_mapping: {},
    })
  );

  const result = spawnSync(
    "python3",
    [
      path.join(repoRoot, "skills", "backlog-integration", "scripts", "sheets_api.py"),
      "--action",
      "get_row_context",
      "--sheet-url",
      "https://docs.google.com/spreadsheets/d/test-id/edit#gid=0",
      "--sheet-name",
      "bugs",
      "--row-number",
      "2",
      "--config",
      configPath,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /^ERROR:/m);
  assert.doesNotMatch(result.stderr, /Traceback/);
});
