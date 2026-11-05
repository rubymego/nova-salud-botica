require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pool = require('./db');
const api = require('./routes/api');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
  throw new Error('Configura JWT_SECRET con al menos 24 caracteres en .env');
}

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/api/salud', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', base_datos: 'conectada' });
  } catch {
    res.status(503).json({ estado: 'error', base_datos: 'no disponible' });
  }
});
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Nova Salud disponible en http://localhost:${port}`));