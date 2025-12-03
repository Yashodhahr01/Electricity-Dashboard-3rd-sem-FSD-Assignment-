// backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const Usage = require("./models/Usage");
const User = require("./models/User");

const app = express();
const PORT = 5000;

const MONGO_URI = "mongodb://127.0.0.1:27017/electricity_dashboard";

app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Helper: calculate kWh and cost
function calculateKwhAndCost(watts, hoursPerDay, days, ratePerUnit) {
  const kWh = (watts * hoursPerDay * days) / 1000;
  const cost = kWh * ratePerUnit;
  return { kWh, cost };
}

/* ------------------ AUTH (simple login/signup) ------------------ */

// POST /api/signup
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const user = new User({ name, email, password }); // plain password (demo)
    await user.save();

    res.status(201).json({
      message: "Signup successful",
      email: user.email,
      name: user.name,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // No JWT, just send back user info
    res.json({
      message: "Login successful",
      email: user.email,
      name: user.name,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ USAGE CRUD + ANALYTICS ------------------ */

// POST /api/usage  (add record for a user)
app.post("/api/usage", async (req, res) => {
  try {
    const {
      userEmail,
      date,
      applianceName,
      watts,
      hoursPerDay,
      days,
      ratePerUnit = 8,
    } = req.body;

    if (!userEmail || !date || !applianceName || !watts || !hoursPerDay || !days) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const { kWh, cost } = calculateKwhAndCost(
      Number(watts),
      Number(hoursPerDay),
      Number(days),
      Number(ratePerUnit)
    );

    const usage = new Usage({
      userEmail: userEmail.toLowerCase(),
      date: new Date(date),
      applianceName,
      watts,
      hoursPerDay,
      days,
      kWh,
      cost,
    });

    const saved = await usage.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("Error saving usage:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/usage?email=...
app.get("/api/usage", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const usageList = await Usage.find({ userEmail: email.toLowerCase() }).sort({
      date: 1,
    });
    res.json(usageList);
  } catch (err) {
    console.error("Error fetching usage:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/usage/summary?email=...
app.get("/api/usage/summary", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const usageList = await Usage.find({ userEmail: email.toLowerCase() }).sort({
      date: 1,
    });

    const perAppliance = {};
    const perDate = {};
    const perMonthCost = {};

    usageList.forEach((entry) => {
      // Appliance-wise
      if (!perAppliance[entry.applianceName]) {
        perAppliance[entry.applianceName] = 0;
      }
      perAppliance[entry.applianceName] += entry.kWh;

      // Date-wise (YYYY-MM-DD)
      const d = entry.date.toISOString().split("T")[0];
      if (!perDate[d]) perDate[d] = 0;
      perDate[d] += entry.kWh;

      // Month cost (YYYY-MM)
      const monthKey = entry.date.toISOString().slice(0, 7);
      if (!perMonthCost[monthKey]) perMonthCost[monthKey] = 0;
      perMonthCost[monthKey] += entry.cost;
    });

    const totalKWh = usageList.reduce((sum, e) => sum + e.kWh, 0);
    const totalCost = usageList.reduce((sum, e) => sum + e.cost, 0);

    res.json({
      perAppliance,
      perDate,
      perMonthCost,
      totalKWh,
      totalCost,
    });
  } catch (err) {
    console.error("Error building summary:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/usage/prediction?email=...
// Simple bill prediction using average of last 3 months
app.get("/api/usage/prediction", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const usageList = await Usage.find({ userEmail: email.toLowerCase() }).sort({
      date: 1,
    });

    const monthMap = {}; // { '2025-01': totalCost, ... }

    usageList.forEach((entry) => {
      const key = entry.date.toISOString().slice(0, 7); // YYYY-MM
      if (!monthMap[key]) monthMap[key] = 0;
      monthMap[key] += entry.cost;
    });

    const months = Object.keys(monthMap).sort();
    const costs = months.map((m) => monthMap[m]);

    let predictedCost = 0;
    if (costs.length > 0) {
      const lastThree = costs.slice(-3);
      const sum = lastThree.reduce((a, b) => a + b, 0);
      predictedCost = sum / lastThree.length;
    }

    res.json({
      months,
      costs,
      predictedCost,
    });
  } catch (err) {
    console.error("Prediction error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
