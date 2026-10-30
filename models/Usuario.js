const mongoose = require('mongoose');

const ItemCarritoSchema = new mongoose.Schema({
  producto: {
    id: { type: String, required: true },
    nombre: { type: String, required: true },
    precio: { type: Number, required: true },
    imagen: { type: String, default: 'default.png' },
    categoria: { type: String, required: true }
  },
  fecha: { type: Date, default: Date.now },
  estado: { type: String, enum: ['pendiente_pago', 'pendiente_retiro', 'cancelado'], default: 'pendiente_pago' },
  id_compra: { type: Number, required: true }
}, { _id: false });

const UsuarioSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  nombre: { type: String, required: true },
  esAdmin: { type: Boolean, default: false },
  carrito: { type: [ItemCarritoSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Usuario', UsuarioSchema);
