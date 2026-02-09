const { Telegraf } = require('telegraf');
const { initializeSheets } = require('../lib/googleSheets');
const { handleMessage, handleCommand } = require('../lib/telegramBot');

// Verificar variables de entorno
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'GOOGLE_SHEET_ID'];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) console.error(`⚠️ Variable faltante: ${envVar}`);
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Middleware para añadir sheetsClient
bot.use(async (ctx, next) => {
  try {
    ctx.sheetsClient = await initializeSheets();
  } catch (error) {
    console.error('❌ Error con Google Sheets:', error.message);
    if (ctx.message) {
      await ctx.reply('⚠️ Error de conexión con Google Sheets. Intenta más tarde.');
    }
    return;
  }
  await next();
});

// ========== COMANDO /START ==========
bot.start(async (ctx) => {
  await ctx.reply(
    `🎧 *¡Hola DJ EDY!*\n\n` +
    `Sistema de contabilidad profesional para tus eventos.\n\n` +
    `*📋 COMANDOS PRINCIPALES:*\n` +
    `/nuevoevento - Crear nuevo evento\n` +
    `/eventos - Ver eventos activos (con gastos)\n` +
    `/proximos - Ver eventos próximos\n\n` +
    `*💰 PAGOS:*\n` +
    `/deposito ID MONTO - Registrar depósito\n` +
    `/pagocompleto ID MONTO - Completar pago (reparte 65/25/10)\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto ID MONTO DESCRIPCIÓN - Gasto en evento\n` +
    `/gastodirecto MONTO DESCRIPCIÓN - Gasto general DJ EDY\n` +
    `/gastosevento ID - Ver gastos de evento\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance - Ver balances\n` +
    `/reporte [MES] - Reporte mensual\n` +
    `/ayuda - Ayuda completa\n` +
    `/comandos - Lista de comandos\n\n` +
    `*📝 EJEMPLOS RÁPIDOS:*\n` +
    `• /nuevoevento\n` +
    `• /deposito E001 500\n` +
    `• /gasto E001 200 transporte\n` +
    `• /gastodirecto 150 publicidad\n` +
    `• /reporte enero`,
    { parse_mode: 'Markdown' }
  );
});

// ========== COMANDO /AYUDA ==========
bot.help(async (ctx) => {
  await ctx.reply(
    `*🎧 SISTEMA DJ EDY - AYUDA COMPLETA*\n\n` +
    `*📅 GESTIÓN DE EVENTOS:*\n` +
    `/nuevoevento - Crear evento nuevo\n` +
    `/eventos - Listar eventos activos (con gastos)\n` +
    `/evento [ID] - Ver detalle de evento\n` +
    `/gastosevento [ID] - Ver gastos de evento\n` +
    `/proximos - Ver eventos próximos (7 días)\n\n` +
    `*💰 PAGOS Y DEPÓSITOS:*\n` +
    `/deposito [ID] [MONTO] - Registrar depósito\n` +
    `/pagocompleto [ID] [MONTO] - Completar pago\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto [ID] [MONTO] [DESCRIPCIÓN] - Gasto en evento\n` +
    `/gastodirecto [MONTO] [DESCRIPCIÓN] - Gasto general\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance - Ver balances\n` +
    `/reporte [MES] - Reporte mensual\n` +
    `/retenciones - Ver retenciones\n\n` +
    `*📝 FORMATOS:*\n` +
    `• ID: E001, E002, etc.\n` +
    `• Montos: 500, 1000.50\n` +
    `• Fechas: DD-MM-AAAA\n\n` +
    `*🔢 REPARTICIÓN:*\n` +
    `Al completar: 65% Personal, 25% Ahorros, 10% DJ EDY`,
    { parse_mode: 'Markdown' }
  );
});

// ========== COMANDO /COMANDOS ==========
bot.command('comandos', async (ctx) => {
  await ctx.reply(
    `📋 *LISTA COMPLETA DE COMANDOS*\n\n` +
    `*📅 EVENTOS:*\n` +
    `/nuevoevento /eventos /evento /proximos\n\n` +
    `*💰 PAGOS:*\n` +
    `/deposito /pagocompleto\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto /gastodirecto /gastosevento\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance /reporte /retenciones\n\n` +
    `*❓ AYUDA:*\n` +
    `/ayuda /comandos\n\n` +
    `📝 Usa /ayuda para ver ejemplos y formatos.`,
    { parse_mode: 'Markdown' }
  );
});

// ========== COMANDO /NUEVOEVENTO ==========
bot.command('nuevoevento', async (ctx) => {
  const sheetsClient = ctx.sheetsClient;
  
  await sheetsClient.updateState(ctx.chat.id, {
    step: 'nuevoevento_nombre',
    metadata: { username: ctx.from.username }
  });
  
  await ctx.reply(
    `📅 *CREAR NUEVO EVENTO*\n\n` +
    `1. Escribe el *nombre del evento*:\n` +
    `(ej: "Boda María", "Fiesta 15 años")`,
    { parse_mode: 'Markdown' }
  );
});

// ========== COMANDO /DEPOSITO ==========
bot.command('deposito', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length !== 2) {
    await ctx.reply(
      `❌ Formato: /deposito [ID] [MONTO]\n` +
      `Ejemplo: /deposito E001 500`
    );
    return;
  }
  
  const [eventoId, montoStr] = args;
  const monto = parseFloat(montoStr.replace(',', '.'));
  
  if (isNaN(monto) || monto <= 0) {
    await ctx.reply('❌ Monto inválido. Usa números positivos.');
    return;
  }
  
  try {
    const sheetsClient = ctx.sheetsClient;
    const result = await sheetsClient.registrarDeposito(eventoId, monto, ctx.chat.id, ctx.from.username);
    
    await ctx.reply(
      `✅ *DEPÓSITO REGISTRADO*\n\n` +
      `📋 ${result.eventoNombre}\n` +
      `💰 Monto: $${monto.toFixed(2)}\n` +
      `🏢 Cuenta: DJ EDY (pendiente)\n` +
      `📊 Total pagado: $${result.totalPagado.toFixed(2)} / $${result.presupuestoTotal.toFixed(2)}\n` +
      `⏳ Pendiente: $${result.pendiente.toFixed(2)}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /PAGOCOMPLETO ==========
bot.command('pagocompleto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length !== 2) {
    await ctx.reply(
      `❌ Formato: /pagocompleto [ID] [MONTO]\n` +
      `Ejemplo: /pagocompleto E001 1500`
    );
    return;
  }
  
  const [eventoId, montoStr] = args;
  const monto = parseFloat(montoStr.replace(',', '.'));
  
  if (isNaN(monto) || monto <= 0) {
    await ctx.reply('❌ Monto inválido.');
    return;
  }
  
  try {
    const sheetsClient = ctx.sheetsClient;
    const result = await sheetsClient.registrarPagoCompleto(eventoId, monto, ctx.chat.id, ctx.from.username);
    
    await ctx.reply(
      `🎉 *¡EVENTO COMPLETADO!*\n\n` +
      `📋 ${result.eventoNombre}\n` +
      `💰 Pago final: $${monto.toFixed(2)}\n` +
      `🎯 Presupuesto: $${result.presupuestoTotal.toFixed(2)}\n\n` +
      `📊 *REPARTICIÓN:*\n` +
      `🎧 Personal (65%): $${result.reparticion.personal.toFixed(2)}\n` +
      `💰 Ahorros (25%): $${result.reparticion.ahorro.toFixed(2)}\n` +
      `🏢 DJ EDY (10%): $${result.reparticion.empresa.toFixed(2)}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /EVENTOS ==========
bot.command('eventos', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    const eventos = await sheetsClient.getEventosActivos();
    
    if (eventos.length === 0) {
      await ctx.reply('📭 No hay eventos activos.');
      return;
    }
    
    let mensaje = `📅 *EVENTOS ACTIVOS*\n\n`;
    
    eventos.forEach((evento, index) => {
      const porcentaje = evento.presupuesto_total > 0 
        ? (evento.pagado_total / evento.presupuesto_total * 100).toFixed(0)
        : '0';
      
      const gastosTotales = parseFloat(evento.gastos_totales) || 0;
      const netoDespuesGastos = evento.presupuesto_total - gastosTotales;
      
      mensaje += `*${evento.id} - ${evento.nombre}*\n`;
      mensaje += `👤 ${evento.cliente || 'Sin cliente'}\n`;
      mensaje += `💰 Presupuesto: $${evento.presupuesto_total.toFixed(2)}\n`;
      mensaje += `📥 Pagado: $${evento.pagado_total.toFixed(2)} (${porcentaje}%)\n`;
      mensaje += `⏳ Pendiente: $${evento.pendiente.toFixed(2)}\n`;
      
      if (gastosTotales > 0) {
        mensaje += `📉 *Gastos:* $${gastosTotales.toFixed(2)}\n`;
        mensaje += `📊 *Neto:* $${netoDespuesGastos.toFixed(2)}\n`;
      }
      
      mensaje += `📈 Estado: ${evento.estado}\n`;
      
      if (index < eventos.length - 1) {
        mensaje += `──────────────\n`;
      }
    });
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /BALANCE ==========
bot.command('balance', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.sheetId,
      range: 'balance_cuentas!A:D',
    });
    
    const rows = response.data.values || [];
    let balances = {
      personal: { actual: 0, pendiente: 0 },
      djEdy: { actual: 0, pendiente: 0 },
      ahorros: { actual: 0, pendiente: 0 }
    };
    
    rows.forEach(row => {
      const cuenta = row[0];
      const actual = parseFloat(row[1]) || 0;
      const pendiente = parseFloat(row[2]) || 0;
      
      if (cuenta === 'Personal') balances.personal = { actual, pendiente };
      if (cuenta === 'DJ EDY') balances.djEdy = { actual, pendiente };
      if (cuenta === 'Ahorros') balances.ahorros = { actual, pendiente };
    });
    
    const totalPersonal = balances.personal.actual + balances.personal.pendiente;
    const totalDjEdy = balances.djEdy.actual + balances.djEdy.pendiente;
    const totalAhorros = balances.ahorros.actual + balances.ahorros.pendiente;
    const totalGeneral = totalPersonal + totalDjEdy + totalAhorros;
    
    let mensaje = `💰 *BALANCE DE CUENTAS*\n\n`;
    mensaje += `🎧 *Personal:* $${totalPersonal.toFixed(2)}\n`;
    if (balances.personal.pendiente !== 0) {
      mensaje += `   └ Pendiente: $${balances.personal.pendiente.toFixed(2)}\n`;
    }
    
    mensaje += `💰 *Ahorros:* $${totalAhorros.toFixed(2)}\n`;
    if (balances.ahorros.pendiente !== 0) {
      mensaje += `   └ Pendiente: $${balances.ahorros.pendiente.toFixed(2)}\n`;
    }
    
    mensaje += `🏢 *DJ EDY Empresa:* $${totalDjEdy.toFixed(2)}\n`;
    if (balances.djEdy.pendiente > 0) {
      mensaje += `   └ Depósitos retenidos: $${balances.djEdy.pendiente.toFixed(2)}\n`;
    }
    if (balances.djEdy.actual > 0) {
      mensaje += `   └ Fondo empresa: $${balances.djEdy.actual.toFixed(2)}\n`;
    }
    
    mensaje += `\n📈 *Total General:* $${totalGeneral.toFixed(2)}\n\n`;
    mensaje += `🔄 *Actualizado:* ${new Date().toLocaleDateString('es-ES')}`;
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error en /balance:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /REPORTE ==========
bot.command('reporte', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    const mes = args[0] || new Date().toLocaleDateString('es-ES', { month: 'long' });
    
    const sheetsClient = ctx.sheetsClient;
    const eventos = await sheetsClient.getEventosDelMes(mes);
    const transacciones = await sheetsClient.getTransaccionesDelMes(mes);
    
    let totalIngresos = 0;
    let totalGastosEventos = 0;
    let totalGastosDirectos = 0;
    let eventosCompletados = 0;
    let eventosEnProceso = 0;
    
    eventos.forEach(evento => {
      if (evento.estado === 'completado') eventosCompletados++;
      if (evento.estado === 'en_proceso') eventosEnProceso++;
    });
    
    transacciones.forEach(t => {
      const monto = parseFloat(t.monto) || 0;
      if (t.tipo === 'ingreso') {
        totalIngresos += monto;
      } else if (t.tipo === 'gasto') {
        if (t.evento_id) {
          totalGastosEventos += monto;
        } else {
          totalGastosDirectos += monto;
        }
      }
    });
    
    const totalGastos = totalGastosEventos + totalGastosDirectos;
    const balanceMes = totalIngresos - totalGastos;
    
    await ctx.reply(
      `📊 *REPORTE - ${mes.toUpperCase()}*\n\n` +
      `📅 *Eventos:*\n` +
      `   ✅ Completados: ${eventosCompletados}\n` +
      `   ⏳ En proceso: ${eventosEnProceso}\n` +
      `   📋 Total: ${eventos.length}\n\n` +
      `💰 *Finanzas:*\n` +
      `   📈 Ingresos: $${totalIngresos.toFixed(2)}\n` +
      `   📉 Gastos: $${totalGastos.toFixed(2)}\n` +
      `      └ En eventos: $${totalGastosEventos.toFixed(2)}\n` +
      `      └ Directos: $${totalGastosDirectos.toFixed(2)}\n` +
      `   💰 Balance: $${balanceMes.toFixed(2)}\n\n` +
      `📅 *Generado:* ${new Date().toLocaleDateString('es-ES')}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error en /reporte:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /PROXIMOS ==========
bot.command('proximos', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    const eventosProximos = await sheetsClient.getEventosProximos();
    
    if (eventosProximos.length === 0) {
      await ctx.reply('📭 No hay eventos próximos en 7 días.');
      return;
    }
    
    let mensaje = `🔔 *EVENTOS PRÓXIMOS*\n\n`;
    
    eventosProximos.forEach(evento => {
      const diasRestantes = Math.ceil((new Date(evento.fecha_evento) - new Date()) / (1000 * 60 * 60 * 24));
      const porcentaje = (evento.pagado_total / evento.presupuesto_total * 100).toFixed(0);
      
      mensaje += `📅 *${evento.nombre}*\n`;
      mensaje += `   👤 ${evento.cliente || 'Sin cliente'}\n`;
      mensaje += `   🗓️ ${evento.fecha_evento} (${diasRestantes} días)\n`;
      mensaje += `   💰 $${evento.pagado_total.toFixed(2)} / $${evento.presupuesto_total.toFixed(2)} (${porcentaje}%)\n`;
      mensaje += `   ⏳ $${evento.pendiente.toFixed(2)}\n`;
      mensaje += `   ──────────────\n`;
    });
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /GASTO ==========
bot.command('gasto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 3) {
    await ctx.reply(
      `❌ Formato: /gasto [ID] [MONTO] [DESCRIPCIÓN]\n` +
      `Ejemplo: /gasto E001 200 transporte`
    );
    return;
  }
  
  const [eventoId, montoStr, ...descripcionParts] = args;
  const descripcion = descripcionParts.join(' ');
  const monto = parseFloat(montoStr.replace(',', '.'));
  
  if (isNaN(monto) || monto <= 0) {
    await ctx.reply('❌ Monto inválido.');
    return;
  }
  
  try {
    const sheetsClient = ctx.sheetsClient;
    const resultado = await sheetsClient.registrarGastoEvento(
      eventoId, 
      monto, 
      descripcion,
      ctx.chat.id,
      ctx.from.username || ctx.from.first_name
    );
    
    await ctx.reply(
      `📉 *GASTO REGISTRADO*\n\n` +
      `📋 ${eventoId} - ${resultado.eventoNombre}\n` +
      `💰 Gasto: $${monto.toFixed(2)}\n` +
      `📝 ${descripcion}\n\n` +
      `📊 *Impacto:*\n` +
      `   Presupuesto: $${resultado.presupuestoTotal.toFixed(2)}\n` +
      `   Gastos: $${resultado.gastosTotales.toFixed(2)}\n` +
      `   Neto: $${resultado.netoRestante.toFixed(2)}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /GASTODIRECTO ==========
bot.command('gastodirecto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 2) {
    await ctx.reply(
      `❌ Formato: /gastodirecto [MONTO] [DESCRIPCIÓN]\n` +
      `Ejemplo: /gastodirecto 150 publicidad`
    );
    return;
  }
  
  const [montoStr, ...descripcionParts] = args;
  const descripcion = descripcionParts.join(' ');
  const monto = parseFloat(montoStr.replace(',', '.'));
  
  if (isNaN(monto) || monto <= 0) {
    await ctx.reply('❌ Monto inválido.');
    return;
  }
  
  try {
    const sheetsClient = ctx.sheetsClient;
    
    let categoria = 'gasto_general';
    const descLower = descripcion.toLowerCase();
    
    if (descLower.includes('publicidad') || descLower.includes('promo') || descLower.includes('marketing')) {
      categoria = 'marketing';
    } else if (descLower.includes('equipo') || descLower.includes('compra')) {
      categoria = 'equipo';
    } else if (descLower.includes('transporte') || descLower.includes('gasolina')) {
      categoria = 'transporte';
    }
    
    // Registrar transacción como gasto directo
    await sheetsClient.registrarTransaccion({
      tipo: 'gasto',
      cuenta: 'DJ EDY',
      monto: monto,
      descripcion: `[GENERAL] ${descripcion}`,
      evento_id: '',
      categoria: categoria
    }, ctx.chat.id, ctx.from.username || ctx.from.first_name);

    // Actualizar balance
    await sheetsClient.actualizarBalance('DJ EDY', -monto, false);

    await ctx.reply(
      `📉 *GASTO DIRECTO*\n\n` +
      `💰 Monto: $${monto.toFixed(2)}\n` +
      `📝 ${descripcion}\n` +
      `🏷️ ${categoria}\n` +
      `🏢 Cuenta: DJ EDY\n\n` +
      `✅ Restado del balance actual.`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /GASTOSEVENTO ==========
bot.command('gastosevento', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length !== 1) {
    await ctx.reply('❌ Usa: /gastosevento [ID]\nEjemplo: /gastosevento E001');
    return;
  }
  
  const eventoId = args[0];
  
  try {
    const sheetsClient = ctx.sheetsClient;
    const gastos = await sheetsClient.getGastosEvento(eventoId);
    const evento = await sheetsClient.getEventoById(eventoId);
    
    if (!evento) {
      await ctx.reply(`❌ Evento ${eventoId} no encontrado.`);
      return;
    }
    
    if (gastos.length === 0) {
      await ctx.reply(`📭 No hay gastos para ${eventoId} - ${evento.nombre}`);
      return;
    }
    
    let totalGastos = 0;
    let mensaje = `📋 *GASTOS - ${eventoId}*\n\n`;
    
    gastos.forEach((gasto, index) => {
      totalGastos += gasto.monto;
      const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES');
      mensaje += `${index + 1}. $${gasto.monto.toFixed(2)} - ${gasto.descripcion}\n`;
      mensaje += `   📅 ${fecha}\n`;
      if (index < gastos.length - 1) mensaje += `   ─────\n`;
    });
    
    mensaje += `\n💰 *Total:* $${totalGastos.toFixed(2)}\n`;
    mensaje += `🎯 *Presupuesto:* $${evento.presupuesto_total.toFixed(2)}\n`;
    mensaje += `📊 *Neto:* $${(evento.presupuesto_total - totalGastos).toFixed(2)}`;
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /EVENTO ==========
bot.command('evento', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length !== 1) {
    await ctx.reply('❌ Usa: /evento [ID]\nEjemplo: /evento E001');
    return;
  }
  
  const eventoId = args[0];
  
  try {
    const sheetsClient = ctx.sheetsClient;
    const evento = await sheetsClient.getEventoById(eventoId);
    
    if (!evento) {
      await ctx.reply(`❌ Evento ${eventoId} no encontrado.`);
      return;
    }
    
    const gastos = await sheetsClient.getGastosEvento(eventoId);
    const totalGastos = gastos.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const porcentaje = evento.presupuesto_total > 0 
      ? (evento.pagado_total / evento.presupuesto_total * 100).toFixed(0)
      : '0';
    
    let mensaje = `📋 *DETALLE - ${eventoId}*\n\n`;
    mensaje += `*Nombre:* ${evento.nombre}\n`;
    mensaje += `*Cliente:* ${evento.cliente || 'No especificado'}\n`;
    mensaje += `*Fecha:* ${evento.fecha_evento || 'No definida'}\n`;
    mensaje += `*Estado:* ${evento.estado}\n\n`;
    
    mensaje += `💰 *FINANZAS:*\n`;
    mensaje += `• Presupuesto: $${evento.presupuesto_total.toFixed(2)}\n`;
    mensaje += `• Pagado: $${evento.pagado_total.toFixed(2)} (${porcentaje}%)\n`;
    mensaje += `• Pendiente: $${evento.pendiente.toFixed(2)}\n`;
    mensaje += `• Gastos: $${totalGastos.toFixed(2)}\n`;
    mensaje += `• *Neto:* $${(evento.presupuesto_total - totalGastos).toFixed(2)}\n\n`;
    
    if (evento.notas) {
      mensaje += `📝 *NOTAS:*\n${evento.notas}\n\n`;
    }
    
    mensaje += `📊 *ACCIONES:*\n`;
    mensaje += `/deposito ${eventoId} [MONTO]\n`;
    mensaje += `/gasto ${eventoId} [MONTO] [DESCRIPCIÓN]\n`;
    mensaje += `/gastosevento ${eventoId}\n`;
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /RETENCIONES ==========
bot.command('retenciones', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.sheetId,
      range: 'balance_cuentas!A:D',
    });
    
    const rows = response.data.values || [];
    let djEdyPendiente = 0;
    
    rows.forEach(row => {
      if (row[0] === 'DJ EDY') {
        djEdyPendiente = parseFloat(row[2]) || 0;
      }
    });
    
    const eventos = await sheetsClient.getEventosActivos();
    let eventosConRetencion = [];
    
    eventos.forEach(evento => {
      if (evento.deposito_inicial && parseFloat(evento.deposito_inicial) > 0) {
        eventosConRetencion.push(evento);
      }
    });
    
    let mensaje = `🏢 *RETENCIONES DJ EDY*\n\n`;
    mensaje += `💰 *Total retenido:* $${djEdyPendiente.toFixed(2)}\n\n`;
    
    if (eventosConRetencion.length > 0) {
      mensaje += `📋 *Eventos con depósitos:*\n`;
      
      eventosConRetencion.forEach((evento, index) => {
        const deposito = parseFloat(evento.deposito_inicial) || 0;
        mensaje += `${index + 1}. *${evento.id} - ${evento.nombre}*\n`;
        mensaje += `   Depósito: $${deposito.toFixed(2)}\n`;
        mensaje += `   Pendiente: $${evento.pendiente.toFixed(2)}\n`;
        
        if (index < eventosConRetencion.length - 1) {
          mensaje += `   ─────\n`;
        }
      });
    } else {
      mensaje += `📭 No hay eventos con depósitos retenidos.\n`;
    }
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== MANEJO DE BOTONES INLINE ==========
bot.on('callback_query', async (ctx) => {
  try {
    const action = ctx.callbackQuery.data;
    
    // Responder al callback primero
    await ctx.answerCbQuery();
    
    switch(action) {
      case 'nuevoevento':
        // Simular que el usuario escribió /nuevoevento
        ctx.message = { 
          text: '/nuevoevento', 
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        };
        // Llamar al handler del comando
        await bot.handleUpdate({ 
          message: ctx.message,
          update_id: Date.now()
        });
        break;
        
      case 'eventos':
        ctx.message = { 
          text: '/eventos', 
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        };
        await bot.handleUpdate({ 
          message: ctx.message,
          update_id: Date.now()
        });
        break;
        
      case 'deposito':
        await ctx.reply('Formato: /deposito [ID] [MONTO]\nEjemplo: /deposito E001 500');
        break;
        
      case 'pagocompleto':
        await ctx.reply('Formato: /pagocompleto [ID] [MONTO]\nEjemplo: /pagocompleto E001 1500');
        break;
        
      case 'gasto':
        await ctx.reply('Formato: /gasto [ID] [MONTO] [DESCRIPCIÓN]\nEjemplo: /gasto E001 200 transporte');
        break;
        
      case 'gastodirecto':
        await ctx.reply('Formato: /gastodirecto [MONTO] [DESCRIPCIÓN]\nEjemplo: /gastodirecto 150 publicidad');
        break;
        
      case 'balance':
        ctx.message = { 
          text: '/balance', 
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        };
        await bot.handleUpdate({ 
          message: ctx.message,
          update_id: Date.now()
        });
        break;
        
      case 'reporte':
        ctx.message = { 
          text: '/reporte', 
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        };
        await bot.handleUpdate({ 
          message: ctx.message,
          update_id: Date.now()
        });
        break;
        
      case 'ayuda':
        ctx.message = { 
          text: '/ayuda', 
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        };
        await bot.handleUpdate({ 
          message: ctx.message,
          update_id: Date.now()
        });
        break;
        
      case 'comandos':
        ctx.message = { 
          text: '/comandos', 
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        };
        await bot.handleUpdate({ 
          message: ctx.message,
          update_id: Date.now()
        });
        break;
        
      default:
        await ctx.reply('Comando no reconocido.');
    }
  } catch (error) {
    console.error('Error en botón:', error);
    await ctx.answerCbQuery('❌ Error');
  }
});

// ========== HANDLER DE MENSAJES DE TEXTO ==========
bot.on('text', async (ctx) => {
  try {
    // Ignorar mensajes que son comandos (ya los manejan los handlers específicos)
    if (ctx.message.text.startsWith('/')) {
      return;
    }
    await handleMessage(ctx);
  } catch (error) {
    console.error('Error en mensaje:', error);
    await ctx.reply('❌ Error procesando mensaje.');
  }
});

// Manejo de errores
bot.catch((err, ctx) => {
  console.error(`Error:`, err);
});

// Handler principal para Vercel
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'DJ EDY Accounting Bot' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const update = req.body;
    await bot.handleUpdate(update);
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Error webhook:', error);
    res.status(500).json({ error: 'Error interno' });
  }
};
