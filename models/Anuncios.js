const mongoose = require("mongoose");

const AnuncioSchema = new mongoose.Schema({
  businessName: { type: String, required: true },
  location:     { type: String, required: true },
  contact:      { type: String, required: true },
  itemName:     { type: String, required: true },
  quantity:     { type: Number, required: true },
  price:        { type: Number, default: 0 },
  type:         { type: String, enum: ["doacao", "venda"], default: "doacao" },
  description:  { type: String, default: "" },
  imagePreview: { type: String, default: "" },
  lat:          { type: Number },
  lng:          { type: Number },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Anuncio", AnuncioSchema);