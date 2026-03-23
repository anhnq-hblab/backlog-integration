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

module.exports = {
  installSkill,
};
