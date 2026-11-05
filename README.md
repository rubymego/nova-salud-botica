Aplicación web de ejemplo para una botica. Usa HTML, CSS y JavaScript en el navegador; Node.js y Express para la API REST; y MySQL para guardar la información. La venta y la compra modifican el stock mediante transacciones.

## Requisitos

- Windows 10 u 11.
- Node.js 20 o superior y npm.
- Laragon con MySQL iniciado.
- Visual Studio Code.
s
## Preparación en Laragon

1. Inicia MySQL desde Laragon.
2. Abre HeidiSQL o phpMyAdmin desde Laragon e importa el archivo `database.sql`. También puedes abrir una terminal MySQL y ejecutar el contenido de ese archivo.
3. Abre esta carpeta en VS Code. El archivo `.env` está preparado para Laragon; también puedes copiar `.env.example` como `.env` si necesitas recrearlo. `.env` está ignorado por Git para no publicar secretos.
4. Revisa `DB_USER`, `DB_PASSWORD` y `DB_PORT` en `.env`; en Laragon suelen ser `root`, contraseña vacía y puerto `3306`.
5. Cambia `JWT_SECRET` por una frase secreta larga antes de usar datos reales. No publiques `.env` en GitHub.

## Instalar y ejecutar

En la terminal integrada de VS Code, dentro de la carpeta del proyecto:

```powershell
npm install
npm run migrate:images
npm run seed
npm run dev
```

Abre `http://localhost:3000`. El punto de salud de la API está en `http://localhost:3000/api/salud`.

Credenciales para la primera prueba:

- Administrador: usuario `admin`, contraseña `Admin123!`
- Vendedor: usuario `vendedor`, contraseña `Venta123!`

Las cuentas de prueba se insertan solo si no existen. Cambia las contraseñas de demostración y no uses estos accesos en producción.

## Qué incluye

- Login con hash bcrypt, token JWT con vencimiento y límite de intentos en login.
- Roles administrador y vendedor comprobados en el backend.
- Dashboard inicial personalizado con resumen diario, alertas y accesos rápidos; el vendedor ve sus ventas y la gestión completa ve el total de la botica.
- Productos, búsqueda por nombre/código, clientes, proveedores y compras.
- Carga opcional de imágenes JPG, PNG o WebP de hasta 2 MB para productos; las imágenes se guardan en `public/uploads/products/` y se muestran en ventas e inventario.
- Ventas con cliente opcional, carrito y comprobante imprimible.
- Validación de stock y vencimiento antes de vender; bloqueo y actualización con transacción MySQL.
- Alertas de stock bajo, productos por vencer en 30 días y vencidos; se refrescan cada minuto.
- Reportes del día, productos más vendidos de 30 días y resumen diario de los últimos 7 días.
- Consultas con parámetros, protección de cabeceras con Helmet y datos de prueba.

## Estructura principal

```text
public/              Interfaz HTML, CSS y JavaScript
src/server.js        Servidor Express
src/db.js            Pool de conexiones MySQL
src/middleware/      Autenticación y roles
src/routes/api.js    Rutas de la API REST
src/seed.js          Usuarios, proveedor y productos de prueba
database.sql         Tablas y relaciones
.env                 Configuración local
```

## Notas para una instalación real

El comprobante es un comprobante interno imprimible, no reemplaza un comprobante electrónico autorizado por SUNAT. Para publicar la aplicación se debe usar HTTPS, un secreto JWT generado para el entorno, credenciales MySQL con permisos limitados, copias de seguridad y un servidor configurado. No se debe exponer MySQL a Internet. El despliegue y la copia de seguridad se desarrollarán en la Parte 2 del trabajo.
