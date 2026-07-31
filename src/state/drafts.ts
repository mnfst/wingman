// Draft tabs: requests that haven't been sent yet.
//
// A sent request becomes a history entry and gets its own tab. Everything
// before that lives in a draft, and "+" makes a new one. There used to be a
// single implicit draft, which is why "+" appeared to do nothing: it cleared
// the one draft in place instead of opening a tab you could see.
import type { ApiFormatId } from '../formats';
import type { ProfileLang } from '../profiles';

/**
 * The request setup a draft carries. Without it, every tab would share one
 * global form: retargeting tab B's model would silently retarget tab A too.
 * Captured when a draft loses focus, re-applied when it regains it.
 */
export interface DraftConfig {
  providerId: string;
  baseUrl: string;
  model: string;
  formatId: ApiFormatId;
  profileId: string;
  stream: boolean;
  lang: ProfileLang;
}

export interface DraftTab {
  id: string;
  /** Unsent message text. */
  message: string;
  /** Setup parked on the last tab switch; absent until the tab is first left. */
  config?: DraftConfig;
}

let sequence = 0;

/** Session-unique id. Drafts are never persisted, so a counter is enough. */
export function newDraftId(): string {
  sequence += 1;
  return `draft-${sequence}`;
}

/** One tab in the strip: history entries first (oldest → newest), then drafts. */
export interface TabRef {
  kind: 'history' | 'draft';
  id: string;
}

/**
 * Which tab to activate after closing the one at `index`: the tab to its right,
 * falling back to the one on its left, which is what browsers and Postman do.
 */
export function tabAfterClosing(tabs: TabRef[], index: number): TabRef | undefined {
  return tabs[index + 1] ?? tabs[index - 1];
}
