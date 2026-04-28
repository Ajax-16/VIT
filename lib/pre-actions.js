/**
 * pre-actions.js — runs before commit/bump/push.
 * Shares all logic with post-actions via lib/actions.js.
 */
import { runActions, printActionsSummary } from "./actions.js";

export function printPreActionsSummary(config, trigger) {
  printActionsSummary(config.preActions ?? [], trigger, "pre-actions");
}

export async function runPreActions(config, trigger) {
  await runActions(
    config.preActions ?? [],
    trigger,
    "pre-actions",
    config.envFile ?? null,
    config.projects ?? [],
  );
}
