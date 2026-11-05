require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function seed() {
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const sellerHash = await bcrypt.hash('Venta123!', 12);
  await pool.execute(
    'INSERT IGNORE INTO usuarios (nombre,usuario,password_hash,rol) VALUES (?,?,?,?)',
    ['Administrador Nova Salud', 'admin', adminHash, 'administrador']
  );
  await pool.execute(
    'INSERT IGNORE INTO usuarios (nombre,usuario,password_hash,rol) VALUES (?,?,?,?)',
    ['Vendedor Nova Salud', 'vendedor', sellerHash, 'vendedor']
  );
  await pool.execute(
    'INSERT IGNORE INTO proveedores (nombre,ruc,telefono,correo,direccion) VALUES (?,?,?,?,?)',
    ['Distribuidora Salud Peru', '20123456789', '01 555 0101', 'ventas@saludperu.test', 'Lima']
  );
  await pool.execute(
    `INSERT IGNORE INTO productos
     (nombre,codigo,categoria,precio,costo,stock,stock_minimo,lote,fecha_vencimiento,proveedor_id)
     SELECT datos.nombre,datos.codigo,datos.categoria,datos.precio,datos.costo,datos.stock,datos.minimo,
       datos.lote,DATE_ADD(CURDATE(), INTERVAL datos.dias DAY),proveedores.id
     FROM (SELECT 'Paracetamol 500 mg x 10' AS nombre,'MED-001' AS codigo,'Analgésicos' AS categoria,3.50 AS precio,1.80 AS costo,32 AS stock,8 AS minimo,'LOT-PAR-2401' AS lote,450 AS dias
       UNION ALL SELECT 'Ibuprofeno 400 mg x 10','MED-002','Analgésicos',5.00,2.50,6,10,'LOT-IBU-2402',300
       UNION ALL SELECT 'Loratadina 10 mg x 10','MED-003','Alergias',4.00,2.00,24,6,'LOT-LOR-2403',210
       UNION ALL SELECT 'Alcohol medicinal 70% 500 ml','CUI-001','Cuidado personal',8.90,4.10,3,5,'LOT-ALC-2404',25
       UNION ALL SELECT 'Sales de rehidratación oral','MED-004','Hidratación',2.50,1.10,18,6,'LOT-SRO-2405',500
       UNION ALL SELECT 'Vitamina C 500 mg x 10','VIT-001','Vitaminas',6.00,3.00,15,5,'LOT-VIT-2406',180
     ) AS datos CROSS JOIN (SELECT id FROM proveedores WHERE ruc='20123456789' LIMIT 1) AS proveedores`
  );
  console.log('Datos de prueba listos. Usuarios: admin / Admin123! y vendedor / Venta123!');
}

seed().catch((error) => {
  console.error('No se pudo completar el seed:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());