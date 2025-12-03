// backend/models/Usage.js
const mongoose = require("mongoose");

const usageSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true, // so each record belongs to a user
    lowercase: true,
    trim: true,
  },
  date: {
    type: Date,
    required: true,
  },
  applianceName: {
    type: String,
    required: true,
  },
  watts: {
    type: Number,
    required: true,
  },
  hoursPerDay: {
    type: Number,
    required: true,
  },
  days: {
    type: Number,
    required: true,
  },
  kWh: {
    type: Number,
    required: true,
  },
  cost: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model("Usage", usageSchema);
