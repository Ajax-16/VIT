import { gitAdapter } from "./providers/git.js";
import { noneAdapter } from "./providers/none.js";

export function getVcsAdapter(provider = "git") {
    switch ((provider || "git").toLowerCase()) {
        case "none":
            return noneAdapter;
        case "git":
        default:
            return gitAdapter;
    }
}

export function vcsLabel(provider = "git") {
    switch ((provider || "git").toLowerCase()) {
        case "none":
            return "Sin VCS";
        case "git":
            return "Git";
        default:
            return provider;
    }
}