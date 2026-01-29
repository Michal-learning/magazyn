const fmtPLN = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN"
});

function calculateCompoundMonthly(principal, monthly, rateAnnualPct, years) {
  const months = Math.max(0, Math.floor(years * 12));
  const r = Math.max(0, rateAnnualPct) / 100;
  const rMonthly = r / 12;

  let value = Math.max(0, principal);

  for (let i = 0; i < months; i++) {
    // najpierw rośnie
    value *= (1 + rMonthly);
    // potem dopłata (na koniec miesiąca)
    value += Math.max(0, monthly);
  }

  const totalContrib = Math.max(0, principal) + Math.max(0, monthly) * months;
  const profit = value - totalContrib;

  return { value, totalContrib, profit };
}

document.getElementById("calcForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const principal = Number(document.getElementById("principal").value);
  const monthly = Number(document.getElementById("monthly").value);
  const rate = Number(document.getElementById("rate").value);
  const years = Number(document.getElementById("years").value);

  const { value, totalContrib, profit } = calculateCompoundMonthly(principal, monthly, rate, years);

  document.getElementById("finalValue").textContent = fmtPLN.format(value);
  document.getElementById("totalContrib").textContent = fmtPLN.format(totalContrib);
  document.getElementById("profit").textContent = fmtPLN.format(profit);
});
