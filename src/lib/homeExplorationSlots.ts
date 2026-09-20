// Legacy/inert as of Homepage 3.0 Modular Interaction Redesign Phase B.1 --
// this was Homepage 2.0's EXPLORE tab (6 owner-configured slot references,
// switched by the hero tabs), but the live Homepage no longer reads this
// store at all (HomeProjectFlow.tsx renders the canonical catalog directly,
// sorted by archiveOrder, with no PROJECT/EXPLORE categorization) and
// `/work` no longer has UI to edit it. Kept, not deleted, per this
// project's non-destructive-migration rule -- still used by
// deletePortfolioProject.ts to clear a dangling reference on permanent
// deletion, and still carried through the publish bundle export/import
// pipeline so the old data stays in sync rather than going stale. See
// homeSlotsStore.ts for the shared implementation this and
// homeProjectSlots.ts both instantiate.

import { getPublishedHomeExplorationSlots } from "./publishedPortfolio";
import { createHomeSlotsStore, HOME_SLOT_COUNT, type HomeSlotConfig } from "./homeSlotsStore";

export type HomeExplorationSlotConfig = HomeSlotConfig;
export const HOME_EXPLORATION_SLOT_COUNT = HOME_SLOT_COUNT;

const store = createHomeSlotsStore("dilida-portfolio:home-exploration-slots:v1", getPublishedHomeExplorationSlots);

export const loadHomeExplorationSlots = store.load;
export const saveHomeExplorationSlots = store.save;
export const useHomeExplorationSlots = store.useSlots;
