/**
 * Shared action normalization and execution logic.
 * Used by both preActions and postActions.
 */
import { spawn } from "child_process";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { runSteps, printStepsSummary } from "./pipeline.js";

export const VALID_TRIGGERS = ["release", "commit", "changelog"];

export function interpolateEnvValue(value, env) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => env[key] ?? "");
}

export function interpolateCommand(command, env) {
  if (typeof command !== "string") return command;
  return command.replace(/\$\{([^}]+)\}/g, (_, key) => env[key] ?? "");
}

export function normalizeAction(action, index, defaultTrigger = "release") {
  const on = Array.isArray(action.on)
    ? action.on
    : typeof action.on === "string"
      ? [action.on]
      : [defaultTrigger];

  return {
    id: action.id ?? `action-${index + 1}`,
    label: action.label ?? action.command ?? `Action ${index + 1}`,
    command: action.command ?? "",
    pipeline: Array.isArray(action.pipeline) ? action.pipeline : [],
    on,
    cwd: action.cwd ?? process.cwd(),
    env: action.env ?? {},
    promptEnv: Array.isArray(action.promptEnv) ? action.promptEnv : [],
    enabled: action.enabled ?? true,
    continueOnError: action.continueOnError ?? false,
    showOutput: action.showOutput ?? true,
    timeoutMs: Number.isFinite(action.timeoutMs) ? action.timeoutMs : null,
  };
}

export function isValidTrigger(trigger) {
  return VALID_TRIGGERS.includes(trigger);
}

export function getApplicableActions(actions, trigger) {
  if (!Array.isArray(actions)) return [];

  return actions
    .map((a, i) => normalizeAction(a, i))
    .filter((action) => {
      if (!action.enabled) return false;
      if (!action.command || typeof action.command !== "string") return false;
      return action.on.some((t) => t === trigger);
    });
}

export function validateActions(actions, label = "action") {
  for (const action of actions) {
    for (const trigger of action.on) {
      if (!isValidTrigger(trigger)) {
        throw new Error(
          `Invalid trigger "${trigger}" in ${label} "${action.label}". Valid: ${VALID_TRIGGERS.join(", ")}`
        );
      }
    }
  }
}

export async function resolvePromptEnv(action) {
  const resolved = {};

  for (const promptDef of action.promptEnv) {
    if (!promptDef?.name) continue;

    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "value",
        message: promptDef.message ?? `Value for ${promptDef.name}:`,
        validate:
          promptDef.validate === "otp"
            ? (v) => /^\d{6}$/.test(v) || "OTP must be a 6-digit code"
            : (v) => String(v).trim().length > 0 || `${promptDef.name} cannot be empty`,
      },
    ]);

    resolved[promptDef.name] = String(answer.value).trim();
  }

  return resolved;
}

export async function buildActionRuntime(action, pipelineLabel = "pipeline") {
  // 1. Prompt first — always before any spawn
  const promptedEnv = await resolvePromptEnv(action);

  // 2. Merge: process.env < action.env < prompted
  const mergedEnv = {
    ...process.env,
    ...action.env,
    ...promptedEnv,
  };

  // 3. Interpolate all values
  const interpolatedEnv = Object.fromEntries(
    Object.entries(mergedEnv).map(([key, value]) => [
      key,
      typeof value === "string" ? interpolateEnvValue(value, mergedEnv) : value,
    ])
  );

  // 4. Run pipeline steps — each can enrich env via captureAs
  const pipelineEnv = await runSteps(action.pipeline, interpolatedEnv, pipelineLabel);

  // 5. Interpolate command with pipeline-enriched env
  const interpolatedCommand = interpolateCommand(action.command, pipelineEnv);

  return {
    ...action,
    runtimeEnv: pipelineEnv,
    runtimeCommand: interpolatedCommand,
  };
}

export function runCommand(action) {
  return new Promise((resolvePromise, rejectPromise) => {
    const spinner = ora({
      text: action.label,
      color: "cyan",
      stream: process.stdout,
    }).start();

    const child = spawn(action.runtimeCommand, {
      shell: true,
      cwd: resolve(action.cwd),
      env: action.runtimeEnv,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    let timeoutId = null;

    const stopSpinner = () => { if (spinner.isSpinning) spinner.stop(); };
    const restartSpinner = () => {
      if (!finished && action.showOutput && !spinner.isSpinning) spinner.start(action.label);
    };

    if (action.timeoutMs && action.timeoutMs > 0) {
      timeoutId = setTimeout(() => child.kill("SIGTERM"), action.timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (action.showOutput) { stopSpinner(); process.stdout.write(text); restartSpinner(); }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (action.showOutput) { stopSpinner(); process.stderr.write(text); restartSpinner(); }
    });

    child.on("error", (err) => {
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      spinner.fail(chalk.red(`${action.label} — failed to start`));
      rejectPromise(new Error(`Failed to start "${action.label}": ${err.message}`));
    });

    child.on("close", (code, signal) => {
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);

      if (signal) {
        spinner.fail(chalk.red(`${action.label} — terminated (${signal})`));
        rejectPromise(new Error(`"${action.label}" terminated by signal ${signal}`));
        return;
      }

      if (code === 0) {
        spinner.succeed(chalk.green(action.label));
        resolvePromise({ code, stdout, stderr });
        return;
      }

      spinner.fail(chalk.red(`${action.label} — failed (${code})`));
      const output = stderr.trim() || stdout.trim();
      rejectPromise(
        new Error(
          output
            ? `"${action.label}" failed (exit ${code})\n${output}`
            : `"${action.label}" failed (exit ${code})`
        )
      );
    });
  });
}

export function printActionsSummary(actions, trigger, sectionLabel) {
  const applicable = getApplicableActions(actions, trigger);
  if (applicable.length === 0) return;

  console.log(`  ${sectionLabel}: ${chalk.cyan(applicable.length)}`);
  for (const action of applicable) {
    const details = [];
    if (action.on.length > 0) details.push(`on=${action.on.join(",")}`);
    if (action.cwd && action.cwd !== process.cwd()) details.push(`cwd=${action.cwd}`);
    if (Object.keys(action.env).length > 0) details.push(`env=${Object.keys(action.env).join(",")}`);
    if (action.promptEnv.length > 0) details.push(`promptEnv=${action.promptEnv.map((p) => p.name).join(",")}`);
    if (action.pipeline.length > 0) details.push(`pipeline=${action.pipeline.length} steps`);
    if (action.continueOnError) details.push("continueOnError=true");
    if (action.timeoutMs) details.push(`timeout=${action.timeoutMs}ms`);

    console.log(
      `    · ${chalk.dim(action.label)}${details.length ? chalk.dim(` (${details.join(" | ")})`) : ""}`
    );

    if (action.pipeline.length > 0) {
      console.log(chalk.dim("      pipeline:"));
      printStepsSummary(action.pipeline);
    }
  }
}

export async function runActions(actions, trigger, sectionLabel = "actions") {
  const applicable = getApplicableActions(actions, trigger);
  if (applicable.length === 0) return;

  validateActions(applicable, sectionLabel);

  console.log("\n" + chalk.bold(`  Running ${sectionLabel}:`));
  console.log(chalk.dim("  ─────────────────────────"));

  for (const action of applicable) {
    try {
      const runtimeAction = await buildActionRuntime(action, `${sectionLabel} pipeline`);
      await runCommand(runtimeAction);
    } catch (err) {
      if (action.continueOnError) {
        console.log(chalk.yellow(`  ⚠ ${err.message}\n`));
        continue;
      }
      throw err;
    }
  }

  console.log();
}
