import { spawn } from "child_process";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";

const VALID_TRIGGERS = ["release", "commit", "changelog"];

function normalizePostAction(action, index) {
    const on = Array.isArray(action.on)
        ? action.on
        : typeof action.on === "string"
            ? [action.on]
            : ["release"];

    return {
        id: action.id ?? `post-action-${index + 1}`,
        label: action.label ?? action.command ?? `Post action ${index + 1}`,
        command: action.command ?? "",
        on,
        cwd: action.cwd ?? process.cwd(),
        env: action.env ?? {},
        enabled: action.enabled ?? true,
        continueOnError: action.continueOnError ?? false,
        showOutput: action.showOutput ?? true,
        timeoutMs: Number.isFinite(action.timeoutMs) ? action.timeoutMs : null,
    };
}

function isValidTrigger(trigger) {
    return VALID_TRIGGERS.includes(trigger);
}

function getApplicablePostActions(postActions, trigger) {
    if (!Array.isArray(postActions)) return [];

    return postActions
        .map(normalizePostAction)
        .filter((action) => {
            if (!action.enabled) return false;
            if (!action.command || typeof action.command !== "string") return false;
            return action.on.some((t) => t === trigger);
        });
}

function validatePostActions(actions) {
    for (const action of actions) {
        for (const trigger of action.on) {
            if (!isValidTrigger(trigger)) {
                throw new Error(
                    `Invalid post-action trigger "${trigger}" in "${action.label}". Valid values: ${VALID_TRIGGERS.join(", ")}`
                );
            }
        }
    }
}

function runCommand(action) {
    return new Promise((resolvePromise, rejectPromise) => {
        const spinner = ora({
            text: action.label,
            color: "cyan",
            stream: process.stdout,
        }).start();

        const child = spawn(action.command, {
            shell: true,
            cwd: resolve(action.cwd),
            env: {
                ...process.env,
                ...action.env,
            },
            stdio: action.showOutput ? ["inherit", "pipe", "pipe"] : ["inherit", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let finished = false;
        let timeoutId = null;

        const stopSpinnerForOutput = () => {
            if (spinner.isSpinning) spinner.stop();
        };

        const restartSpinnerAfterOutput = () => {
            if (!finished && action.showOutput && !spinner.isSpinning) {
                spinner.start(action.label);
            }
        };

        if (action.timeoutMs && action.timeoutMs > 0) {
            timeoutId = setTimeout(() => {
                child.kill("SIGTERM");
            }, action.timeoutMs);
        }

        child.stdout.on("data", (chunk) => {
            const text = chunk.toString();
            stdout += text;

            if (action.showOutput) {
                stopSpinnerForOutput();
                process.stdout.write(text);
                restartSpinnerAfterOutput();
            }
        });

        child.stderr.on("data", (chunk) => {
            const text = chunk.toString();
            stderr += text;

            if (action.showOutput) {
                stopSpinnerForOutput();
                process.stderr.write(text);
                restartSpinnerAfterOutput();
            }
        });

        child.on("error", (err) => {
            finished = true;
            if (timeoutId) clearTimeout(timeoutId);
            spinner.fail(chalk.red(`${action.label} — failed to start`));
            rejectPromise(
                new Error(`Failed to start post-action "${action.label}": ${err.message}`)
            );
        });

        child.on("close", (code, signal) => {
            finished = true;
            if (timeoutId) clearTimeout(timeoutId);

            if (signal) {
                spinner.fail(chalk.red(`${action.label} — terminated by signal ${signal}`));
                rejectPromise(
                    new Error(`Post-action "${action.label}" was terminated by signal ${signal}`)
                );
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
                        ? `Post-action "${action.label}" failed with exit code ${code}\n${output}`
                        : `Post-action "${action.label}" failed with exit code ${code}`
                )
            );
        });
    });
}

export function printPostActionsSummary(postActions, trigger) {
    const actions = getApplicablePostActions(postActions, trigger);
    if (actions.length === 0) return;

    console.log(`  Post-actions: ${chalk.cyan(actions.length)}`);
    for (const action of actions) {
        const details = [];

        if (action.on.length > 0) details.push(`on=${action.on.join(",")}`);
        if (action.cwd && action.cwd !== process.cwd()) details.push(`cwd=${action.cwd}`);
        if (Object.keys(action.env).length > 0) details.push(`env=${Object.keys(action.env).join(",")}`);
        if (action.continueOnError) details.push("continueOnError=true");
        if (action.timeoutMs) details.push(`timeout=${action.timeoutMs}ms`);

        console.log(
            `    · ${chalk.dim(action.label)}${details.length ? chalk.dim(` (${details.join(" | ")})`) : ""}`
        );
    }
}

export async function runPostActions(postActions, trigger) {
    const actions = getApplicablePostActions(postActions, trigger);
    if (actions.length === 0) return;

    validatePostActions(actions);

    console.log("\n" + chalk.bold("  Running post-actions:"));
    console.log(chalk.dim("  ─────────────────────────"));

    for (const action of actions) {
        try {
            await runCommand(action);
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