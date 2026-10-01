type Quote = { rate: number; date: string };
const HOUR = 60 * 60 * 1000;
const MAX_SOURCE_AGE = 7 * 24 * HOUR;

// A reader has its own cache so tests can use a controlled clock and transport.
export function createExchangeRateReader(
  transport: typeof fetch = fetch,
  clock: () => number = Date.now,
) {
  const cache = new Map<string, Quote & { fetchedAt: number }>();
  const pending = new Map<string, Promise<Quote | null>>();
  const retryAt = new Map<string, number>();
  const recent = (quote: Quote) => {
    const date = Date.parse(quote.date + "T00:00:00Z");
    return (
      Number.isFinite(date) &&
      date <= clock() &&
      clock() - date <= MAX_SOURCE_AGE
    );
  };
  return async function readRate(currency: string): Promise<Quote | null> {
    currency = currency.toUpperCase();
    if (currency === "USD")
      return { rate: 1, date: new Date(clock()).toISOString().slice(0, 10) };
    if (!["TRY", "EUR", "GBP"].includes(currency)) return null;
    const previous = cache.get(currency);
    if (previous && recent(previous) && clock() - previous.fetchedAt < HOUR)
      return previous;
    const fallback = () =>
      previous && recent(previous) && clock() - previous.fetchedAt < 24 * HOUR
        ? previous
        : null;
    if (pending.has(currency)) return pending.get(currency)!;
    if ((retryAt.get(currency) || 0) > clock()) return fallback();
    const task = (async () => {
      try {
        const response = await transport(
          `https://api.frankfurter.dev/v2/rate/USD/${currency}`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) throw new Error("Exchange rate unavailable");
        const data = await response.json();
        if (
          data.base !== "USD" ||
          data.quote !== currency ||
          typeof data.rate !== "number" ||
          !Number.isFinite(data.rate) ||
          data.rate <= 0 ||
          typeof data.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
          !recent(data)
        )
          throw new Error("Invalid exchange rate");
        const quote = { rate: data.rate, date: data.date, fetchedAt: clock() };
        cache.set(currency, quote);
        retryAt.delete(currency);
        return quote;
      } catch {
        retryAt.set(currency, clock() + 60_000);
        return fallback();
      } finally {
        pending.delete(currency);
      }
    })();
    pending.set(currency, task);
    return task;
  };
}

export const usdExchangeRate = createExchangeRateReader();
