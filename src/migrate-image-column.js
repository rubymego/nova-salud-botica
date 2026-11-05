require('dotenv').config();
const pool = require('./db');

async function migrate() {
  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='imagen_url'`
  );

  if (columns.length) {
    console.log('La columna imagen_url ya existe. No se hicieron cambios.');
    return;
  }

  await pool.query('ALTER TABLE productos ADD COLUMN imagen_url VARCHAR(255) NULL AFTER fecha_vencimiento');
  console.log('Migración completada: productos.imagen_url ya está disponible.');
}

migrate().catch((error) => {
  console.error('No se pudo migrar la base de datos:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());