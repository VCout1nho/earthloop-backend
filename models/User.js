const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  nome: String,
  email: {
    type: String,
    unique: true
  },
  senha: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", UserSchema);