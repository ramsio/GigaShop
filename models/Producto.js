const mongoose = require('mongoose');

const ProductoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  precio: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0 },
  imagen: { type: String, default: 'default.png' },
  categoria: { type: String, required: true, trim: true },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Producto', ProductoSchema);
