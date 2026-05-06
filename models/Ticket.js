const mongoose = require("mongoose");

const TicketSchema = new mongoose.Schema({
  nome: String,
  email: String,
  assunto: String,
  mensagem: String,
  status: {
    type: String,
    default: "aberto"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Ticket", TicketSchema);