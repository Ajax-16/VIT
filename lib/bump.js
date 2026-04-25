import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();

function npmVersion(dir, bumpType) {
  execSync(`npm version ${bumpType} --no-git-tag-version`, {
    cwd: resolve(ROOT, dir),
    stdio: "inherit",
    encoding: "utf-8",
  });
}

function getVersion(dir) {
  const pkg = JSON.parse(
    readFileSync(resolve(ROOT, dir, "package.json"), "utf-8"),
  );
  return pkg.version;
}

export async function bump({ targets, bumpType, message, config, vcs }) {
  const selectedProjects = config.projects.filter((project) =>
    targets.includes(project.id),
  );

  if (selectedProjects.length === 0) {
    throw new Error("No hay proyectos válidos seleccionados para versionar");
  }

  const bumpedProjects = [];

  for (const project of selectedProjects) {
    npmVersion(project.path, bumpType);
    const version = getVersion(project.path);

    bumpedProjects.push({
      id: project.id,
      label: project.label,
      path: project.path,
      tagPrefix: project.tagPrefix,
      version,
    });
  }

  let fullMessage = message;
  for (const project of bumpedProjects) {
    fullMessage += ` | ${project.tagPrefix}-${project.version}`;
  }

  const tag = bumpedProjects
    .map((project) => `${project.tagPrefix}-${project.version}`)
    .join("-");

  if (vcs.supportsVersioning()) {
    vcs.addAll();
    vcs.commit(fullMessage);
    vcs.tag(tag, fullMessage);
    vcs.pushWithTags();
    return { bumpedProjects, tag };
  }

  return { bumpedProjects, tag: null };
}