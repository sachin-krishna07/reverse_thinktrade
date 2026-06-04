// Display values in USDT/USD
export function useExchangeRate() {
  const fmtINR = (amount: number, decimals = 2) =>
    "$" + amount.toLocaleString("en-US", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });

  return { rate: 1, toINR: (n: number) => n, fmtINR };
}
