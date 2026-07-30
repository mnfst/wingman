import { describe, expect, it } from 'vitest';
import { newDraftId, tabAfterClosing, type TabRef } from './drafts';

const tabs: TabRef[] = [
  { kind: 'history', id: 'h1' },
  { kind: 'history', id: 'h2' },
  { kind: 'draft', id: 'd1' },
  { kind: 'draft', id: 'd2' },
];

describe('newDraftId', () => {
  it('never repeats an id within a session', () => {
    const ids = new Set([newDraftId(), newDraftId(), newDraftId()]);
    expect(ids.size).toBe(3);
  });
});

describe('tabAfterClosing', () => {
  it('takes over with the tab to the right', () => {
    expect(tabAfterClosing(tabs, 0)).toEqual({ kind: 'history', id: 'h2' });
    expect(tabAfterClosing(tabs, 2)).toEqual({ kind: 'draft', id: 'd2' });
  });

  it('falls back to the left when the closed tab was last', () => {
    expect(tabAfterClosing(tabs, 3)).toEqual({ kind: 'draft', id: 'd1' });
  });

  // Crossing the history/draft boundary matters: closing the newest sent
  // request should land on the first draft, not on nothing.
  it('crosses from history into drafts', () => {
    expect(tabAfterClosing(tabs, 1)).toEqual({ kind: 'draft', id: 'd1' });
  });

  it('has nothing to offer when the last tab closes', () => {
    expect(tabAfterClosing([{ kind: 'draft', id: 'only' }], 0)).toBeUndefined();
  });
});
