/**
 * pre-actions.js — runs before commit/bump/push.
 * Shares all logic with post-actions via lib/actions.js.
 */
import { printActionsSummary, runActions } from "./actions.js";

export function printPreActionsSummary(preActions, trigger) {
  printActionsSummary(preActions, trigger, "Pre-actions");
}

export async function runPreActions(preActions, trigger) {
  await runActions(preActions, trigger, "pre-actions");
}
