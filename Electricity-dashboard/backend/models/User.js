// backend/models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  // NOTE: For simplicity plain text. Not secure for real apps.
  password: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("User", userSchema);
