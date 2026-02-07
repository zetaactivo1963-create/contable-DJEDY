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


// ========== COMANDO /REPORTE ==========
bot.command('reporte', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    const mes = args[0] || new Date().toLocaleDateString('es-ES', { month: 'long' });
    
    const sheetsClient = ctx.sheetsClient;
    
    // Obtener eventos del mes
    const eventos = await sheetsClient.getEventosDelMes(mes);
    
    // Obtener transacciones del mes
    const transacciones = await sheetsClient.getTransaccionesDelMes(mes);
    
    // Calcular totales
    let totalIngresos = 0;
    let totalGastos = 0;
    let eventosCompletados = 0;
    let eventosEnProceso = 0;
    
    eventos.forEach(evento => {
      if (evento.estado === 'completado') eventosCompletados++;
      if (evento.estado === 'en_proceso') eventosEnProceso++;
    });
    
    transacciones.forEach(t => {
      const monto = parseFloat(t.monto) || 0;
      if (t.tipo === 'ingreso') totalIngresos += monto;
      if (t.tipo === 'gasto') totalGastos += monto;
    });
    
    const balanceMes = totalIngresos - totalGastos;
    
    await ctx.reply(
      `📊 *REPORTE MENSUAL - ${mes.toUpperCase()}*\n\n` +
      `📅 *Eventos:*\n` +
      `   ✅ Completados: ${eventosCompletados}\n` +
      `   ⏳ En proceso: ${eventosEnProceso}\n` +
      `   📋 Total: ${eventos.length}\n\n` +
      `💰 *Finanzas:*\n` +
      `   📈 Ingresos: $${totalIngresos.toFixed(2)}\n` +
      `   📉 Gastos: $${totalGastos.toFixed(2)}\n` +
      `   💰 Balance: $${balanceMes.toFixed(2)}\n\n` +
      `🏢 *DJ EDY Empresa:*\n` +
      `   Depósitos retenidos: $${(totalIngresos * 0.9).toFixed(2)}\n` +
      `   Fondo empresa (10%): $${(totalIngresos * 0.1).toFixed(2)}\n\n` +
      `📅 *Generado:* ${new Date().toLocaleDateString('es-ES')}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error en /reporte:', error);
    await ctx.reply(`❌ Error generando reporte: ${error.message}`);
  }
});

// ========== COMANDO /PROXIMOS ==========
bot.command('proximos', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    const eventosProximos = await sheetsClient.getEventosProximos();
    
    if (eventosProximos.length === 0) {
      await ctx.reply('📭 No hay eventos próximos en los próximos 7 días.');
      return;
    }
    
    let mensaje = `🔔 *EVENTOS PRÓXIMOS (7 días)*\n\n`;
    
    eventosProximos.forEach(evento => {
      const diasRestantes = Math.ceil((new Date(evento.fecha_evento) - new Date()) / (1000 * 60 * 60 * 24));
      const porcentaje = (evento.pagado_total / evento.presupuesto_total * 100).toFixed(0);
      
      mensaje += `📅 *${evento.nombre}*\n`;
      mensaje += `   👤 ${evento.cliente || 'Sin cliente'}\n`;
      mensaje += `   🗓️ ${evento.fecha_evento} (en ${diasRestantes} días)\n`;
      mensaje += `   💰 $${evento.pagado_total.toFixed(2)} / $${evento.presupuesto_total.toFixed(2)} (${porcentaje}%)\n`;
      mensaje += `   ⏳ Pendiente: $${evento.pendiente.toFixed(2)}\n`;
      mensaje += `   ──────────────\n`;
    });
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
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

// ========== COMANDOS PRINCIPALES ==========

// Comando /start
bot.start(async (ctx) => {
  await ctx.reply(
    `🎧 *¡Hola DJ EDY!*\n\n` +
    `Sistema de contabilidad profesional para tus eventos.\n\n` +
    `*📋 COMANDOS PRINCIPALES:*\n` +
    `/nuevoevento - Crear nuevo evento\n` +
    `/deposito [ID] [MONTO] - Registrar depósito\n` +
    `/pagocompleto [ID] [MONTO] - Completar pago (reparte 65/25/10)\n` +
    `/eventos - Ver eventos activos\n` +
    `/balance - Ver balances\n` +
    `/ayuda - Mostrar ayuda completa\n\n` +
    `*📝 EJEMPLOS RÁPIDOS:*\n` +
    `• /nuevoevento\n` +
    `• /deposito E001 500\n` +
    `• /pagocompleto E001 1500`,
    { parse_mode: 'Markdown' }
  );
});

// Comando /ayuda
bot.help(async (ctx) => {
  await ctx.reply(
    `*🎧 SISTEMA DJ EDY - AYUDA COMPLETA*\n\n` +
    `*📅 GESTIÓN DE EVENTOS:*\n` +
    `/nuevoevento - Crear evento nuevo\n` +
    `/eventos - Listar todos eventos\n` +
    `/evento [ID] - Ver detalle de evento\n\n` +
    `*💰 PAGOS Y DEPÓSITOS:*\n` +
    `/deposito [ID] [MONTO] - Registrar depósito inicial\n` +
    `/pagocompleto [ID] [MONTO] - Registrar pago completo (reparte auto)\n` +
    `/pago [ID] [MONTO] - Registrar pago parcial\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance - Ver balances de cuentas\n` +
    `/retenciones - Ver retenciones del mes\n` +
    `/reporte [MES] - Reporte mensual\n\n` +
    `*📝 FORMATOS:*\n` +
    `• ID Evento: E001, E002, etc.\n` +
    `• Montos: 500, 1000.50, 2000\n` +
    `• Fechas: DD-MM-AAAA\n\n` +
    `*🔢 REPARTICIÓN AUTOMÁTICA:*\n` +
    `Al completar pago: 65% Personal, 25% Ahorros, 10% DJ EDY`,
    { parse_mode: 'Markdown' }
  );
});

// Comando /nuevoevento
bot.command('nuevoevento', async (ctx) => {
  const sheetsClient = ctx.sheetsClient;
  
  // Guardar estado para flujo conversacional
  await sheetsClient.updateState(ctx.chat.id, {
    step: 'nuevoevento_nombre',
    metadata: { username: ctx.from.username }
  });
  
  await ctx.reply(
    `📅 *CREAR NUEVO EVENTO*\n\n` +
    `1. Primero, escribe el *nombre del evento*:\n` +
    `(ej: "Boda María", "Fiesta 15 años", "Evento Corporativo")`,
    { parse_mode: 'Markdown' }
  );
});

// Comando /deposito
bot.command('deposito', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length !== 2) {
    await ctx.reply(
      `❌ Formato incorrecto. Usa:\n` +
      `/deposito [ID] [MONTO]\n\n` +
      `Ejemplo: /deposito E001 500`
    );
    return;
  }
  
  const [eventoId, montoStr] = args;
  const monto = parseFloat(montoStr);
  
  if (isNaN(monto) || monto <= 0) {
    await ctx.reply('❌ Monto inválido. Usa números positivos.');
    return;
  }
  
  try {
    const sheetsClient = ctx.sheetsClient;
    const result = await sheetsClient.registrarDeposito(eventoId, monto, ctx.chat.id, ctx.from.username);
    
    await ctx.reply(
      `✅ *DEPÓSITO REGISTRADO*\n\n` +
      `📋 Evento: ${result.eventoNombre}\n` +
      `💰 Monto: $${monto.toFixed(2)}\n` +
      `🏢 Cuenta: DJ EDY (pendiente repartición)\n` +
      `📊 Total pagado: $${result.totalPagado.toFixed(2)} / $${result.presupuestoTotal.toFixed(2)}\n` +
      `⏳ Pendiente: $${result.pendiente.toFixed(2)}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// Comando /pagocompleto
bot.command('pagocompleto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length !== 2) {
    await ctx.reply(
      `❌ Formato incorrecto. Usa:\n` +
      `/pagocompleto [ID] [MONTO]\n\n` +
      `Ejemplo: /pagocompleto E001 1500`
    );
    return;
  }
  
  const [eventoId, montoStr] = args;
  const monto = parseFloat(montoStr);
  
  if (isNaN(monto) || monto <= 0) {
    await ctx.reply('❌ Monto inválido. Usa números positivos.');
    return;
  }
  
  try {
    const sheetsClient = ctx.sheetsClient;
    const result = await sheetsClient.registrarPagoCompleto(eventoId, monto, ctx.chat.id, ctx.from.username);
    
    await ctx.reply(
      `🎉 *¡EVENTO COMPLETADO!*\n\n` +
      `📋 ${result.eventoNombre}\n` +
      `💰 Pago final: $${monto.toFixed(2)}\n` +
      `🎯 Presupuesto total: $${result.presupuestoTotal.toFixed(2)}\n\n` +
      `📊 *REPARTICIÓN AUTOMÁTICA:*\n` +
      `🎧 DJ EDY Personal (65%): $${result.reparticion.personal.toFixed(2)}\n` +
      `💰 Ahorros (25%): $${result.reparticion.ahorro.toFixed(2)}\n` +
      `🏢 Fondo DJ EDY (10%): $${result.reparticion.empresa.toFixed(2)}\n\n` +
      `✅ Pago repartido según contrato`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// Comando /eventos
bot.command('eventos', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    const eventos = await sheetsClient.getEventosActivos();
    
    if (eventos.length === 0) {
      await ctx.reply('📭 No hay eventos activos.');
      return;
    }
    
    let mensaje = `📅 EVENTOS ACTIVOS\n\n`;
    
    eventos.forEach((evento, index) => {
      const porcentaje = evento.presupuesto_total > 0 
        ? (evento.pagado_total / evento.presupuesto_total * 100).toFixed(0)
        : '0';
      
      mensaje += `${evento.id} - ${evento.nombre}\n`;
      mensaje += `👤 ${evento.cliente || 'Sin cliente'}\n`;
      mensaje += `💰 $${evento.pagado_total.toFixed(2)} / $${evento.presupuesto_total.toFixed(2)} (${porcentaje}%)\n`;
      mensaje += `⏳ Pendiente: $${evento.pendiente.toFixed(2)}\n`;
      mensaje += `📊 Estado: ${evento.estado}\n`;
      
      if (index < eventos.length - 1) {
        mensaje += `──────────────\n`;
      }
    });
    
    await ctx.reply(mensaje);
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// Comando /balance
bot.command('balance', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    
    // Obtener todos los balances
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
    
    // Extraer valores
    rows.forEach(row => {
      const cuenta = row[0];
      const actual = parseFloat(row[1]) || 0;
      const pendiente = parseFloat(row[2]) || 0;
      
      if (cuenta === 'Personal') {
        balances.personal = { actual, pendiente };
      } else if (cuenta === 'DJ EDY') {
        balances.djEdy = { actual, pendiente };
      } else if (cuenta === 'Ahorros') {
        balances.ahorros = { actual, pendiente };
      }
    });
    
    // Calcular totales
    const totalPersonal = balances.personal.actual + balances.personal.pendiente;
    const totalDjEdy = balances.djEdy.actual + balances.djEdy.pendiente;
    const totalAhorros = balances.ahorros.actual + balances.ahorros.pendiente;
    const totalGeneral = totalPersonal + totalDjEdy + totalAhorros;
    
    // Construir mensaje
    let mensaje = `💰 *BALANCE DE CUENTAS*\n\n`;
    
    // Personal
    mensaje += `🎧 *Personal:* $${totalPersonal.toFixed(2)}\n`;
    if (balances.personal.pendiente !== 0) {
      mensaje += `   └ Pendiente: $${balances.personal.pendiente.toFixed(2)}\n`;
    }
    
    // Ahorros
    mensaje += `💰 *Ahorros:* $${totalAhorros.toFixed(2)}\n`;
    if (balances.ahorros.pendiente !== 0) {
      mensaje += `   └ Pendiente: $${balances.ahorros.pendiente.toFixed(2)}\n`;
    }
    
    // DJ EDY (con desglose)
    mensaje += `🏢 *DJ EDY Empresa:* $${totalDjEdy.toFixed(2)}\n`;
    if (balances.djEdy.pendiente > 0) {
      mensaje += `   └ Depósitos retenidos: $${balances.djEdy.pendiente.toFixed(2)}\n`;
    }
    if (balances.djEdy.actual > 0) {
      mensaje += `   └ Fondo empresa: $${balances.djEdy.actual.toFixed(2)}\n`;
    }
    
    // Total general
    mensaje += `\n📈 *Total General:* $${totalGeneral.toFixed(2)}\n\n`;
    mensaje += `*🔄 Última actualización:* ${new Date().toLocaleDateString('es-ES')}`;
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error en /balance:', error);
    await ctx.reply(`❌ Error obteniendo balance: ${error.message}`);
  }
});


// Handler para mensajes de texto (flujo conversacional)
bot.on('text', async (ctx) => {
  try {
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
