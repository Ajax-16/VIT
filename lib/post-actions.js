/**
 * post-actions.js — thin re-export kept for backwards compatibility.
 * All logic lives in lib/actions.js.
 */
import { printActionsSummary, runActions } from "./actions.js";

export function printPostActionsSummary(postActions, trigger) {
  printActionsSummary(postActions, trigger, "Post-actions");
}

export async function runPostActions(postActions, trigger) {
  await runActions(postActions, trigger, "post-actions");
}
