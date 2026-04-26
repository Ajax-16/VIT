import { spawn } from "child_process";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";

const VALID_TRIGGERS = ["release", "commit", "changelog"];

function interpolateEnvValue(value, env) {
    if (typeof value !== "string") return value;
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => env[key] ?? "");
}

function interpolateCommand(command, env) {
    if (typeof command !== "string") return command;
    return command.replace(/\$\{([^}]+)\}/g, (_, key) => env[key] ?? "");
}

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
        promptEnv: Array.isArray(action.promptEnv) ? action.promptEnv : [],
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

async function resolvePromptEnv(action) {
    const resolved = {};

    console.log(chalk.gray(`  [debug] promptEnv for "${action.label}":`));
    console.log(chalk.gray(JSON.stringify(action.promptEnv, null, 2)));

    for (const promptDef of action.promptEnv) {
        if (!promptDef?.name) continue;

        console.log(chalk.gray(`  [debug] asking for ${promptDef.name}`));

        const answer = await inquirer.prompt([
            {
                type: "input",
                name: "value",
                message: promptDef.message ?? `Value for ${promptDef.name}:`,
                validate:
                    promptDef.validate === "otp"
                        ? (v) => /^\d{6}$/.test(v) || "OTP must be a 6-digit code"
                        : (v) => (String(v).trim().length > 0 || `${promptDef.name} cannot be empty`),
            },
        ]);

        resolved[promptDef.name] = String(answer.value).trim();

        console.log(chalk.gray(`  [debug] received ${promptDef.name}: ${resolved[promptDef.name]}`));
    }

    return resolved;
}

async function buildActionRuntime(action) {
    console.log(chalk.gray(`  [debug] building runtime for "${action.label}"`));
    console.log(chalk.gray(`  [debug] original command: ${action.command}`));

    const promptedEnv = await resolvePromptEnv(action);

    const mergedEnv = {
        ...process.env,
        ...action.env,
        ...promptedEnv,
    };

    const interpolatedEnv = Object.fromEntries(
        Object.entries(mergedEnv).map(([key, value]) => [
            key,
            typeof value === "string" ? interpolateEnvValue(value, mergedEnv) : value,
        ])
    );

    const interpolatedCommand = interpolateCommand(action.command, interpolatedEnv);

    console.log(chalk.gray(`  [debug] interpolated command: ${interpolatedCommand}`));
    console.log(
        chalk.gray(
            `  [debug] env keys: ${Object.keys(action.env).join(", ") || "(none)"}`
        )
    );

    return {
        ...action,
        runtimeEnv: interpolatedEnv,
        runtimeCommand: interpolatedCommand,
    };
}

function runCommand(action) {
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
        if (Object.keys(action.env).length > 0) {
            details.push(`env=${Object.keys(action.env).join(",")}`);
        }
        if (action.promptEnv.length > 0) {
            details.push(`promptEnv=${action.promptEnv.map((p) => p.name).join(",")}`);
        }
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
            const runtimeAction = await buildActionRuntime(action);
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