// frontend/app.js

const API_BASE = "http://localhost:5000/api";

let applianceChart = null;
let dateChart = null;
let predictionChart = null;

document.addEventListener("DOMContentLoaded", () => {
  // AUTH CHECK
  const userEmail = localStorage.getItem("userEmail");
  const userName = localStorage.getItem("userName");

  if (!userEmail) {
    window.location.href = "login.html";
    return;
  }

  // Show welcome text
  const welcomeEl = document.getElementById("welcomeUser");
  if (welcomeEl) {
    welcomeEl.textContent = `Logged in as ${userName || userEmail}`;
  }

  // Dark mode initial
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
  }

  // Listeners
  const form = document.getElementById("usageForm");
  const msg = document.getElementById("formMessage");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    const payload = {
      userEmail,
      date: document.getElementById("date").value,
      applianceName: document.getElementById("applianceName").value.trim(),
      watts: Number(document.getElementById("watts").value),
      hoursPerDay: Number(document.getElementById("hoursPerDay").value),
      days: Number(document.getElementById("days").value),
      ratePerUnit: Number(document.getElementById("ratePerUnit").value),
    };

    try {
      const res = await fetch(`${API_BASE}/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        msg.style.color = "#dc2626";
        msg.textContent = err.message || "Failed to save usage";
        return;
      }

      msg.style.color = "#16a34a";
      msg.textContent = "Usage saved successfully!";
      form.reset();
      loadAllData(userEmail);
    } catch (error) {
      console.error(error);
      msg.style.color = "#dc2626";
      msg.textContent = "Server error. Please check backend.";
    }
  });

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    window.location.href = "login.html";
  });

  // Dark mode toggle
  document.getElementById("darkToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const mode = document.body.classList.contains("dark-mode") ? "dark" : "light";
    localStorage.setItem("theme", mode);
  });

  // Budget save
  document.getElementById("saveBudget").addEventListener("click", () => {
    const val = Number(document.getElementById("budgetAmount").value);
    if (isNaN(val) || val < 0) return;
    localStorage.setItem("budgetAmount", String(val));
    updateBudgetStatus(); // will use latest summary
  });

  // Set initial budget field
  const storedBudget = localStorage.getItem("budgetAmount");
  if (storedBudget) {
    document.getElementById("budgetAmount").value = storedBudget;
  }

  // PDF download
  document.getElementById("downloadPdf").addEventListener("click", downloadPdfReport);

  // Load data
  loadAllData(userEmail);
});

async function loadAllData(userEmail) {
  await Promise.all([
    loadTable(userEmail),
    loadSummaryAndCharts(userEmail),
    loadPrediction(userEmail),
  ]);
}

// TABLE
async function loadTable(userEmail) {
  const tbody = document.getElementById("usageTableBody");
  tbody.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/usage?email=${encodeURIComponent(userEmail)}`);
    const data = await res.json();

    data.forEach((item) => {
      const tr = document.createElement("tr");
      const dateStr = new Date(item.date).toISOString().split("T")[0];

      tr.innerHTML = `
        <td>${dateStr}</td>
        <td>${item.applianceName}</td>
        <td>${item.watts}</td>
        <td>${item.hoursPerDay}</td>
        <td>${item.days}</td>
        <td>${item.kWh.toFixed(2)}</td>
        <td>₹${item.cost.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error loading table:", err);
  }
}

// SUMMARY + APPLIANCE + DATE CHARTS + BUDGET
async function loadSummaryAndCharts(userEmail) {
  try {
    const res = await fetch(
      `${API_BASE}/usage/summary?email=${encodeURIComponent(userEmail)}`
    );
    const summary = await res.json();

    document.getElementById(
      "totalKWh"
    ).textContent = `${summary.totalKWh.toFixed(2)} kWh`;
    document.getElementById(
      "totalCost"
    ).textContent = `₹${summary.totalCost.toFixed(2)}`;

    // Current month cost
    const perMonthCost = summary.perMonthCost || {};
    const months = Object.keys(perMonthCost).sort();
    let currentMonthCost = 0;
    if (months.length > 0) {
      const lastMonthKey = months[months.length - 1];
      currentMonthCost = perMonthCost[lastMonthKey];
    }
    document.getElementById(
      "currentMonthCost"
    ).textContent = `₹${currentMonthCost.toFixed(2)}`;

    // Budget status
    updateBudgetStatus(currentMonthCost);

    // Appliance chart
    const applianceLabels = Object.keys(summary.perAppliance || {});
    const applianceValues = Object.values(summary.perAppliance || {});
    renderBarChart("applianceChart", applianceLabels, applianceValues, "kWh");

    // Date chart
    const dateLabels = Object.keys(summary.perDate || {}).sort();
    const dateValues = dateLabels.map((d) => summary.perDate[d]);
    renderLineChart("dateChart", dateLabels, dateValues, "kWh");
  } catch (err) {
    console.error("Error loading summary:", err);
  }
}

// BILL PREDICTION
async function loadPrediction(userEmail) {
  try {
    const res = await fetch(
      `${API_BASE}/usage/prediction?email=${encodeURIComponent(userEmail)}`
    );
    const data = await res.json();

    document.getElementById(
      "predictedBill"
    ).textContent = `₹${data.predictedCost.toFixed(2)}`;

    const labels = data.months || [];
    const costs = data.costs || [];
    const extendedLabels = [...labels];
    const extendedCosts = [...costs];

    if (labels.length > 0) {
      const last = labels[labels.length - 1];
      // rough "next month" label
      const [year, month] = last.split("-").map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const nextLabel = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
      extendedLabels.push(nextLabel);
      extendedCosts.push(data.predictedCost);
    }

    renderPredictionChart("predictionChart", extendedLabels, extendedCosts, costs.length);
  } catch (err) {
    console.error("Prediction load error:", err);
  }
}

// Budget status helper
function updateBudgetStatus(currentMonthCost = null) {
  const budgetMsg = document.getElementById("budgetStatus");
  const budgetStr = localStorage.getItem("budgetAmount");
  if (!budgetStr) {
    budgetMsg.style.color = "#4b5563";
    budgetMsg.textContent = "No budget set.";
    return;
  }

  const budget = Number(budgetStr);
  if (currentMonthCost === null) {
    budgetMsg.style.color = "#4b5563";
    budgetMsg.textContent = `Budget set to ₹${budget.toFixed(2)}.`;
    return;
  }

  if (currentMonthCost > budget) {
    budgetMsg.style.color = "#dc2626";
    budgetMsg.textContent = `Alert: Your current month bill (₹${currentMonthCost.toFixed(
      2
    )}) exceeds your budget of ₹${budget.toFixed(2)}.`;
  } else {
    budgetMsg.style.color = "#16a34a";
    budgetMsg.textContent = `Good: Your current bill (₹${currentMonthCost.toFixed(
      2
    )}) is within the budget of ₹${budget.toFixed(2)}.`;
  }
}

// CHART FUNCTIONS
// CHART FUNCTIONS  ------------------------------

function renderBarChart(canvasId, labels, data, yLabel) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (applianceChart) applianceChart.destroy();

  applianceChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: yLabel,
          data,
          backgroundColor: "#4ea0ff"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: {
            color: "#ffffff",  // WHITE LABELS
            font: { size: 13 }
          },
          grid: { color: "rgba(255,255,255,0.15)" }
        },
        y: {
          ticks: {
            color: "#ffffff",  // WHITE LABELS
            font: { size: 13 }
          },
          grid: { color: "rgba(255,255,255,0.15)" },
          beginAtZero: true
        }
      }
    }
  });
}



function renderLineChart(canvasId, labels, data, yLabel) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (dateChart) dateChart.destroy();

  dateChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: yLabel,
          data,
          tension: 0.3,
          borderColor: "#4ea0ff",
          pointBackgroundColor: "#4ea0ff"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: {
        x: {
          ticks: {
            color: "#ffffff",  // WHITE LABELS
            font: { size: 13 }
          },
          grid: { color: "rgba(255,255,255,0.15)" }
        },
        y: {
          ticks: {
            color: "#ffffff",
            font: { size: 13 }
          },
          grid: { color: "rgba(255,255,255,0.15)" },
          beginAtZero: true
        }
      }
    }
  });
}



function renderPredictionChart(canvasId, labels, data, realLength) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (predictionChart) predictionChart.destroy();

  predictionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Monthly Cost (₹)",
          data,
          tension: 0.3,
          borderColor: "#4ea0ff",
          pointBackgroundColor: "#4ea0ff"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: {
        x: {
          ticks: {
            color: "#ffffff",  // WHITE LABELS
            font: { size: 13 }
          },
          grid: { color: "rgba(255,255,255,0.15)" }
        },
        y: {
          ticks: {
            color: "#ffffff",
            font: { size: 13 }
          },
          grid: { color: "rgba(255,255,255,0.15)" },
          beginAtZero: true
        }
      }
    }
  });
}

// PDF REPORT
async function downloadPdfReport() {
  const dashboard = document.getElementById("dashboardRoot");
  const { jsPDF } = window.jspdf;

  const canvas = await html2canvas(dashboard, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
  pdf.save("electricity-dashboard-report.pdf");
}
