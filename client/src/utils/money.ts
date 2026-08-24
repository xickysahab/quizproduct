/**
 * Money arrives from the API in paise, always as an integer.
 *
 * Converting to rupees is a display step and nothing else — no total is ever
 * recomputed here. The server's arithmetic is the one that ends up on a tax
 * invoice, and two places doing the same rounding is two places to disagree.
 */
export const formatRupees = (paise: number): string =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** For prices in a heading, where trailing ".00" is noise. */
export const formatRupeesShort = (paise: number): string =>
  paise % 100 === 0
    ? `₹${(paise / 100).toLocaleString('en-IN')}`
    : formatRupees(paise);
