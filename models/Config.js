const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  nombreTienda: { type: String, default: 'Mi Tienda Navideña' },
  moneda: { type: String, enum: ['$', 'C$', '€'], default: '$' },
  logo: { type: String, default: '' },
  headerBg: { type: String, default: '' },
  colores: {
    primario: { type: String, default: '#333333' },
    secundario: { type: String, default: '#f4f4f4' },
    texto: { type: String, default: '#ffffff' }
  },
  banner: {
    imagenes: { type: [String], default: [] },
    cabecera: { type: String, default: 'ESTA NAVIDAD LLEVA EL SEGUNDO PRODUCTO A MITAD DE PRECIO' },
    descripcion: { type: String, default: 'En esta navidad queremos darte un regalo especial...' },
    pie: { type: String, default: 'Condiciones aplican, válido hasta el 24 de diciembre.' },
    estilos: {
      colorTexto: { type: String, default: '#ff0000' },
      colorBorde: { type: String, default: '#00ff00' },
      tamanoLetra: { type: String, default: '24px' }
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Config', ConfigSchema);
