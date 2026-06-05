const FALLBACK_RATE = 3.65; // USD → ILS fallback if API unreachable

export async function getUsdIlsRate(): Promise<number> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=ILS");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { rates: { ILS: number } };
    const rate = data.rates?.ILS;
    if (!rate || typeof rate !== "number") throw new Error("unexpected response shape");
    return rate;
  } catch {
    console.warn(`  [currencyRate] frankfurter.app unavailable, using fallback rate ${FALLBACK_RATE}`);
    return FALLBACK_RATE;
  }
}
