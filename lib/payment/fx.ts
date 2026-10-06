import "server-only";

export type UsdRate = { rate: number; date: string };

const cache = new Map<string, { expiresAt: number; value: UsdRate }>();

export async function getUsdRate(currency: string): Promise<UsdRate> {
  const normalized = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("La devise de ce produit est invalide.");
  if (normalized === "USD") return { rate: 1, date: new Date().toISOString().slice(0, 10) };

  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await fetch(`https://api.frankfurter.dev/v2/rate/${normalized.toLowerCase()}/usd`, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Le taux de conversion est indisponible pour cette devise.");
  const row = (await response.json()) as { base?: string; quote?: string; rate?: number; date?: string };
  if (row.base !== normalized || row.quote !== "USD" || !Number.isFinite(row.rate) || Number(row.rate) <= 0 || !row.date) {
    throw new Error("Le taux de conversion reçu est invalide. Réessayez dans quelques instants.");
  }
  const value = { rate: Number(row.rate), date: row.date };
  cache.set(normalized, { value, expiresAt: Date.now() + 60 * 60 * 1000 });
  return value;
}
