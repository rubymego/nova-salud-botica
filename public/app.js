const API = '/api';
const state = { token: localStorage.getItem('nova_token'), user: null, products: [], customers: [], providers: [], sales: [], cart: new Map(), category: 'Todos', alerts: [], imagePreviewUrl: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

document.addEventListener('error', (event) => {
  if (event.target.matches('img[src="/img/logo.jpeg"]')) event.target.classList.add('logo-unavailable');
}, true);
$$('img[src="/img/logo.jpeg"]').forEach((image) => {
  if (image.complete && !image.naturalWidth) image.classList.add('logo-unavailable');
});

async function request(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers };
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(data.error || 'No se pudo completar la solicitud.');
  }
  return data;
}

function showToast(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 3600);
}

function updateWelcome(user = state.user) {
  if (!user) return;
  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? 'buenos días' : hour >= 12 && hour < 19 ? 'buenas tardes' : 'buenas noches';
  $('#welcome-greeting').textContent = `Hola, ${greeting},`;
  $('#welcome-name').textContent = user.nombre;
  $('#welcome-word').textContent = '. Bienvenida';
}

function setSession(user, token) {
  state.user = user;
  state.token = token;
  localStorage.setItem('nova_token', token);
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#app-view').classList.toggle('is-admin', user.rol === 'administrador');
  $('#app-view').classList.toggle('is-vendor', user.rol === 'vendedor');
  $('#new-customer-button').classList.toggle('hidden', user.rol !== 'administrador');
  $('#user-name').textContent = user.nombre;
  $('#user-role').textContent = roleLabel(user.rol);
  $('#user-initials').textContent = user.nombre.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  updateWelcome(user);
  $$('.admin-only').forEach((element) => element.classList.toggle('hidden', user.rol !== 'administrador'));
  showView('inicio');
  refreshAll();
}

function logout(showMessage = true) {
  state.token = null;
  state.user = null;
  localStorage.removeItem('nova_token');
  $('#app-view').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
  $('#login-form').reset();
  if (showMessage) $('#login-error').textContent = '';
}

function showView(name) {
  const titleMap = { inicio: 'Dashboard', ventas: 'Nueva venta', historial: 'Ventas', inventario: 'Inventario', clientes: 'Clientes', compras: 'Compras', proveedores: 'Proveedores', reportes: 'Reportes', usuarios: 'Usuarios' };
  $$('.view').forEach((view) => view.classList.toggle('active-view', view.id === `view-${name}`));
  $$('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === name));
  $('#page-title').textContent = titleMap[name] || 'Nova Salud';
  if (name === 'inicio') loadDashboard();
  if (name === 'historial') loadSales($('#sales-search').value).catch((error) => showToast(error.message, true));
  if (name === 'inventario') { loadProducts($('#inventory-search').value); loadAlerts(); }
  if (name === 'clientes') loadCustomers($('#customer-search').value);
  if (name === 'compras') loadPurchaseOptions();
  if (name === 'proveedores') loadProviders();
  if (name === 'reportes') loadReports();
  if (name === 'usuarios') loadUsers();
}

async function refreshAll() {
  try {
    await Promise.all([loadProducts(), loadCustomers(), loadAlerts()]);
    if (state.user?.rol === 'administrador') await Promise.all([loadProviders(), loadPurchaseOptions()]);
    await loadDashboard();
  } catch (error) { showToast(error.message, true); }
}

function roleLabel(role) {
  return role === 'administrador' ? 'Administradora' : 'Vendedora';
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderDashboardChart(reportDays) {
  const salesByDate = new Map((reportDays || []).map((day) => [String(day.fecha).slice(0, 10), { total: Number(day.total) || 0, count: Number(day.cantidad) || 0 }]));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = dateKey(date);
    return { date: key, ...(salesByDate.get(key) || { total: 0, count: 0 }) };
  });
  const total = days.reduce((sum, day) => sum + day.total, 0);
  $('#dashboard-chart-total').textContent = money(total);
  if (!total) {
    $('#dashboard-chart').innerHTML = '<p class="dashboard-chart-empty">Aún no hay ingresos registrados en este periodo.</p>';
    return;
  }

  const width = 760;
  const height = 172;
  const left = 58;
  const top = 14;
  const plotWidth = 680;
  const plotHeight = 108;
  const baseline = top + plotHeight;
  const maxValue = Math.max(...days.map((day) => day.total), 1);
  const points = days.map((day, index) => ({
    ...day,
    x: left + (plotWidth * index) / (days.length - 1),
    y: baseline - (day.total / maxValue) * plotHeight,
    label: new Date(`${day.date}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '')
  }));
  const grid = Array.from({ length: 5 }, (_, index) => {
    const y = top + (plotHeight * index) / 4;
    const value = maxValue * (1 - index / 4);
    const label = `S/ ${new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
    return `<g><line x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}"/><text x="${left - 10}" y="${y + 3}" text-anchor="end">${escapeHtml(label)}</text></g>`;
  }).join('');
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `M ${points[0].x} ${baseline} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${points.at(-1).x} ${baseline} Z`;
  const marks = points.map((point) => `<g><circle cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(point.label)}: ${money(point.total)} · ${point.count} venta(s)</title></circle><text class="chart-date" x="${point.x}" y="${height - 5}" text-anchor="middle">${escapeHtml(point.label)}</text></g>`).join('');
  $('#dashboard-chart').innerHTML = `<svg class="dashboard-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ingresos diarios de los últimos siete días"><defs><linearGradient id="dashboard-sales-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#1f8a2e" stop-opacity=".2"/><stop offset="100%" stop-color="#1f8a2e" stop-opacity="0"/></linearGradient></defs><g class="chart-grid">${grid}</g><path class="chart-area" d="${area}"/><polyline class="chart-line" points="${line}"/>${marks}</svg>`;
}

async function loadDashboard() {
  const data = await request('/dashboard');
  const alertas = data.alertas || [];
  const resumenAlertas = data.resumenAlertas || {};
  $('#dashboard-caption').textContent = data.alcance === 'botica'
    ? 'Resumen general de la actividad de Nova Salud.'
    : 'Tu resumen de atención y las alertas actuales de la botica.';
  $('#dashboard-cards').innerHTML = `<article class="dashboard-card"><span>Productos activos</span><strong>${data.inventario.productos || 0}</strong><small>En el catálogo</small></article><article class="dashboard-card alert-card"><span>Alertas de inventario</span><strong>${resumenAlertas.total || 0}</strong><small>${resumenAlertas.stock_bajo || 0} bajo stock · ${resumenAlertas.vencimiento || 0} por vencimiento</small></article><article class="dashboard-card"><span>${data.alcance === 'botica' ? 'Ventas de hoy' : 'Tus ventas de hoy'}</span><strong>${data.ventasHoy.cantidad}</strong><small>Operaciones registradas</small></article><article class="dashboard-card sales-card"><span>${data.alcance === 'botica' ? 'Ingresos de hoy' : 'Total de tus ventas hoy'}</span><strong>${money(data.ventasHoy.total)}</strong><small>Acumulado del día</small></article>`;
  const alertItems = alertas.slice(0, 4);
  $('#dashboard-alert-list').innerHTML = alertItems.length
    ? alertItems.map((item) => `<div class="dashboard-alert-row"><span class="alert-marker ${item.tipo === 'por_vencer' ? 'warning' : ''}"></span><span><strong>${escapeHtml(item.nombre)}</strong><small>${item.tipo === 'stock_bajo' ? `Quedan ${item.stock}; mínimo ${item.stock_minimo}` : item.tipo === 'vencido' ? `Lote vencido · ${escapeHtml(item.fecha_vencimiento)}` : `Vence ${escapeHtml(item.fecha_vencimiento)}`}</small></span><b>${item.tipo === 'stock_bajo' ? 'Reponer' : item.tipo === 'vencido' ? 'Vencido' : 'Revisar'}</b></div>`).join('')
    : '<div class="dashboard-clear"><span>✓</span><p>Todo en orden</p><small>No hay alertas de stock ni vencimiento.</small></div>';
  if (state.user?.rol === 'administrador') {
    try {
      const report = await request('/reportes/resumen');
      renderDashboardChart(report.ultimos7Dias);
      $('#dashboard-chart-panel').classList.remove('hidden');
    } catch {
      $('#dashboard-chart-panel').classList.add('hidden');
    }
  } else {
    $('#dashboard-chart-panel').classList.add('hidden');
  }
}

async function loadProducts(search = '') {
  state.products = await request(`/productos?buscar=${encodeURIComponent(search)}`);
  renderProducts();
  renderInventory();
  updateCategoryFilters();
  updateProductSelect();
}

function dateState(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiration = new Date(`${date}T00:00:00`);
  if (expiration < today) return 'expired';
  const days = Math.ceil((expiration - today) / 86400000);
  return days <= 30 ? 'soon' : 'ok';
}

function statusFor(product) {
  const expiry = dateState(product.fecha_vencimiento);
  if (expiry === 'expired') return '<span class="status expired">Vencido</span>';
  if (expiry === 'soon') return '<span class="status soon">Por vencer</span>';
  if (Number(product.stock) <= Number(product.stock_minimo)) return '<span class="status low">Stock bajo</span>';
  return '<span class="status ok">Disponible</span>';
}

function updateCategoryFilters() {
  const categories = ['Todos', ...new Set(state.products.map((product) => product.categoria))];
  $('#category-row').innerHTML = categories.map((category) => `<button class="category-chip ${state.category === category ? 'selected' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
}

function renderProductImage(product, extraClass = '') {
  const content = product.imagen_url
    ? `<img src="${escapeHtml(product.imagen_url)}" alt="Imagen de ${escapeHtml(product.nombre)}" loading="lazy">`
    : '<span aria-hidden="true">✚</span>';
  return `<div class="product-photo ${extraClass}">${content}</div>`;
}

function renderProducts() {
  const list = state.products.filter((product) => state.category === 'Todos' || product.categoria === state.category);
  const grid = $('#product-grid');
  if (!list.length) { grid.innerHTML = '<div class="empty-state"><p>No se encontraron productos</p><small>Prueba con otro nombre o código.</small></div>'; return; }
  grid.innerHTML = list.map((product) => {
    const disabled = Number(product.stock) < 1 || dateState(product.fecha_vencimiento) === 'expired';
    const isLow = Number(product.stock) <= Number(product.stock_minimo);
    return `<article class="product-card ${isLow ? 'low-stock' : ''}" data-product-detail="${product.id}" tabindex="0" role="button" aria-label="Ver detalles de ${escapeHtml(product.nombre)}">${renderProductImage(product)}<div class="product-card-info"><h4>${escapeHtml(product.nombre)}</h4><span class="product-code">${escapeHtml(product.codigo)} · ${escapeHtml(product.categoria)}</span></div><div class="product-card-bottom"><div><div class="product-price">${money(product.precio)}</div><span class="stock-count ${isLow ? 'low' : ''}">${product.stock} en stock</span></div><button class="add-product" data-add="${product.id}" ${disabled ? 'disabled title="Sin stock o producto vencido"' : 'title="Agregar a la venta"'}>+</button></div></article>`;
  }).join('');
}

function renderInventory() {
  const tbody = $('#inventory-body');
  if (!tbody) return;
  if (!state.products.length) { tbody.innerHTML = '<tr><td colspan="8">No hay productos para mostrar.</td></tr>'; return; }
  tbody.innerHTML = state.products.map((p) => `<tr><td><div class="inventory-product-cell">${renderProductImage(p, 'inventory-photo')}<span><strong>${escapeHtml(p.nombre)}</strong><br><span class="product-code">Lote ${escapeHtml(p.lote)}</span></span></div></td><td>${escapeHtml(p.codigo)}</td><td>${escapeHtml(p.categoria)}</td><td class="${Number(p.stock) <= Number(p.stock_minimo) ? 'low-text' : ''}">${p.stock} <span class="product-code">/ mín. ${p.stock_minimo}</span></td><td>${money(p.precio)}</td><td>${escapeHtml(p.fecha_vencimiento)}</td><td>${statusFor(p)}</td><td class="admin-only"><div class="row-actions"><button data-edit-product="${p.id}">Editar</button><button class="danger" data-delete-product="${p.id}">Desactivar</button></div></td></tr>`).join('');
}

function renderCart() {
  const container = $('#cart-items');
  const items = [...state.cart.values()];
  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">＋</span><p>Agrega productos para comenzar</p><small>El stock se actualizará al confirmar la venta.</small></div>';
  } else {
    container.innerHTML = items.map((item) => `<div class="cart-item"><div class="cart-item-name">${escapeHtml(item.nombre)}</div><div class="quantity-control"><button data-quantity="${item.id}" data-delta="-1" aria-label="Quitar una unidad">−</button><span>${item.cantidad}</span><button data-quantity="${item.id}" data-delta="1" aria-label="Agregar una unidad">+</button></div><div class="cart-item-sub">${money(item.precio)} c/u · ${money(item.precio * item.cantidad)}</div></div>`).join('');
  }
  const total = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  $('#cart-total').textContent = money(total);
  $('#complete-sale').disabled = !items.length;
}

function showProductDetails(product) {
  const unavailable = Number(product.stock) < 1 || dateState(product.fecha_vencimiento) === 'expired';
  const image = product.imagen_url
    ? `<img src="${escapeHtml(product.imagen_url)}" alt="Imagen de ${escapeHtml(product.nombre)}">`
    : '<span class="detail-image-placeholder" aria-hidden="true">✚</span>';
  $('#product-detail-content').innerHTML = `<div class="product-detail-layout"><div class="product-detail-image">${image}</div><div class="product-detail-copy"><p class="eyebrow">${escapeHtml(product.categoria)}</p><h2>${escapeHtml(product.nombre)}</h2><p class="detail-code">Código ${escapeHtml(product.codigo)}</p><div class="detail-price"><span>Precio regular</span><strong>${money(product.precio)}</strong></div><p class="detail-intro">Información y disponibilidad del producto en Nova Salud.</p><dl class="detail-facts"><div><dt>Stock disponible</dt><dd class="${Number(product.stock) <= Number(product.stock_minimo) ? 'low-text' : ''}">${product.stock} unidades</dd></div><div><dt>Stock mínimo</dt><dd>${product.stock_minimo} unidades</dd></div><div><dt>Lote</dt><dd>${escapeHtml(product.lote)}</dd></div><div><dt>Fecha de vencimiento</dt><dd>${escapeHtml(product.fecha_vencimiento)}</dd></div><div><dt>Proveedor</dt><dd>${escapeHtml(product.proveedor || 'No registrado')}</dd></div></dl></div></div>`;
  const addButton = $('#detail-add-product');
  addButton.dataset.productId = product.id;
  addButton.disabled = unavailable;
  addButton.textContent = unavailable ? 'No disponible para venta' : 'Agregar a la venta';
  $('#product-detail-dialog').showModal();
}

function addProductToCart(product) {
  const item = state.cart.get(product.id) || { ...product, cantidad: 0 };
  if (item.cantidad + 1 > product.stock) {
    showToast(`Stock insuficiente para ${product.nombre}.`, true);
    return false;
  }
  if (dateState(product.fecha_vencimiento) === 'expired') {
    showToast('No se puede vender un producto vencido.', true);
    return false;
  }
  item.cantidad += 1;
  state.cart.set(product.id, item);
  renderCart();
  return true;
}

async function loadCustomers(search = '') {
  state.customers = await request(`/clientes?buscar=${encodeURIComponent(search)}`);
  $('#customers-body').innerHTML = state.customers.length ? state.customers.map((c) => `<tr><td><strong>${escapeHtml(c.nombre)}</strong></td><td>${escapeHtml(c.documento || '—')}</td><td>${escapeHtml(c.telefono || '—')}</td><td>${escapeHtml(c.correo || '—')}</td></tr>`).join('') : '<tr><td colspan="4">No hay clientes registrados.</td></tr>';
  $('#sale-customer').innerHTML = '<option value="">Venta sin cliente</option>' + state.customers.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}${c.documento ? ` · ${escapeHtml(c.documento)}` : ''}</option>`).join('');
}

async function loadAlerts() {
  const data = await request('/alertas');
  state.alerts = data.alertas;
  const badges = ['#alert-badge', '#top-alert-badge'];
  badges.forEach((selector) => {
    const badge = $(selector);
    badge.textContent = data.total;
    badge.classList.toggle('hidden', data.total === 0);
  });
  const summary = $('#alert-summary');
  if (summary) {
    const low = data.alertas.filter((a) => a.tipo === 'stock_bajo').length;
    const soon = data.alertas.filter((a) => a.tipo === 'por_vencer').length;
    const expired = data.alertas.filter((a) => a.tipo === 'vencido').length;
    summary.innerHTML = `${low ? `<span class="alert-item">${low} con stock bajo</span>` : ''}${soon ? `<span class="alert-item soon">${soon} por vencer</span>` : ''}${expired ? `<span class="alert-item">${expired} vencido${expired > 1 ? 's' : ''}</span>` : ''}${!data.total ? '<span class="quiet-tag">Sin alertas pendientes</span>' : ''}`;
  }
}

async function loadProviders() {
  if (state.user?.rol !== 'administrador') return;
  state.providers = await request('/proveedores');
  $('#providers-body').innerHTML = state.providers.length ? state.providers.map((p) => `<tr><td><strong>${escapeHtml(p.nombre)}</strong></td><td>${escapeHtml(p.ruc || '—')}</td><td>${escapeHtml(p.telefono || '—')}</td><td>${escapeHtml(p.correo || '—')}</td><td>${escapeHtml(p.direccion || '—')}</td></tr>`).join('') : '<tr><td colspan="5">No hay proveedores registrados.</td></tr>';
  const options = '<option value="">Sin proveedor</option>' + state.providers.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  $('#product-form [name="proveedor_id"]').innerHTML = options;
  $('#purchase-provider').innerHTML = '<option value="">Selecciona proveedor</option>' + state.providers.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
}

function updateProductSelect() {
  const select = $('#purchase-product');
  if (!select) return;
  select.innerHTML = '<option value="">Selecciona producto</option>' + state.products.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)} · ${escapeHtml(p.codigo)}</option>`).join('');
}

async function loadPurchaseOptions() {
  await Promise.all([loadProviders(), loadProducts()]);
}

async function loadUsers() {
  const users = await request('/usuarios');
  $('#users-body').innerHTML = users.map((u) => `<tr><td><strong>${escapeHtml(u.nombre)}</strong></td><td>${escapeHtml(u.usuario)}</td><td>${escapeHtml(roleLabel(u.rol))}</td><td><span class="status ${u.activo ? 'ok' : 'inactive'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td><td>${u.activo ? `<button class="row-actions" data-delete-user="${u.id}">Desactivar</button>` : '—'}</td></tr>`).join('');
}

async function loadReports() {
  const report = await request('/reportes/resumen');
  $('#report-cards').innerHTML = `<div class="metric-card"><span>Ventas de hoy</span><strong>${report.hoy.cantidad}</strong></div><div class="metric-card"><span>Ingresos de hoy</span><strong>${money(report.hoy.total)}</strong></div><div class="metric-card"><span>Productos con alerta</span><strong>${state.alerts.length}</strong></div>`;
  $('#best-sellers').innerHTML = report.masVendidos.length ? report.masVendidos.map((p, index) => `<div class="report-line"><span>${index + 1}. ${escapeHtml(p.nombre)}</span><strong>${p.unidades} unid.</strong></div>`).join('') : '<p class="form-hint">Aún no hay ventas.</p>';
  $('#seven-days').innerHTML = report.ultimos7Dias.length ? report.ultimos7Dias.map((day) => `<div class="report-line"><span>${escapeHtml(String(day.fecha))} · ${day.cantidad} venta(s)</span><strong>${money(day.total)}</strong></div>`).join('') : '<p class="form-hint">Aún no hay ventas en este periodo.</p>';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function openGenericDialog(title, eyebrow, fields, onSubmit) {
  const form = $('#generic-form');
  $('#generic-title').textContent = title;
  $('#generic-eyebrow').textContent = eyebrow;
  $('#generic-fields').innerHTML = fields.map((field) => `<label>${field.label}${field.type === 'select' ? `<select name="${field.name}" ${field.required ? 'required' : ''}>${field.options}</select>` : `<input name="${field.name}" type="${field.type || 'text'}" ${field.required ? 'required' : ''} ${field.minLength ? `minlength="${field.minLength}"` : ''} maxlength="${field.maxlength || 180}" ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}>`}</label>`).join('');
  $('#generic-dialog').showModal();
  form.onsubmit = async (event) => {
    event.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(form))); $('#generic-dialog').close(); form.reset(); showToast('Registro guardado.'); }
    catch (error) { showToast(error.message, true); }
  };
}

function openProduct(product = null) {
  const form = $('#product-form');
  state.imagePreviewUrl = null;
  form.reset();
  form.elements.id.value = product?.id || '';
  $('#product-modal-title').textContent = product ? 'Editar producto' : 'Nuevo producto';
  if (product) Object.entries(product).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; });
  const preview = $('#product-image-preview');
  preview.src = product?.imagen_url || '';
  $('#product-image-preview-wrap').classList.toggle('hidden', !product?.imagen_url);
  $('#product-dialog').showModal();
}

function printReceipt(sale) {
  const lines = sale.items.map((item) => `<div class="receipt-line"><div class="receipt-product"><strong>${escapeHtml(item.nombre)}</strong><small>Cant. ${item.cantidad} × ${money(item.precio)}</small></div><strong>${money(item.subtotal)}</strong></div>`).join('');
  const ruc = document.querySelector('meta[name="botica-ruc"]')?.content.trim();
  const direccion = document.querySelector('meta[name="botica-direccion"]')?.content.trim() || 'Dirección no registrada';
  const ubicacion = ['botica-ciudad', 'botica-departamento', 'botica-pais']
    .map((name) => document.querySelector(`meta[name="${name}"]`)?.content.trim())
    .filter(Boolean)
    .join(', ');
  const subtotal = sale.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const fecha = new Date(sale.fecha).toLocaleString('es-PE');
  const customerDetails = sale.cliente
    ? `<div><span>Cliente</span><strong>${escapeHtml(sale.cliente)}</strong></div>${sale.cliente_documento ? `<div><span>Doc. identidad</span><strong>${escapeHtml(sale.cliente_documento)}</strong></div>` : ''}`
    : '<div><span>Cliente</span><strong>Venta sin cliente</strong></div>';
  $('#receipt-content').innerHTML = `<div class="receipt"><header class="receipt-header"><img class="receipt-logo" src="/img/logo.jpeg" alt="Botica Nova Salud"><h3>BOTICA NOVA SALUD</h3>${ruc ? `<p>RUC: ${escapeHtml(ruc)}</p>` : ''}<p>${escapeHtml(direccion)}</p>${ubicacion ? `<p>${escapeHtml(ubicacion)}</p>` : ''}<p class="receipt-kind">RECIBO DE VENTA</p><strong class="receipt-number">N.° ${escapeHtml(sale.numero)}</strong></header><div class="receipt-divider"></div><section class="receipt-meta"><div><span>Fecha de emisión</span><strong>${escapeHtml(fecha)}</strong></div><div><span>Atendió</span><strong>${escapeHtml(sale.usuario || state.user.nombre)}</strong></div>${customerDetails}</section><div class="receipt-divider"></div><section class="receipt-items"><div class="receipt-table-head"><span>Descripción</span><span>Total</span></div>${lines}</section><div class="receipt-divider"></div><section class="receipt-totals"><div><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div class="receipt-total"><span>TOTAL</span><strong>${money(sale.total)}</strong></div></section><p class="receipt-thanks">Gracias por su preferencia</p><p class="receipt-note">Recibo interno. No reemplaza un comprobante electrónico autorizado.</p></div>`;
  $('#receipt-dialog').showModal();
}

async function loadSales(search = '') {
  const query = search.trim() ? `?buscar=${encodeURIComponent(search.trim())}` : '';
  state.sales = await request(`/ventas${query}`);
  $('#sales-body').innerHTML = state.sales.length
    ? state.sales.map((sale) => `<tr><td><strong>${escapeHtml(sale.numero)}</strong></td><td>${new Date(sale.fecha).toLocaleString('es-PE')}</td><td>${escapeHtml(sale.cliente || 'Venta sin cliente')}</td><td>${sale.items.length}</td><td>${escapeHtml(sale.usuario || '')}</td><td><strong>${money(sale.total)}</strong></td><td><button class="row-actions receipt-action" type="button" data-sale-receipt="${sale.id}">Ver recibo</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="sales-empty">No hay ventas para mostrar.</td></tr>';
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  $('#login-error').textContent = '';
  try { const data = await request('/auth/login', { method: 'POST', body: JSON.stringify(values) }); setSession(data.usuario, data.token); }
  catch (error) { $('#login-error').textContent = error.message; }
});

$('#logout-button').addEventListener('click', () => logout());
$('#main-nav').addEventListener('click', (event) => {
  const link = event.target.closest('[data-view]');
  if (link) showView(link.dataset.view);
});
$$('[data-go-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.goView)));
$('#alerts-button').addEventListener('click', () => showView('inventario'));
$('#product-search').addEventListener('input', (event) => loadProducts(event.target.value).catch((error) => showToast(error.message, true)));
$('#inventory-search').addEventListener('input', (event) => loadProducts(event.target.value).catch((error) => showToast(error.message, true)));
$('#customer-search').addEventListener('input', (event) => loadCustomers(event.target.value).catch((error) => showToast(error.message, true)));
let salesSearchTimer;
$('#sales-search').addEventListener('input', (event) => {
  clearTimeout(salesSearchTimer);
  salesSearchTimer = setTimeout(() => loadSales(event.target.value).catch((error) => showToast(error.message, true)), 250);
});
$('#sales-body').addEventListener('click', (event) => {
  const button = event.target.closest('[data-sale-receipt]');
  if (!button) return;
  const sale = state.sales.find((item) => item.id === Number(button.dataset.saleReceipt));
  if (sale) printReceipt(sale);
});
$('#category-row').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-category]');
  if (!chip) return;
  state.category = chip.dataset.category;
  updateCategoryFilters();
  renderProducts();
});
$('#product-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  const card = event.target.closest('[data-product-detail]');
  const productId = button?.dataset.add || card?.dataset.productDetail;
  if (!productId) return;
  const product = state.products.find((item) => item.id === Number(productId));
  if (!product) return;
  if (button) return addProductToCart(product);
  showProductDetails(product);
});
$('#product-grid').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-product-detail]');
  if (!card || event.target.closest('[data-add]')) return;
  event.preventDefault();
  const product = state.products.find((item) => item.id === Number(card.dataset.productDetail));
  if (product) showProductDetails(product);
});
$('#cart-items').addEventListener('click', (event) => {
  const button = event.target.closest('[data-quantity]');
  if (!button) return;
  const id = Number(button.dataset.quantity);
  const item = state.cart.get(id);
  const next = item.cantidad + Number(button.dataset.delta);
  if (next < 1) state.cart.delete(id);
  else if (next <= item.stock) item.cantidad = next;
  else return showToast(`Stock disponible: ${item.stock}.`, true);
  renderCart();
});
$('#clear-cart').addEventListener('click', () => { state.cart.clear(); renderCart(); });
$('#new-customer-toggle').addEventListener('click', () => $('#inline-customer-form').classList.toggle('hidden'));
$('#cancel-customer').addEventListener('click', () => { $('#inline-customer-form').reset(); $('#inline-customer-form').classList.add('hidden'); });
$('#inline-customer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const customer = Object.fromEntries(new FormData(event.currentTarget));
    const result = await request('/clientes', { method: 'POST', body: JSON.stringify(customer) });
    await loadCustomers();
    $('#sale-customer').value = result.id;
    event.currentTarget.reset();
    event.currentTarget.classList.add('hidden');
    showToast('Cliente registrado.');
  } catch (error) { showToast(error.message, true); }
});
$('#complete-sale').addEventListener('click', async () => {
  const button = $('#complete-sale');
  button.disabled = true;
  try {
    const payload = { cliente_id: $('#sale-customer').value || null, items: [...state.cart.values()].map(({ id, cantidad }) => ({ producto_id: id, cantidad })) };
    const sale = await request('/ventas', { method: 'POST', body: JSON.stringify(payload) });
    state.cart.clear();
    renderCart();
    await Promise.all([loadProducts($('#product-search').value), loadAlerts()]);
    await loadDashboard();
    printReceipt(sale);
  } catch (error) { showToast(error.message, true); button.disabled = false; }
});
$('#print-receipt').addEventListener('click', () => window.print());
$('#detail-add-product').addEventListener('click', () => {
  const product = state.products.find((item) => item.id === Number($('#detail-add-product').dataset.productId));
  if (!product) return;
  if (addProductToCart(product)) $('#product-detail-dialog').close();
});
$('#new-product-button').addEventListener('click', () => openProduct());
$('#inventory-body').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-product]');
  const remove = event.target.closest('[data-delete-product]');
  if (edit) openProduct(state.products.find((product) => product.id === Number(edit.dataset.editProduct)));
  if (remove && confirm('¿Desactivar este producto? Se conservará en el historial.')) {
    try { await request(`/productos/${remove.dataset.deleteProduct}`, { method: 'DELETE' }); await loadProducts($('#inventory-search').value); showToast('Producto desactivado.'); }
    catch (error) { showToast(error.message, true); }
  }
});
$('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const imageFile = formData.get('imagen');
  const values = Object.fromEntries(formData);
  const id = values.id;
  delete values.id;
  delete values.imagen;
  try {
    const saved = await request(id ? `/productos/${id}` : '/productos', { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) });
    const productId = id || saved.id;
    form.elements.id.value = productId;
    if (imageFile instanceof File && imageFile.size > 0) {
      const uploadData = new FormData();
      uploadData.append('imagen', imageFile);
      await request(`/productos/${productId}/imagen`, { method: 'POST', body: uploadData });
    }
    $('#product-dialog').close();
    await loadProducts($('#inventory-search').value);
    state.imagePreviewUrl = null;
    showToast(id ? 'Producto actualizado.' : 'Producto registrado.');
  } catch (error) { showToast(error.message, true); }
});
$('#product-form [name="imagen"]').addEventListener('change', (event) => {
  const file = event.currentTarget.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    state.imagePreviewUrl = reader.result;
    $('#product-image-preview').src = reader.result;
    $('#product-image-preview-wrap').classList.remove('hidden');
  });
  reader.addEventListener('error', () => showToast('No se pudo abrir la imagen seleccionada.', true));
  reader.readAsDataURL(file);
});
$('#new-customer-button').addEventListener('click', () => openGenericDialog('Nuevo cliente', 'ATENCIÓN', [
  { label: 'Nombre', name: 'nombre', required: true, maxlength: 120 }, { label: 'Documento', name: 'documento', maxlength: 20 },
  { label: 'Teléfono', name: 'telefono', maxlength: 30 }, { label: 'Correo', name: 'correo', type: 'email', maxlength: 120 }
], async (data) => { await request('/clientes', { method: 'POST', body: JSON.stringify(data) }); await loadCustomers($('#customer-search').value); }));
$('#new-provider-button').addEventListener('click', () => openGenericDialog('Nuevo proveedor', 'ABASTECIMIENTO', [
  { label: 'Nombre', name: 'nombre', required: true, maxlength: 120 }, { label: 'RUC', name: 'ruc', maxlength: 20 },
  { label: 'Teléfono', name: 'telefono', maxlength: 30 }, { label: 'Correo', name: 'correo', type: 'email', maxlength: 120 },
  { label: 'Dirección', name: 'direccion', maxlength: 180 }
], async (data) => { await request('/proveedores', { method: 'POST', body: JSON.stringify(data) }); await loadProviders(); }));
$('#purchase-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await request('/compras', { method: 'POST', body: JSON.stringify({ proveedor_id: Number(values.proveedor_id), items: [{ producto_id: Number(values.producto_id), cantidad: Number(values.cantidad), costo_unitario: Number(values.costo_unitario) }] }) });
    event.currentTarget.reset();
    await Promise.all([loadProducts(), loadAlerts()]);
    showToast(`${result.numero}: stock actualizado.`);
  } catch (error) { showToast(error.message, true); }
});
$('#new-user-button').addEventListener('click', () => openGenericDialog('Crear usuario', 'ACCESOS', [
  { label: 'Nombre completo', name: 'nombre', required: true, maxlength: 100 }, { label: 'Usuario', name: 'usuario', required: true, maxlength: 50 },
  { label: 'Contraseña (mínimo 8 caracteres)', name: 'password', type: 'password', required: true, minLength: 8, maxlength: 100 },
  { label: 'Tipo de acceso', name: 'rol', type: 'select', required: true, options: '<option value="vendedor">Vendedora</option><option value="administrador">Administradora</option>' }
], async (data) => { await request('/usuarios', { method: 'POST', body: JSON.stringify(data) }); await loadUsers(); }));
$('#users-body').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-user]');
  if (!button || !confirm('¿Desactivar este usuario?')) return;
  try { await request(`/usuarios/${button.dataset.deleteUser}`, { method: 'DELETE' }); await loadUsers(); showToast('Usuario desactivado.'); }
  catch (error) { showToast(error.message, true); }
});
$$('.close-dialog').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));

$('#today-label').textContent = new Intl.DateTimeFormat('es-PE', { dateStyle: 'full' }).format(new Date());
renderCart();
if (state.token) request('/auth/me').then(({ usuario }) => setSession(usuario, state.token)).catch(() => logout(false));
setInterval(() => {
  if (state.token) {
    updateWelcome();
    loadAlerts().catch(() => {});
  }
}, 60000);