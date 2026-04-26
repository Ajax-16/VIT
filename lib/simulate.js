/**
 * simulate.js — runs preActions in dry-run mode before the user confirms.
 * Triggered automatically when `config.simulate` is truthy.
 *
 * The simulation:
 *  1. Runs all applicable preActions exactly as in production.
 *  2. Reports success or failure.
 *  3. On failure: lets the user retry (re-runs from step 1) or abort.
 *  4. On success: returns so the caller can proceed to the confirmation prompt.
 */
import chalk from "chalk";
import inquirer from "inquirer";
import { runPreActions } from "./pre-actions.js";

/**
 * Prints the simulation header banner.
 * @param {string} trigger
 */
function printSimulateHeader(trigger) {
  console.log(
    "\n" +
    chalk.bgYellow.black.bold("  SIMULATE  ") +
    "  " +
    chalk.yellow.bold("Running preActions in simulation mode") +
    chalk.dim(` (trigger: ${trigger})`) +
    "\n"
  );
}

/**
 * Prints the simulation result banner.
 * @param {boolean} success
 */
function printSimulateResult(success) {
  if (success) {
    console.log(
      "\n" +
      chalk.bgGreen.black.bold("  SIMULATE  ") +
      "  " +
      chalk.green.bold("Simulation passed ✔") +
      "\n"
    );
  } else {
    console.log(
      "\n" +
      chalk.bgRed.white.bold("  SIMULATE  ") +
      "  " +
      chalk.red.bold("Simulation failed ✖") +
      "\n"
    );
  }
}

/**
 * Runs the preflight simulation loop.
 * Keeps re-running until the user aborts or the simulation passes.
 *
 * @param {object} config  - Full vit config
 * @param {string} trigger - Current trigger ("release", "commit", ...)
 * @returns {Promise<void>} Resolves when simulation passes, calls process.exit(0) if aborted.
 */
export async function runSimulation(config, trigger) {
  while (true) {
    printSimulateHeader(trigger);

    let passed = false;

    try {
      await runPreActions(config, trigger);
      passed = true;
    } catch (err) {
      console.error(
        chalk.red(`  ✖ ${err.message}`) +
        (err.original ? chalk.dim(`\n    └─ ${err.original.message}`) : "")
      );
    }

    printSimulateResult(passed);

    if (passed) return;

    // Simulation failed — ask the user what to do
    const { choice } = await inquirer.prompt([
      {
        type: "list",
        name: "choice",
        message: "Simulation failed. What do you want to do?",
        choices: [
          { name: "🔁  Retry simulation", value: "retry" },
          { name: "❌  Abort", value: "abort" },
        ],
      },
    ]);

    if (choice === "abort") {
      console.log(chalk.yellow("\n  Simulation aborted. No changes made.\n"));
      process.exit(0);
    }

    // choice === "retry" → loop again
    console.log(chalk.dim("\n  Retrying simulation...\n"));
  }
}
