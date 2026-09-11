/** Which tokens two runs share, by a longest common subsequence over token text. Pure, unit-tested. */

export interface Alignment {
  /** Per token of `a`: true when it is part of the common subsequence. */
  a: boolean[];
  b: boolean[];
  /** Tokens in common. */
  common: number;
}

export function alignTokens(a: string[], b: string[]): Alignment {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const sa = new Array<boolean>(n).fill(false);
  const sb = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      sa[i] = true;
      sb[j] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { a: sa, b: sb, common: dp[0][0] };
}
