import type { PinSuggestion } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { deploymentOffers, environmentOffers, projectOffers, proposalOffers, releaseOffers, repoOffers, taskOffers, viewOffers, type Offer } from "./server/pin-offers";

// 081 amendments 2 and 3 (AC-30, AC-38): every pinnable Delivery record and view offers, in chat, the actions that fit
// it now, as Time's pinned weeks do (073). Keyed by the read tool its pin resolves through; the offers are in
// server/pin-offers.ts. Activity lines and pushes are news, with nothing to act on, so they offer nothing (AC-40).
type Suggest = (v: Viewer, a: Record<string, unknown>) => Promise<Offer[]>;
const on = (tool: string, suggest: Suggest): PinSuggestion => ({ tool, suggest: suggest as PinSuggestion["suggest"] });

export const pinSuggestions: PinSuggestion[] = [
  on("get_project", projectOffers),
  on("get_proposal", proposalOffers),
  on("get_proposal_task", taskOffers),
  on("get_release", releaseOffers),
  on("get_release_history", releaseOffers),
  on("get_environment", environmentOffers),
  on("get_deployment", deploymentOffers),
  on("get_repo_sync", repoOffers),
  on("list_proposals", (v, a) => viewOffers(v, a, "proposals")),
  on("get_proposal_metrics", (v, a) => viewOffers(v, a, "proposals")),
  on("list_releases", (v, a) => viewOffers(v, a, "releases")),
  on("list_environments", (v, a) => viewOffers(v, a, "environments")),
  on("list_projects", (v, a) => viewOffers(v, a, "projects")),
];
