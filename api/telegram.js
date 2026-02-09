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
    let totalGastosEventos = 0;
    let totalGastosDirectos = 0;
    let eventosCompletados = 0;
    let eventosEnProceso = 0;
    let gastosPorCategoria = {};
    
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
        
        // Acumular por categoría
        const categoria = t.categoria || 'general';
        gastosPorCategoria[categoria] = (gastosPorCategoria[categoria] || 0) + monto;
      }
    });
    
    const totalGastos = totalGastosEventos + totalGastosDirectos;
    const balanceMes = totalIngresos - totalGastos;
    
    // Construir mensaje del reporte
    let mensaje = `📊 *REPORTE MENSUAL - ${mes.toUpperCase()}*\n\n`;
    
    // Sección de eventos
    mensaje += `📅 *EVENTOS:*\n`;
    mensaje += `   ✅ Completados: ${eventosCompletados}\n`;
    mensaje += `   ⏳ En proceso: ${eventosEnProceso}\n`;
    mensaje += `   📋 Total: ${eventos.length}\n\n`;
    
    // Sección de finanzas
    mensaje += `💰 *FINANZAS:*\n`;
    mensaje += `   📈 Ingresos totales: $${totalIngresos.toFixed(2)}\n`;
    mensaje += `   📉 Gastos totales: $${totalGastos.toFixed(2)}\n`;
    mensaje += `      └ Gastos en eventos: $${totalGastosEventos.toFixed(2)}\n`;
    mensaje += `      └ Gastos directos: $${totalGastosDirectos.toFixed(2)}\n`;
    mensaje += `   💰 Balance neto: $${balanceMes.toFixed(2)}\n\n`;
    
    // Sección de repartición DJ EDY
    const fondoEmpresa = totalIngresos * 0.1;
    const ingresoPersonal = totalIngresos * 0.65;
    const ingresoAhorro = totalIngresos * 0.25;
    
    mensaje += `🏢 *DJ EDY - REPARTICIÓN TEÓRICA:*\n`;
    mensaje += `   🎧 Personal (65%): $${ingresoPersonal.toFixed(2)}\n`;
    mensaje += `   💰 Ahorros (25%): $${ingresoAhorro.toFixed(2)}\n`;
    mensaje += `   🏢 Fondo empresa (10%): $${fondoEmpresa.toFixed(2)}\n\n`;
    
    // Sección de categorías de gastos (solo si hay gastos)
    if (totalGastos > 0 && Object.keys(gastosPorCategoria).length > 0) {
      mensaje += `📋 *GASTOS POR CATEGORÍA:*\n`;
      Object.entries(gastosPorCategoria).forEach(([categoria, monto]) => {
        const porcentaje = ((monto / totalGastos) * 100).toFixed(1);
        mensaje += `   • ${categoria}: $${monto.toFixed(2)} (${porcentaje}%)\n`;
      });
      mensaje += `\n`;
    }
    
    // Footer
    mensaje += `📅 *Generado:* ${new Date().toLocaleDateString('es-ES', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
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

// ========== COMANDO /START CON TECLADO DE RESPUESTA ==========
bot.start(async (ctx) => {
  // Crear teclado de respuesta (aparece debajo del chat)
  const replyKeyboard = {
    keyboard: [
      ['📅 Nuevo Evento', '📋 Ver Eventos'],
      ['💰 Registrar Depósito', '✅ Pago Completo'],
      ['📉 Gasto en Evento', '🏢 Gasto Directo'],
      ['📊 Ver Balance', '📈 Reporte Mensual'],
      ['❓ Ayuda', '📋 Comandos']
    ],
    resize_keyboard: true,    // Teclado más pequeño
    one_time_keyboard: false, // Permanece visible
    selective: true
  };

  await ctx.reply(
    `🎧 *¡Hola DJ EDY!*\n\n` +
    `Sistema de contabilidad profesional para tus eventos.\n\n` +
    `*👆 Usa los botones debajo o escribe comandos:*\n\n` +
    `*📝 Ejemplos rápidos:*\n` +
    `• /deposito E001 500\n` +
    `• /gasto E001 200 transporte\n` +
    `• /balance\n` +
    `• /reporte`,
    { 
      parse_mode: 'Markdown',
      reply_markup: replyKeyboard
    }
  );
});


// ========== COMANDO /COMANDOS CON BOTONES ==========
bot.command('comandos', async (ctx) => {
  const commandsKeyboard = {
    inline_keyboard: [
      [
        { text: '📅 Eventos', callback_data: 'menu_eventos' },
        { text: '💰 Pagos', callback_data: 'menu_pagos' }
      ],
      [
        { text: '📉 Gastos', callback_data: 'menu_gastos' },
        { text: '📊 Finanzas', callback_data: 'menu_finanzas' }
      ],
      [
        { text: '🏠 Menú Principal', callback_data: 'menu_principal' },
        { text: '❓ Ayuda', callback_data: 'menu_ayuda' }
      ]
    ]
  };

  await ctx.reply(
    `📋 *MENÚ DE COMANDOS*\n\n` +
    `*Usa los botones o escribe directamente:*\n\n` +
    `📅 *Eventos:* /nuevoevento /eventos /evento /proximos\n` +
    `💰 *Pagos:* /deposito /pagocompleto\n` +
    `📉 *Gastos:* /gasto /gastodirecto /gastosevento\n` +
    `📊 *Finanzas:* /balance /reporte /retenciones\n\n` +
    `*Ejemplos:*\n` +
    `/deposito E001 500\n` +
    `/gasto E001 200 transporte\n` +
    `/balance`,
    { 
      parse_mode: 'Markdown',
      reply_markup: commandsKeyboard
    }
  );
});


// Comando /ayuda
bot.help(async (ctx) => {
  await ctx.reply(
    `*🎧 SISTEMA DJ EDY - AYUDA COMPLETA*\n\n` +
    `*📅 GESTIÓN DE EVENTOS:*\n` +
    `/nuevoevento - Crear evento nuevo\n` +
    `/eventos - Listar eventos activos (con gastos)\n` +
    `/evento [ID] - Ver detalle de evento específico\n` +
    `/gastosevento [ID] - Ver gastos de un evento\n` +
    `/proximos - Ver eventos próximos (7 días)\n\n` +
    `*💰 PAGOS Y DEPÓSITOS:*\n` +
    `/deposito [ID] [MONTO] - Registrar depósito inicial\n` +
    `/pagocompleto [ID] [MONTO] - Registrar pago completo (reparte auto)\n` +
    `/pago [ID] [MONTO] - Registrar pago parcial\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto [ID] [MONTO] [DESCRIPCIÓN] - Gasto vinculado a evento\n` +
    `/gastodirecto [MONTO] [DESCRIPCIÓN] - Gasto general DJ EDY\n` +
    `/gastosevento [ID] - Ver gastos de evento\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance - Ver balances de cuentas\n` +
    `/retenciones - Ver retenciones del mes\n` +
    `/reporte [MES] - Reporte mensual detallado\n\n` +
    `*📝 FORMATOS:*\n` +
    `• ID Evento: E001, E002, etc.\n` +
    `• Montos: 500, 1000.50, 2000\n` +
    `• Fechas: DD-MM-AAAA\n\n` +
    `*🔢 REPARTICIÓN AUTOMÁTICA:*\n` +
    `Al completar pago: 65% Personal, 25% Ahorros, 10% DJ EDY\n\n` +
    `*📋 GASTOS EN EVENTOS:*\n` +
    `• Se muestran en /eventos\n` +
    `• Se restan del neto para repartir\n` +
    `• Se ven en /reporte separados\n\n` +
    `📞 Soporte: @tu_usuario`,
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
    
    let mensaje = `📅 *EVENTOS ACTIVOS*\n\n`;
    
    eventos.forEach((evento, index) => {
      const porcentaje = evento.presupuesto_total > 0 
        ? (evento.pagado_total / evento.presupuesto_total * 100).toFixed(0)
        : '0';
      
      // Calcular neto después de gastos
      const gastosTotales = parseFloat(evento.gastos_totales) || 0;
      const netoDespuesGastos = evento.presupuesto_total - gastosTotales;
      
      mensaje += `*${evento.id} - ${evento.nombre}*\n`;
      mensaje += `👤 ${evento.cliente || 'Sin cliente'}\n`;
      mensaje += `💰 Presupuesto: $${evento.presupuesto_total.toFixed(2)}\n`;
      mensaje += `📥 Pagado: $${evento.pagado_total.toFixed(2)} (${porcentaje}%)\n`;
      mensaje += `⏳ Pendiente: $${evento.pendiente.toFixed(2)}\n`;
      
      // MOSTRAR GASTOS SI EXISTEN
      if (gastosTotales > 0) {
        mensaje += `📉 *Gastos:* $${gastosTotales.toFixed(2)}\n`;
        mensaje += `📊 *Neto (después de gastos):* $${netoDespuesGastos.toFixed(2)}\n`;
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


// ========== COMANDO /RETENCIONES ==========
bot.command('retenciones', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    
    // Obtener balances
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.sheetId,
      range: 'balance_cuentas!A:D',
    });
    
    const rows = response.data.values || [];
    let djEdyPendiente = 0;
    
    // Buscar DJ EDY pendiente
    rows.forEach(row => {
      if (row[0] === 'DJ EDY') {
        djEdyPendiente = parseFloat(row[2]) || 0;
      }
    });
    
    // Obtener eventos en proceso con depósitos retenidos
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
      mensaje += `📋 *Eventos con depósitos retenidos:*\n`;
      
      eventosConRetencion.forEach((evento, index) => {
        const deposito = parseFloat(evento.deposito_inicial) || 0;
        const porcentaje = evento.presupuesto_total > 0 
          ? (deposito / evento.presupuesto_total * 100).toFixed(0)
          : '0';
        
        mensaje += `${index + 1}. *${evento.id} - ${evento.nombre}*\n`;
        mensaje += `   Depósito: $${deposito.toFixed(2)} (${porcentaje}%)\n`;
        mensaje += `   Pendiente total: $${evento.pendiente.toFixed(2)}\n`;
        
        if (index < eventosConRetencion.length - 1) {
          mensaje += `   ─────\n`;
        }
      });
      
      mensaje += `\n`;
    } else {
      mensaje += `📭 No hay eventos con depósitos retenidos actualmente.\n\n`;
    }
    
    mensaje += `💡 *Nota:* Los depósitos se retienen en DJ EDY hasta completar el pago.\n`;
    mensaje += `Al completarse, se reparten: 65% Personal, 25% Ahorros, 10% DJ EDY.\n\n`;
    mensaje += `📅 *Actualizado:* ${new Date().toLocaleDateString('es-ES')}`;
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error en /retenciones:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /GASTO ==========
bot.command('gasto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 3) {
    await ctx.reply(
      `❌ *Formato incorrecto*\n\n` +
      `Usa: /gasto [ID_EVENTO] [MONTO] [DESCRIPCIÓN]\n\n` +
      `*Ejemplos:*\n` +
      `/gasto E001 200 transporte\n` +
      `/gasto E001 500 alquiler equipo\n` +
      `/gasto E001 150 ayudante extra`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const [eventoId, montoStr, ...descripcionParts] = args;
  const descripcion = descripcionParts.join(' ');
  const monto = parseFloat(montoStr.replace(',', '.'));
  
  if (isNaN(monto) || monto <= 0) {
    await ctx.reply('❌ Monto inválido. Usa números positivos (ej: 200, 50.5).');
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
      `📋 Evento: ${eventoId} - ${resultado.eventoNombre}\n` +
      `💰 Gasto: $${monto.toFixed(2)}\n` +
      `📝 Descripción: ${descripcion}\n\n` +
      `📊 *Impacto en evento:*\n` +
      `   Presupuesto total: $${resultado.presupuestoTotal.toFixed(2)}\n` +
      `   Gastos acumulados: $${resultado.gastosTotales.toFixed(2)}\n` +
      `   Neto para repartir: $${resultado.netoRestante.toFixed(2)}\n\n` +
      `✅ *Este gasto se restará al calcular la repartición final.*`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error en /gasto:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /GASTODIRECTO ==========
bot.command('gastodirecto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 2) {
    await ctx.reply(
      `❌ *Formato incorrecto*\n\n` +
      `Usa: /gastodirecto [MONTO] [DESCRIPCIÓN]\n\n` +
      `*Ejemplos:*\n` +
      `/gastodirecto 200 publicidad_instagram\n` +
      `/gastodirecto 500 compra_equipo_dj\n` +
      `/gastodirecto 150 mantenimiento_auto\n\n` +
      `*Categorías automáticas:*\n` +
      `• publicidad, promo, marketing → "marketing"\n` +
      `• equipo, compra, herramienta → "equipo"\n` +
      `• transporte, gasolina, viaje → "transporte"\n` +
      `• comida, alimentación → "comida"\n` +
      `• otros → "gasto_general"`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const [montoStr, ...descripcionParts] = args;
  const descripcion = descripcionParts.join(' ');
  const monto = parseFloat(montoStr.replace(',', '.'));
  
  if (isNaN(monto) || monto <= 0) {
    await ctx.reply('❌ Monto inválido. Usa números positivos (ej: 200, 50.5).');
    return;
  }
  
  try {
    const sheetsClient = ctx.sheetsClient;
    
    // Determinar categoría automáticamente
    let categoria = 'gasto_general';
    const descLower = descripcion.toLowerCase();
    
    if (descLower.includes('publicidad') || descLower.includes('promo') || descLower.includes('marketing') || descLower.includes('instagram') || descLower.includes('facebook')) {
      categoria = 'marketing';
    } else if (descLower.includes('equipo') || descLower.includes('compra') || descLower.includes('herramienta') || descLower.includes('instrumento')) {
      categoria = 'equipo';
    } else if (descLower.includes('transporte') || descLower.includes('gasolina') || descLower.includes('viaje') || descLower.includes('uber')) {
      categoria = 'transporte';
    } else if (descLower.includes('comida') || descLower.includes('alimentación') || descLower.includes('restaurante')) {
      categoria = 'comida';
    } else if (descLower.includes('alquiler') || descLower.includes('renta')) {
      categoria = 'alquiler';
    }
    
    const resultado = await sheetsClient.registrarGastoDirecto(
      monto, 
      descripcion,
      categoria,
      ctx.chat.id,
      ctx.from.username || ctx.from.first_name
    );
    
    await ctx.reply(
      `📉 *GASTO DIRECTO REGISTRADO*\n\n` +
      `💰 Monto: $${monto.toFixed(2)}\n` +
      `📝 Descripción: ${descripcion}\n` +
      `🏷️ Categoría: ${categoria}\n` +
      `🏢 Cuenta: DJ EDY\n\n` +
      `✅ *Este gasto se restará del balance actual de DJ EDY.*\n` +
      `📅 Fecha: ${new Date().toLocaleDateString('es-ES')}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error en /gastodirecto:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== COMANDO /GASTOSEVENTO ==========
bot.command('gastosevento', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length !== 1) {
    await ctx.reply('❌ Usa: /gastosevento [ID_EVENTO]');
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
      await ctx.reply(`📭 No hay gastos registrados para ${eventoId} - ${evento.nombre}`);
      return;
    }
    
    let totalGastos = 0;
    let mensaje = `📋 *GASTOS - ${eventoId} - ${evento.nombre}*\n\n`;
    
    gastos.forEach((gasto, index) => {
      totalGastos += gasto.monto;
      const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES');
      mensaje += `${index + 1}. $${gasto.monto.toFixed(2)} - ${gasto.descripcion}\n`;
      mensaje += `   📅 ${fecha}\n`;
      if (index < gastos.length - 1) mensaje += `   ─────\n`;
    });
    
    mensaje += `\n💰 *Total gastos:* $${totalGastos.toFixed(2)}\n`;
    mensaje += `🎯 *Presupuesto total:* $${evento.presupuesto_total.toFixed(2)}\n`;
    mensaje += `📊 *Neto para repartir:* $${(evento.presupuesto_total - totalGastos).toFixed(2)}`;
    
    await ctx.reply(mensaje, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});


// ========== MANEJADOR DE BOTONES DEL TECLADO (FALTANTE) ==========
bot.hears(['📅 Nuevo Evento', '📋 Ver Eventos', '💰 Registrar Depósito', '✅ Pago Completo', 
           '📉 Gasto en Evento', '🏢 Gasto Directo', '📊 Ver Balance', '📈 Reporte Mensual',
           '❓ Ayuda', '📋 Comandos'], async (ctx) => {
  
  const buttonText = ctx.message.text;
  console.log(`🔔 Botón del teclado: ${buttonText}`);
  
  switch(buttonText) {
    case '📅 Nuevo Evento':
      await ctx.reply('Para crear un nuevo evento, escribe: /nuevoevento');
      break;
      
    case '📋 Ver Eventos':
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
      break;
      
    case '💰 Registrar Depósito':
      await ctx.reply('💰 *REGISTRAR DEPÓSITO*\n\nFormato: `/deposito [ID] [MONTO]`\nEjemplo: `/deposito E001 500`', { parse_mode: 'Markdown' });
      break;
      
    case '✅ Pago Completo':
      await ctx.reply('✅ *PAGO COMPLETO*\n\nFormato: `/pagocompleto [ID] [MONTO]`\nEjemplo: `/pagocompleto E001 1500`', { parse_mode: 'Markdown' });
      break;
      
    case '📉 Gasto en Evento':
      await ctx.reply('📉 *GASTO EN EVENTO*\n\nFormato: `/gasto [ID] [MONTO] [DESCRIPCIÓN]`\nEjemplo: `/gasto E001 200 transporte`', { parse_mode: 'Markdown' });
      break;
      
    case '🏢 Gasto Directo':
      await ctx.reply('🏢 *GASTO DIRECTO*\n\nFormato: `/gastodirecto [MONTO] [DESCRIPCIÓN]`\nEjemplo: `/gastodirecto 150 publicidad`', { parse_mode: 'Markdown' });
      break;
      
    case '📊 Ver Balance':
      // Simplemente redirigir al comando /balance
      ctx.message.text = '/balance';
      return bot.command('balance').middleware()(ctx);
      break;
      
    case '📈 Reporte Mensual':
      await ctx.reply('📈 *REPORTE MENSUAL*\n\nEscribe: `/reporte`\nPara mes específico: `/reporte [mes]`', { parse_mode: 'Markdown' });
      break;
      
    case '❓ Ayuda':
      // Redirigir al comando /ayuda
      ctx.message.text = '/ayuda';
      return bot.command('help').middleware()(ctx);
      break;
      
    case '📋 Comandos':
      // Redirigir al comando /comandos
      ctx.message.text = '/comandos';
      return bot.command('comandos').middleware()(ctx);
      break;
  }
});


// ========== BOTONES DE AYUDA INLINE ==========
bot.on('callback_query', async (ctx) => {
  try {
    const action = ctx.callbackQuery.data;
    await ctx.answerCbQuery();
    
    switch(action) {
      case 'menu_eventos':
        await ctx.replyWithMarkdown(
          '📅 *COMANDOS DE EVENTOS*\n\n' +
          '`/nuevoevento` - Crear nuevo evento\n' +
          '`/eventos` - Ver eventos activos\n' +
          '`/evento E001` - Ver detalle de evento\n' +
          '`/gastosevento E001` - Ver gastos de evento\n' +
          '`/proximos` - Eventos próximos (7 días)'
        );
        break;
        
      case 'menu_pagos':
        await ctx.replyWithMarkdown(
          '💰 *COMANDOS DE PAGOS*\n\n' +
          '`/deposito E001 500` - Registrar depósito\n' +
          '`/pagocompleto E001 1500` - Pago completo\n\n' +
          '*Formato:* `/comando [ID] [MONTO]`\n\n' +
          '*Ejemplos:*\n' +
          '`/deposito E001 500`\n' +
          '`/pagocompleto E001 1000`'
        );
        break;
        
      case 'menu_gastos':
        await ctx.replyWithMarkdown(
          '📉 *COMANDOS DE GASTOS*\n\n' +
          '`/gasto E001 200 transporte` - Gasto en evento\n' +
          '`/gastodirecto 150 publicidad` - Gasto directo DJ EDY\n' +
          '`/gastosevento E001` - Ver gastos de evento\n\n' +
          '*Ejemplos:*\n' +
          '`/gasto E001 300 ayudante_extra`\n' +
          '`/gastodirecto 200 compra_equipo`\n' +
          '`/gastosevento E001`'
        );
        break;
        
      case 'menu_finanzas':
        await ctx.replyWithMarkdown(
          '📊 *COMANDOS DE FINANZAS*\n\n' +
          '`/balance` - Ver balances\n' +
          '`/reporte` - Reporte mensual\n' +
          '`/retenciones` - Ver retenciones\n\n' +
          '*Ejemplos:*\n' +
          '`/balance`\n' +
          '`/reporte enero`\n' +
          '`/retenciones`'
        );
        break;
        
      case 'menu_principal':
        // Volver al menú principal
        ctx.message = { 
          text: '/start', 
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        };
        return bot.handleUpdate({ 
          message: ctx.message,
          update_id: Date.now()
        });
        break;
        
      case 'menu_ayuda':
        ctx.message = { 
          text: '/ayuda', 
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        };
        return bot.handleUpdate({ 
          message: ctx.message,
          update_id: Date.now()
        });
        break;
    }
  } catch (error) {
    console.error('Error en callback:', error);
  }
});


// ========== HANDLER DE MENSAJES DE TEXTO ==========
bot.on('text', async (ctx) => {
  try {
    // Si es un comando, ya se manejó por los handlers específicos
    if (ctx.message.text.startsWith('/')) {
      return;
    }
    
    // Si no es comando, pasar a handleMessage
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
