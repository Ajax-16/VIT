/**
 * post-actions.js — thin re-export kept for backwards compatibility.
 * All logic lives in lib/actions.js.
 */
import { runActions, printActionsSummary } from "./actions.js";

export function printPostActionsSummary(config, trigger) {
  printActionsSummary(config.postActions, trigger, "post-actions");
}

export async function runPostActions(config, trigger) {
  await runActions(config.postActions, trigger, "post-actions", config.envFile ?? null);
}