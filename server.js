require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Producto = require('./models/Producto');
const Usuario = require('./models/Usuario');
const Config = require('./models/Config');
const Categoria = require('./models/Categoria');

const app = express();  

// Conexión MongoDB (Atlas/Local)
mongoose.connect(process.env.MONGO_URL, { dbName: 'eshop_navidad' })
  .then(() => console.log('MongoDB conectado'))
  .catch(err => console.error('Error MongoDB:', err));

// Semilla inicial de categorías
async function seedCategorias() {
  const count = await Categoria.countDocuments();
  if (count === 0) {
    await Categoria.insertMany([
      { nombre: 'Tecnología' },
      { nombre: 'Juguetes' },
      { nombre: 'Hogar' },
      { nombre: 'Ropa' }
    ]);
    console.log('Categorías iniciales creadas');
  }
}
seedCategorias();

// Asegurar carpetas públicas
['public/images/productos', 'public/images/banner', 'public/images/config'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Configuración Express/EJS
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secreto-navideno',
  resave: false,
  saveUninitialized: false
}));

// Multer: storage y validación de extensiones
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const name = (file.fieldname || '').toLowerCase();
    if (name.startsWith('img') || name.includes('banner')) cb(null, 'public/images/banner');
    else if (name === 'logo' || name === 'headerbg') cb(null, 'public/images/config');
    else cb(null, 'public/images/productos');
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-');
    cb(null, Date.now() + '-' + safeName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Tipo de archivo no permitido. Solo imágenes.'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Obtener/crear config global
async function getConfig() {
  let cfg = await Config.findOne();
  if (!cfg) {
    cfg = await Config.create({});
  }
  return cfg;
}

// Middleware global: inyecta config, user y cartCount en todas las vistas
app.use(async (req, res, next) => {
  try {
    const cfg = await getConfig();
    res.locals.config = cfg;
    res.locals.user = req.session.user || null;

    let cartCount = 0;
    if (req.session.user) {
      const u = await Usuario.findById(req.session.user.id).select('carrito');
      if (u && Array.isArray(u.carrito)) {
        cartCount = u.carrito.filter(c => c.estado === 'pendiente_pago').length;
      }
    }
    res.locals.cartCount = cartCount;
    next();
  } catch (err) {
    next(err);
  }
});

// Middlewares de auth
const requireAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
};
const requireUser = (req, res, next) => {
  if (req.session.user) return next();
  res.redirect('/login');
};

// --- RUTAS ADMIN ---
app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const productos = await Producto.find().sort({ createdAt: -1 });
    const categorias = await Categoria.find().sort({ nombre: 1 });
    res.render('admin/dashboard', {
      productos,
      categorias,
      bannerConfig: cfg.banner,
      config: cfg
    });
  } catch (err) { next(err); }
});

app.get('/admin/login', (req, res) => res.render('admin/login'));

app.post('/admin/login', (req, res) => {
  const { user, pass } = req.body;
  if (user === 'admin' && pass === 'admin') {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.send('Credenciales incorrectas');
  }
});

// Guardar configuración (logo, header)
app.post('/admin/config', requireAdmin, upload.fields([{ name: 'logo' }, { name: 'headerBg' }]), async (req, res, next) => {
  try {
    const { nombreTienda, moneda, colorPrimario, colorSecundario } = req.body;
    const cfg = await getConfig();

    if (nombreTienda) cfg.nombreTienda = nombreTienda;
    if (moneda) cfg.moneda = moneda;
    if (colorPrimario) cfg.colores.primario = colorPrimario;
    if (colorSecundario) cfg.colores.secundario = colorSecundario;

    if (req.files?.logo?.[0]) cfg.logo = req.files.logo[0].filename;
    if (req.files?.headerBg?.[0]) cfg.headerBg = req.files.headerBg[0].filename;

    await cfg.save();
    res.redirect('/admin');
  } catch (err) { next(err); }
});

// Agregar producto
app.post('/admin/producto', requireAdmin, upload.single('imagenProducto'), async (req, res, next) => {
  try {
    const { nombre, precio, categoria, stock } = req.body;
    await Producto.create({
      nombre,
      precio: parseFloat(precio) || 0,
      categoria, // desde selector de categorías (persistentes)
      stock: parseInt(stock) || 0,
      imagen: req.file ? req.file.filename : 'default.jpg',
      activo: true
    });
    res.redirect('/admin');
  } catch (err) { next(err); }
});

// Toggle producto activo/inactivo
app.get('/admin/toggle/:id', requireAdmin, async (req, res, next) => {
  try {
    const prod = await Producto.findById(req.params.id);
    if (prod) {
      prod.activo = !prod.activo;
      await prod.save();
    }
    res.redirect('/admin');
  } catch (err) { next(err); }
});

// Config banner persistente
app.post('/admin/banner', requireAdmin, upload.fields([{ name: 'img1' }, { name: 'img2' }, { name: 'img3' }]), async (req, res, next) => {
  try {
    const { cabecera, descripcion, pie, colorTexto, colorBorde, tamanoLetra } = req.body;
    const cfg = await getConfig();

    if (cabecera) cfg.banner.cabecera = cabecera;
    if (descripcion) cfg.banner.descripcion = descripcion;
    if (pie) cfg.banner.pie = pie;
    cfg.banner.estilos.colorTexto = colorTexto || cfg.banner.estilos.colorTexto;
    cfg.banner.estilos.colorBorde = colorBorde || cfg.banner.estilos.colorBorde;
    cfg.banner.estilos.tamanoLetra = tamanoLetra || cfg.banner.estilos.tamanoLetra;

    const imgs = [...(cfg.banner.imagenes || [])];
    if (req.files?.img1?.[0]) imgs[0] = req.files.img1[0].filename;
    if (req.files?.img2?.[0]) imgs[1] = req.files.img2[0].filename;
    if (req.files?.img3?.[0]) imgs[2] = req.files.img3[0].filename;
    cfg.banner.imagenes = imgs.filter(Boolean);

    await cfg.save();
    res.redirect('/admin');
  } catch (err) { next(err); }
});

// Inventario (Funcionalidad 1)
app.get('/admin/inventario', requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = q ? { nombre: { $regex: q, $options: 'i' } } : {};
    const productos = await Producto.find(filter).sort({ nombre: 1 });
    const cfg = await getConfig();
    res.render('admin/inventario', { productos, q, config: cfg });
  } catch (err) { next(err); }
});

// Usuarios (Funcionalidad 2)
app.get('/admin/usuarios', requireAdmin, async (req, res, next) => {
  try {
    const usuarios = await Usuario.find().select('email nombre carrito esAdmin createdAt');
    res.render('admin/usuarios', { usuarios });
  } catch (err) { next(err); }
});

app.post('/admin/usuarios/eliminar/:id', requireAdmin, async (req, res, next) => {
  try {
    await Usuario.findByIdAndDelete(req.params.id);
    res.redirect('/admin/usuarios');
  } catch (err) { next(err); }
});

// --- RUTAS PÚBLICAS ---
app.get('/', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    const catFilter = req.query.cat;
    const search = (req.query.q || '').trim();

    const query = { activo: true, stock: { $gt: 0 } };
    if (catFilter) query.categoria = catFilter;
    if (search) query.nombre = { $regex: search, $options: 'i' };

    const productos = await Producto.find(query).sort({ createdAt: -1 });
    const categorias = await Categoria.find().sort({ nombre: 1 });

    res.render('shop/index', {
      productos,
      categorias,
      banner: cfg.banner,
      query: search
    });
  } catch (err) { next(err); }
});

// Login/Registro con hash
app.get('/login', (req, res) => res.render('shop/login-registro'));

app.post('/registro', async (req, res, next) => {
  try {
    const { email, password, nombre } = req.body;
    const exists = await Usuario.findOne({ email });
    if (exists) return res.send('El correo ya está registrado');

    const hash = await bcrypt.hash(password, 10);
    const nuevo = await Usuario.create({
      email,
      password: hash,
      nombre: nombre || email.split('@')[0],
      esAdmin: false
    });
    req.session.user = { id: nuevo._id.toString(), email: nuevo.email, nombre: nuevo.nombre };
    res.redirect('/');
  } catch (err) { next(err); }
});

app.post('/login-user', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await Usuario.findOne({ email });
    if (!user) return res.send('Usuario no encontrado');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.send('Contraseña incorrecta');
    req.session.user = { id: user._id.toString(), email: user.email, nombre: user.nombre };
    res.redirect('/');
  } catch (err) { next(err); }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Detalle de producto
app.get('/producto/:id', async (req, res, next) => {
  try {
    const prod = await Producto.findById(req.params.id);
    if (prod) res.render('shop/producto-detalle', { p: prod });
    else res.redirect('/');
  } catch (err) { next(err); }
});

// Agregar al carrito
app.get('/agregar-carrito/:id', requireUser, async (req, res, next) => {
  try {
    const prod = await Producto.findById(req.params.id);
    if (!prod || prod.stock <= 0) return res.send('Sin stock o producto no encontrado');

    const user = await Usuario.findById(req.session.user.id);
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    user.carrito.push({
      producto: {
        id: prod._id.toString(),
        nombre: prod.nombre,
        precio: prod.precio,
        imagen: prod.imagen,
        categoria: prod.categoria
      },
      fecha: new Date(),
      estado: 'pendiente_pago',
      id_compra: Date.now()
    });

    await user.save();
    res.redirect('/carrito');
  } catch (err) { next(err); }
});

// Ver carrito
app.get('/carrito', requireUser, async (req, res, next) => {
  try {
    const user = await Usuario.findById(req.session.user.id).select('carrito');
    const compras = user?.carrito || [];
    res.render('shop/carrito', { compras });
  } catch (err) { next(err); }
});

// Pagar (checkout)
app.get('/pagar', requireUser, async (req, res, next) => {
  try {
    const user = await Usuario.findById(req.session.user.id).select('carrito');
    const aPagar = (user?.carrito || []).filter(c => c.estado === 'pendiente_pago');
    if (aPagar.length === 0) return res.redirect('/carrito');
    const total = aPagar.reduce((sum, item) => sum + (item.producto.precio || 0), 0);
    res.render('shop/checkout', { total, cantidad: aPagar.length });
  } catch (err) { next(err); }
});

// Procesar pago (simulación)
app.post('/procesar-pago', requireUser, async (req, res, next) => {
  try {
    const user = await Usuario.findById(req.session.user.id);
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    for (const item of user.carrito) {
      if (item.estado === 'pendiente_pago') {
        item.estado = 'pendiente_retiro';
        const pGlobal = await Producto.findById(item.producto.id);
        if (pGlobal) {
          pGlobal.stock = Math.max(0, pGlobal.stock - 1);
          await pGlobal.save();
        }
      }
    }
    await user.save();
    res.render('shop/exito', { email: req.session.user.email });
  } catch (err) { next(err); }
});

// Cancelar compra
app.get('/cancelar-compra/:id_compra', requireUser, async (req, res, next) => {
  try {
    const user = await Usuario.findById(req.session.user.id);
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    const compra = user.carrito.find(c => String(c.id_compra) === String(req.params.id_compra));
    if (compra && compra.estado === 'pendiente_retiro') {
      compra.estado = 'pendiente_pago';
      const pGlobal = await Producto.findById(compra.producto.id);
      if (pGlobal) {
        pGlobal.stock++;
        await pGlobal.save();
      }
      await user.save();
      res.render('shop/cancelado', { email: req.session.user.email });
    } else {
      res.redirect('/carrito');
    }
  } catch (err) { next(err); }
});

// Manejo de errores simple
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).send('Error: ' + (err.message || 'Error en la petición'));
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en http://localhost:${PORT}`));
