"use client";

import { usePersistedState } from "./persisted";

/** How the numbers are drawn. Shared by both modes; changing it never generates anything. */
export interface ViewState {
  /** Decimals shown on probabilities. */
  digits: number;
  /** Log-scale bars so tiny probabilities stay visible. */
  logBars: boolean;
  /** Rows per top-K list. The backend always reports `TOP_K_REPORT`; this only trims. */
  rows: number;
}

export const MAX_ROWS = 20;
export const DIGIT_CHOICES = [1, 2, 3, 4, 6];

const KEY = "sol.view";
const initial: ViewState = { digits: 1, logBars: false, rows: 8 };

export function useViewState(): [ViewState, (patch: Partial<ViewState>) => void] {
  return usePersistedState(KEY, initial);
}
