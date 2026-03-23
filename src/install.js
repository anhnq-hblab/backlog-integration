const fs = require("node:fs/promises");
const path = require("node:path");

async function copyDirectory(sourceDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destPath);
      continue;
    }

    await fs.copyFile(sourcePath, destPath);
  }
}

async function installSkill({ assetRoot, destDir }) {
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(path.join(assetRoot, "SKILL.md"), path.join(destDir, "SKILL.md"));
  await copyDirectory(path.join(assetRoot, "scripts"), path.join(destDir, "scripts"));

  return {
    installed: true,
    destDir,
  };
}

async function installWorkflows({ assetRoot, destDir }) {
  const workflowSrc = path.join(assetRoot, "..", "..", "workflows");

  let entries;
  try {
    entries = await fs.readdir(workflowSrc, { withFileTypes: true });
  } catch {
    return { installed: false, destDir, reason: "no-workflows-dir" };
  }

  const mdFiles = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".md")
  );

  if (mdFiles.length === 0) {
    return { installed: false, destDir, reason: "no-workflow-files" };
  }

  await fs.mkdir(destDir, { recursive: true });

  for (const entry of mdFiles) {
    await fs.copyFile(
      path.join(workflowSrc, entry.name),
      path.join(destDir, entry.name)
    );
  }

  return {
    installed: true,
    destDir,
    files: mdFiles.map((entry) => entry.name),
  };
}

module.exports = {
  installSkill,
  installWorkflows,
};
