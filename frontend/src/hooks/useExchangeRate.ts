// No USD→INR conversion — backend stores values directly in ₹
// fmtINR just adds ₹ symbol with Indian number formatting

export function useExchangeRate() {
  const fmtINR = (amount: number, decimals = 0) =>
    "₹" + amount.toLocaleString("en-IN", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });

  return { rate: 1, toINR: (n: number) => n, fmtINR };
}
