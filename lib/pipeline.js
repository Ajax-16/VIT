import { spawn } from "child_process";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";

function interpolateCommand(command, env) {
  if (typeof command !== "string") return command;
  return command.replace(/\$\{([^}]+)\}/g, (_, key) => env[key] ?? "");
}

function normalizeStep(step, index) {
  return {
    id: step.id ?? `step-${index + 1}`,
    label: step.label ?? step.command ?? `Step ${index + 1}`,
    command: step.command ?? "",
    captureAs: step.captureAs ?? null,
    cwd: step.cwd ?? null,
    continueOnError: step.continueOnError ?? false,
    showOutput: step.showOutput ?? false,
    timeoutMs: Number.isFinite(step.timeoutMs) ? step.timeoutMs : null,
  };
}

function runStep(step, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const interpolatedCommand = interpolateCommand(step.command, env);

    const spinner = ora({
      text: step.label,
      color: "blue",
      stream: process.stdout,
    }).start();

    const child = spawn(interpolatedCommand, {
      shell: true,
      cwd: resolve(step.cwd ?? process.cwd()),
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    let timeoutId = null;

    const stopSpinner = () => { if (spinner.isSpinning) spinner.stop(); };
    const restartSpinner = () => {
      if (!finished && step.showOutput && !spinner.isSpinning) spinner.start(step.label);
    };

    if (step.timeoutMs && step.timeoutMs > 0) {
      timeoutId = setTimeout(() => child.kill("SIGTERM"), step.timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (step.showOutput) { stopSpinner(); process.stdout.write(text); restartSpinner(); }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (step.showOutput) { stopSpinner(); process.stderr.write(text); restartSpinner(); }
    });

    child.on("error", (err) => {
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      spinner.fail(chalk.red(`${step.label} — failed to start`));
      rejectPromise(new Error(`Step "${step.label}" failed to start: ${err.message}`));
    });

    child.on("close", (code, signal) => {
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);

      if (signal) {
        spinner.fail(chalk.red(`${step.label} — terminated (${signal})`));
        rejectPromise(new Error(`Step "${step.label}" terminated by signal ${signal}`));
        return;
      }

      if (code === 0) {
        spinner.succeed(chalk.green(step.label));
        resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }

      spinner.fail(chalk.red(`${step.label} — failed (${code})`));
      const output = stderr.trim() || stdout.trim();
      rejectPromise(
        new Error(
          output
            ? `Step "${step.label}" failed (exit ${code})\n${output}`
            : `Step "${step.label}" failed (exit ${code})`
        )
      );
    });
  });
}

/**
 * Runs an array of pipeline steps (preActions or postActions pipeline).
 * Each step can capture its stdout via `captureAs` and expose it
 * as an env var available to all subsequent steps and to the main command.
 *
 * @param {object[]} steps - Raw step definitions from config
 * @param {object} baseEnv - Starting env object
 * @param {string} sectionLabel - Label shown in header (e.g. "pre-pipeline", "pipeline")
 * @returns {object} Enriched env with all captureAs values merged in
 */
export async function runSteps(steps, baseEnv, sectionLabel = "pipeline") {
  const normalized = steps.map(normalizeStep);
  if (normalized.length === 0) return baseEnv;

  console.log(chalk.dim(`  ─ ${sectionLabel} ${'─'.repeat(Math.max(0, 30 - sectionLabel.length))}`));

  let env = { ...baseEnv };

  for (const step of normalized) {
    try {
      const { stdout } = await runStep(step, env);

      if (step.captureAs && stdout) {
        env = { ...env, [step.captureAs]: stdout };
        console.log(
          chalk.dim(`    ↳ ${chalk.cyan(step.captureAs)} = ${stdout.slice(0, 80)}${stdout.length > 80 ? "…" : ""}`)
        );
      }
    } catch (err) {
      if (step.continueOnError) {
        console.log(chalk.yellow(`  ⚠ ${err.message}`));
        continue;
      }
      throw err;
    }
  }

  return env;
}

export function printStepsSummary(steps, indent = "      ") {
  if (!Array.isArray(steps) || steps.length === 0) return;
  steps.forEach((s, i) => {
    const step = normalizeStep(s, i);
    const capture = step.captureAs ? chalk.dim(` → $${step.captureAs}`) : "";
    console.log(chalk.dim(`${indent}${i + 1}. ${step.label}${capture}`));
  });
}
