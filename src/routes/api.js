const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const pool = require('../db');
const { autenticar, permitirRoles } = require('../middleware/auth');

const router = express.Router();
const admin = [autenticar, permitirRoles('administrador')];
const ambos = [autenticar, permitirRoles('administrador', 'vendedor')];
const tiposImagen = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!tiposImagen[file.mimetype]) return callback(new Error('Usa una imagen JPG, PNG o WebP.'));
    callback(null, true);
  }
});

function recibirImagen(req, res, next) {
  imageUpload.single('imagen')(req, res, (error) => {
    if (!error) return next();
    const mensaje = error.code === 'LIMIT_FILE_SIZE'
      ? 'La imagen no debe superar 2 MB.'
      : error.message;
    return res.status(400).json({ error: mensaje || 'No se pudo recibir la imagen.' });
  });
}

function extensionImagen(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function borrarImagenLocal(rutaImagen) {
  if (!rutaImagen?.startsWith('/uploads/products/')) return;
  const archivo = path.basename(rutaImagen);
  await fs.unlink(path.join(__dirname, '../../public/uploads/products', archivo)).catch(() => {});
}

function texto(valor, max = 140) {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= max;
}

function numeroPositivo(valor, permitirCero = false) {
  return Number.isInteger(Number(valor)) && Number(valor) >= (permitirCero ? 0 : 1);
}

function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function manejarError(res, error) {
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El código, usuario o documento ya existe.' });
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'El registro relacionado no existe.' });
  console.error(error);
  return res.status(500).json({ error: 'Ocurrió un error interno.' });
}

function numeroDocumento(prefijo) {
  return `${prefijo}-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

router.post('/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!texto(usuario, 50) || typeof password !== 'string' || password.length < 1) {
      return res.status(400).json({ error: 'Ingresa usuario y contraseña.' });
    }
    const [rows] = await pool.execute(
      'SELECT id, nombre, usuario, password_hash, rol FROM usuarios WHERE usuario = ? AND activo = 1',
      [usuario.trim()]
    );
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    const cuenta = rows[0];
    const token = jwt.sign(
      { id: cuenta.id, nombre: cuenta.nombre, usuario: cuenta.usuario, rol: cuenta.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    return res.json({ token, usuario: { id: cuenta.id, nombre: cuenta.nombre, usuario: cuenta.usuario, rol: cuenta.rol } });
  } catch (error) { return manejarError(res, error); }
});

router.get('/auth/me', autenticar, (req, res) => res.json({ usuario: req.usuario }));

router.get('/productos', ambos, async (req, res) => {
  try {
    const buscar = `%${String(req.query.buscar || '').trim()}%`;
    const [rows] = await pool.execute(
      `SELECT p.id, p.nombre, p.codigo, p.categoria, p.precio, p.costo, p.stock,
       p.stock_minimo, p.lote, p.fecha_vencimiento, p.proveedor_id, p.imagen_url, p.activo,
       pr.nombre AS proveedor
       FROM productos p LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
       WHERE p.activo = 1 AND (p.nombre LIKE ? OR p.codigo LIKE ? OR p.categoria LIKE ?)
       ORDER BY p.nombre LIMIT 300`, [buscar, buscar, buscar]
    );
    return res.json(rows);
  } catch (error) { return manejarError(res, error); }
});

router.post('/productos', ...admin, async (req, res) => {
  try {
    const { nombre, codigo, categoria, precio, costo, stock, stock_minimo, lote, fecha_vencimiento, proveedor_id } = req.body;
    if (!texto(nombre, 140) || !texto(codigo, 40) || !texto(categoria, 80) || !texto(lote, 50) || !fechaValida(fecha_vencimiento) ||
        !Number.isFinite(Number(precio)) || Number(precio) <= 0 || !Number.isFinite(Number(costo || 0)) || Number(costo || 0) < 0 ||
        !numeroPositivo(stock, true) || !numeroPositivo(stock_minimo, true) ||
        (proveedor_id && !numeroPositivo(proveedor_id))) {
      return res.status(400).json({ error: 'Revisa los datos del producto.' });
    }
    const [result] = await pool.execute(
      `INSERT INTO productos (nombre,codigo,categoria,precio,costo,stock,stock_minimo,lote,fecha_vencimiento,proveedor_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [nombre.trim(), codigo.trim(), categoria.trim(), Number(precio), Number(costo || 0), Number(stock), Number(stock_minimo), lote.trim(), fecha_vencimiento, proveedor_id || null]
    );
    return res.status(201).json({ id: result.insertId, mensaje: 'Producto registrado.' });
  } catch (error) { return manejarError(res, error); }
});

router.put('/productos/:id', ...admin, async (req, res) => {
  try {
    const { nombre, codigo, categoria, precio, costo, stock_minimo, lote, fecha_vencimiento, proveedor_id } = req.body;
    if (!numeroPositivo(req.params.id) || !texto(nombre, 140) || !texto(codigo, 40) || !texto(categoria, 80) || !texto(lote, 50) || !fechaValida(fecha_vencimiento) ||
        !Number.isFinite(Number(precio)) || Number(precio) <= 0 || !Number.isFinite(Number(costo || 0)) || Number(costo || 0) < 0 ||
        !numeroPositivo(stock_minimo, true) || (proveedor_id && !numeroPositivo(proveedor_id))) {
      return res.status(400).json({ error: 'Revisa los datos del producto.' });
    }
    const [result] = await pool.execute(
      `UPDATE productos SET nombre=?, codigo=?, categoria=?, precio=?, costo=?, stock_minimo=?, lote=?,
       fecha_vencimiento=?, proveedor_id=? WHERE id=? AND activo=1`,
      [nombre.trim(), codigo.trim(), categoria.trim(), Number(precio), Number(costo || 0), Number(stock_minimo), lote.trim(), fecha_vencimiento, proveedor_id || null, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Producto no encontrado.' });
    return res.json({ mensaje: 'Producto actualizado.' });
  } catch (error) { return manejarError(res, error); }
});

router.post('/productos/:id/imagen', ...admin, recibirImagen, async (req, res) => {
  if (!numeroPositivo(req.params.id)) return res.status(400).json({ error: 'Producto no válido.' });
  if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen.' });

  const extension = extensionImagen(req.file.buffer);
  if (!extension || tiposImagen[req.file.mimetype] !== extension) {
    return res.status(400).json({ error: 'El archivo no parece ser una imagen JPG, PNG o WebP válida.' });
  }

  try {
    const [productos] = await pool.execute('SELECT imagen_url FROM productos WHERE id=? AND activo=1', [req.params.id]);
    if (!productos.length) return res.status(404).json({ error: 'Producto no encontrado.' });

    const directorio = path.join(__dirname, '../../public/uploads/products');
    await fs.mkdir(directorio, { recursive: true });
    const nombreArchivo = `${crypto.randomUUID()}.${extension}`;
    const rutaImagen = `/uploads/products/${nombreArchivo}`;
    const destino = path.join(directorio, nombreArchivo);
    await fs.writeFile(destino, req.file.buffer, { flag: 'wx' });

    try {
      await pool.execute('UPDATE productos SET imagen_url=? WHERE id=? AND activo=1', [rutaImagen, req.params.id]);
    } catch (error) {
      await fs.unlink(destino).catch(() => {});
      throw error;
    }

    await borrarImagenLocal(productos[0].imagen_url);
    return res.json({ imagen_url: rutaImagen, mensaje: 'Imagen del producto actualizada.' });
  } catch (error) { return manejarError(res, error); }
});

router.delete('/productos/:id', ...admin, async (req, res) => {
  try {
    const [result] = await pool.execute('UPDATE productos SET activo=0 WHERE id=? AND activo=1', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Producto no encontrado.' });
    return res.json({ mensaje: 'Producto desactivado.' });
  } catch (error) { return manejarError(res, error); }
});

router.get('/alertas', ambos, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id,nombre,codigo,stock,stock_minimo,lote,fecha_vencimiento,
       CASE WHEN fecha_vencimiento < CURDATE() THEN 'vencido'
            WHEN fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'por_vencer'
            WHEN stock <= stock_minimo THEN 'stock_bajo' END AS tipo
       FROM productos WHERE activo=1 AND (stock <= stock_minimo OR fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
       ORDER BY (fecha_vencimiento < CURDATE()) DESC, fecha_vencimiento ASC, stock ASC`
    );
    return res.json({ total: rows.length, alertas: rows });
  } catch (error) { return manejarError(res, error); }
});

router.get('/clientes', ambos, async (req, res) => {
  try {
    const buscar = `%${String(req.query.buscar || '').trim()}%`;
    const [rows] = await pool.execute(
      'SELECT id,nombre,documento,telefono,correo FROM clientes WHERE nombre LIKE ? OR documento LIKE ? ORDER BY nombre LIMIT 200', [buscar, buscar]
    );
    return res.json(rows);
  } catch (error) { return manejarError(res, error); }
});

router.post('/clientes', ...ambos, async (req, res) => {
  try {
    const { nombre, documento, telefono, correo } = req.body;
    if (!texto(nombre, 120) || (documento && !texto(documento, 20)) || (telefono && !texto(telefono, 30)) || (correo && !texto(correo, 120))) {
      return res.status(400).json({ error: 'Revisa los datos del cliente.' });
    }
    const [result] = await pool.execute(
      'INSERT INTO clientes (nombre,documento,telefono,correo) VALUES (?,?,?,?)',
      [nombre.trim(), documento?.trim() || null, telefono?.trim() || null, correo?.trim() || null]
    );
    return res.status(201).json({ id: result.insertId, mensaje: 'Cliente registrado.' });
  } catch (error) { return manejarError(res, error); }
});

router.get('/proveedores', ...admin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id,nombre,ruc,telefono,correo,direccion FROM proveedores ORDER BY nombre');
    return res.json(rows);
  } catch (error) { return manejarError(res, error); }
});

router.post('/proveedores', ...admin, async (req, res) => {
  try {
    const { nombre, ruc, telefono, correo, direccion } = req.body;
    if (!texto(nombre, 120) || (ruc && !texto(ruc, 20)) || (telefono && !texto(telefono, 30)) || (correo && !texto(correo, 120)) || (direccion && !texto(direccion, 180))) {
      return res.status(400).json({ error: 'Revisa los datos del proveedor.' });
    }
    const [result] = await pool.execute(
      'INSERT INTO proveedores (nombre,ruc,telefono,correo,direccion) VALUES (?,?,?,?,?)',
      [nombre.trim(), ruc?.trim() || null, telefono?.trim() || null, correo?.trim() || null, direccion?.trim() || null]
    );
    return res.status(201).json({ id: result.insertId, mensaje: 'Proveedor registrado.' });
  } catch (error) { return manejarError(res, error); }
});

router.post('/compras', ...admin, async (req, res) => {
  const { proveedor_id, items } = req.body;
  if (!numeroPositivo(proveedor_id) || !Array.isArray(items) || !items.length || items.length > 100 ||
      items.some((item) => !numeroPositivo(item.producto_id) || !numeroPositivo(item.cantidad) || !Number.isFinite(Number(item.costo_unitario)) || Number(item.costo_unitario) < 0)) {
    return res.status(400).json({ error: 'Revisa los datos de la compra.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let total = 0;
    const lineas = [];
    for (const item of items) {
      const [productos] = await connection.execute('SELECT id,nombre FROM productos WHERE id=? AND activo=1 FOR UPDATE', [item.producto_id]);
      if (!productos.length) throw Object.assign(new Error('Un producto ya no está disponible.'), { status: 400 });
      const costo = Number(item.costo_unitario);
      const subtotal = costo * Number(item.cantidad);
      total += subtotal;
      lineas.push({ ...item, costo, subtotal });
    }
    const numero = numeroDocumento('COM');
    const [compra] = await connection.execute('INSERT INTO compras (numero,usuario_id,proveedor_id,total) VALUES (?,?,?,?)', [numero, req.usuario.id, proveedor_id, total]);
    for (const linea of lineas) {
      await connection.execute('INSERT INTO detalle_compra (compra_id,producto_id,cantidad,costo_unitario,subtotal) VALUES (?,?,?,?,?)', [compra.insertId, linea.producto_id, linea.cantidad, linea.costo, linea.subtotal]);
      await connection.execute('UPDATE productos SET stock=stock+?, costo=? WHERE id=?', [linea.cantidad, linea.costo, linea.producto_id]);
    }
    await connection.commit();
    return res.status(201).json({ id: compra.insertId, numero, total, mensaje: 'Compra registrada y stock actualizado.' });
  } catch (error) {
    await connection.rollback();
    if (error.status) return res.status(error.status).json({ error: error.message });
    return manejarError(res, error);
  } finally { connection.release(); }
});

router.get('/ventas', ...ambos, async (req, res) => {
  try {
    const buscar = String(req.query.buscar || '').trim().slice(0, 80);
    const esAdmin = req.usuario.rol === 'administrador';
    const filtros = [];
    const parametros = [];
    if (!esAdmin) {
      filtros.push('v.usuario_id=?');
      parametros.push(req.usuario.id);
    }
    if (buscar) {
      filtros.push('(v.numero LIKE ? OR c.nombre LIKE ?)');
      parametros.push(`%${buscar}%`, `%${buscar}%`);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const [ventas] = await pool.execute(
      `SELECT v.id,v.numero,v.total,v.creado_en AS fecha,c.nombre AS cliente,c.documento AS cliente_documento,u.nombre AS usuario
       FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id
       JOIN usuarios u ON u.id=v.usuario_id ${where}
       ORDER BY v.creado_en DESC,v.id DESC LIMIT 100`,
      parametros
    );
    if (!ventas.length) return res.json([]);
    const ids = ventas.map((venta) => venta.id);
    const placeholders = ids.map(() => '?').join(',');
    const [items] = await pool.execute(
      `SELECT d.venta_id,d.producto_id,p.nombre,p.codigo,d.cantidad,d.precio_unitario AS precio,d.subtotal
       FROM detalle_venta d JOIN productos p ON p.id=d.producto_id
       WHERE d.venta_id IN (${placeholders}) ORDER BY d.id`,
      ids
    );
    const itemsPorVenta = new Map(ventas.map((venta) => [venta.id, []]));
    items.forEach((item) => itemsPorVenta.get(item.venta_id)?.push({
      producto_id: item.producto_id,
      nombre: item.nombre,
      codigo: item.codigo,
      cantidad: item.cantidad,
      precio: item.precio,
      subtotal: item.subtotal
    }));
    return res.json(ventas.map((venta) => ({ ...venta, items: itemsPorVenta.get(venta.id) || [] })));
  } catch (error) { return manejarError(res, error); }
});

router.post('/ventas', ...ambos, async (req, res) => {
  const { cliente_id, nuevo_cliente, items } = req.body;
  if (!Array.isArray(items) || !items.length || items.length > 100 || items.some((item) => !numeroPositivo(item.producto_id) || !numeroPositivo(item.cantidad))) {
    return res.status(400).json({ error: 'Agrega productos válidos al carrito.' });
  }
  if (nuevo_cliente && !texto(nuevo_cliente.nombre, 120)) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let clienteId = cliente_id || null;
    let clienteData = null;
    if (nuevo_cliente) {
      const [cliente] = await connection.execute(
        'INSERT INTO clientes (nombre,documento,telefono,correo) VALUES (?,?,?,?)',
        [nuevo_cliente.nombre.trim(), nuevo_cliente.documento?.trim() || null, nuevo_cliente.telefono?.trim() || null, nuevo_cliente.correo?.trim() || null]
      );
      clienteId = cliente.insertId;
      clienteData = { nombre: nuevo_cliente.nombre.trim(), documento: nuevo_cliente.documento?.trim() || null };
    }
    if (clienteId) {
      const [clientes] = await connection.execute('SELECT id,nombre,documento FROM clientes WHERE id=?', [clienteId]);
      if (!clientes.length) throw Object.assign(new Error('El cliente no existe.'), { status: 400 });
      clienteData = clientes[0];
    }

    const cantidades = new Map();
    for (const item of items) cantidades.set(Number(item.producto_id), (cantidades.get(Number(item.producto_id)) || 0) + Number(item.cantidad));
    const lineas = [];
    let total = 0;
    for (const [productoId, cantidad] of cantidades) {
      const [productos] = await connection.execute(
        'SELECT id,nombre,codigo,precio,stock,fecha_vencimiento,fecha_vencimiento < CURDATE() AS vencido FROM productos WHERE id=? AND activo=1 FOR UPDATE', [productoId]
      );
      const producto = productos[0];
      if (!producto) throw Object.assign(new Error('Uno de los productos no está disponible.'), { status: 400 });
      if (Number(producto.vencido) === 1) throw Object.assign(new Error(`${producto.nombre} está vencido y no se puede vender.`), { status: 400 });
      if (producto.stock < cantidad) throw Object.assign(new Error(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}.`), { status: 400 });
      const subtotal = Number(producto.precio) * cantidad;
      total += subtotal;
      lineas.push({ ...producto, cantidad, subtotal });
    }

    const numero = numeroDocumento('VTA');
    const [venta] = await connection.execute('INSERT INTO ventas (numero,usuario_id,cliente_id,subtotal,total) VALUES (?,?,?,?,?)', [numero, req.usuario.id, clienteId, total, total]);
    for (const linea of lineas) {
      await connection.execute('INSERT INTO detalle_venta (venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?)', [venta.insertId, linea.id, linea.cantidad, linea.precio, linea.subtotal]);
      await connection.execute('UPDATE productos SET stock=stock-? WHERE id=?', [linea.cantidad, linea.id]);
    }
    await connection.commit();
    return res.status(201).json({
      id: venta.insertId, numero, total, fecha: new Date().toISOString(), cliente: clienteData?.nombre || null, cliente_documento: clienteData?.documento || null,
      items: lineas.map(({ id, nombre, codigo, precio, cantidad, subtotal }) => ({ producto_id: id, nombre, codigo, precio, cantidad, subtotal })),
      mensaje: 'Venta registrada y stock actualizado.'
    });
  } catch (error) {
    await connection.rollback();
    if (error.status) return res.status(error.status).json({ error: error.message });
    return manejarError(res, error);
  } finally { connection.release(); }
});

router.get('/usuarios', ...admin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id,nombre,usuario,rol,activo,creado_en FROM usuarios ORDER BY nombre');
    return res.json(rows);
  } catch (error) { return manejarError(res, error); }
});

router.post('/usuarios', ...admin, async (req, res) => {
  try {
    const { nombre, usuario, password, rol } = req.body;
    if (!texto(nombre, 100) || !texto(usuario, 50) || typeof password !== 'string' || password.length < 8 || !['administrador', 'vendedor'].includes(rol)) {
      return res.status(400).json({ error: 'Completa los datos. La contraseña debe tener al menos 8 caracteres.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute('INSERT INTO usuarios (nombre,usuario,password_hash,rol) VALUES (?,?,?,?)', [nombre.trim(), usuario.trim(), hash, rol]);
    return res.status(201).json({ id: result.insertId, mensaje: 'Usuario creado.' });
  } catch (error) { return manejarError(res, error); }
});

router.delete('/usuarios/:id', ...admin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.usuario.id) return res.status(400).json({ error: 'No puedes desactivar tu propio usuario.' });
    const [result] = await pool.execute('UPDATE usuarios SET activo=0 WHERE id=? AND activo=1', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado.' });
    return res.json({ mensaje: 'Usuario desactivado.' });
  } catch (error) { return manejarError(res, error); }
});

router.get('/dashboard', ...ambos, async (req, res) => {
  try {
    const [[inventario]] = await pool.execute(
      `SELECT COUNT(*) AS productos,
       SUM(stock <= stock_minimo) AS stock_bajo,
       SUM(fecha_vencimiento < CURDATE()) AS vencidos,
       SUM(fecha_vencimiento >= CURDATE() AND fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS por_vencer
       FROM productos WHERE activo=1`
    );
     const [[resumenAlertas]] = await pool.execute(
      `SELECT COUNT(*) AS total,
       SUM(fecha_vencimiento > DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND stock <= stock_minimo) AS stock_bajo,
       SUM(fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS vencimiento
       FROM productos WHERE activo=1
       AND (stock <= stock_minimo OR fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))`
     );
     const [alertas] = await pool.execute(
      `SELECT id,nombre,codigo,stock,stock_minimo,lote,fecha_vencimiento,
       CASE WHEN fecha_vencimiento < CURDATE() THEN 'vencido'
          WHEN fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'por_vencer'
          ELSE 'stock_bajo' END AS tipo
       FROM productos WHERE activo=1
       AND (stock <= stock_minimo OR fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
       ORDER BY (fecha_vencimiento < CURDATE()) DESC, fecha_vencimiento ASC, stock ASC LIMIT 6`
     );
    const esAdmin = req.usuario.rol === 'administrador';
    const consultaVentas = esAdmin
      ? 'SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total FROM ventas WHERE DATE(creado_en)=CURDATE()'
      : 'SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total FROM ventas WHERE DATE(creado_en)=CURDATE() AND usuario_id=?';
    const [ventasHoy] = esAdmin
      ? await pool.execute(consultaVentas)
      : await pool.execute(consultaVentas, [req.usuario.id]);
    return res.json({ inventario, resumenAlertas, alertas, ventasHoy: ventasHoy[0], alcance: esAdmin ? 'botica' : 'personal' });
  } catch (error) { return manejarError(res, error); }
});

router.get('/reportes/resumen', ...admin, async (req, res) => {
  try {
    const [[hoy]] = await pool.execute(
      'SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total FROM ventas WHERE DATE(creado_en)=CURDATE()'
    );
    const [masVendidos] = await pool.execute(
      `SELECT p.nombre,p.codigo,SUM(d.cantidad) AS unidades FROM detalle_venta d
       JOIN productos p ON p.id=d.producto_id JOIN ventas v ON v.id=d.venta_id
       WHERE v.creado_en >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY p.id,p.nombre,p.codigo ORDER BY unidades DESC LIMIT 5`
    );
    const [ultimos7Dias] = await pool.execute(
      `SELECT DATE(creado_en) AS fecha,COUNT(*) AS cantidad,COALESCE(SUM(total),0) AS total
       FROM ventas WHERE creado_en >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(creado_en) ORDER BY fecha`
    );
    return res.json({ hoy, masVendidos, ultimos7Dias });
  } catch (error) { return manejarError(res, error); }
});

module.exports = router;