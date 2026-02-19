const { Telegraf } = require('telegraf');
const { initializeSheets } = require('../lib/googleSheets');
const { handleMessage } = require('../lib/telegramBot');

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

// ========== TECLADO PRINCIPAL ==========
const mainKeyboard = {
  keyboard: [
    ['📅 Nuevo Evento', '📋 Ver Eventos'],
    ['💰 Registrar Depósito', '✅ Pago Completo'],
    ['📉 Gasto en Evento', '🏢 Gasto Directo'],
    ['📊 Ver Balance', '📈 Reporte Mensual'],
    ['❓ Ayuda', '📋 Comandos']
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

// ========== COMANDO /START ==========
bot.start(async (ctx) => {
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
      reply_markup: mainKeyboard
    }
  );
});

// ========== MANEJAR BOTONES SIMPLES ==========
bot.hears('📅 Nuevo Evento', async (ctx) => {
  await ctx.reply('Para crear un nuevo evento, escribe: /nuevoevento');
});

bot.hears('📋 Ver Eventos', async (ctx) => {
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
      
      const gastosTotales = parseFloat(evento.gastos_totales) || 0;
      const netoDespuesGastos = evento.presupuesto_total - gastosTotales;
      
      mensaje += `${evento.id} - ${evento.nombre}\n`;
      mensaje += `👤 ${evento.cliente || 'Sin cliente'}\n`;
      mensaje += `💰 Presupuesto: $${evento.presupuesto_total.toFixed(2)}\n`;
      mensaje += `📥 Pagado: $${evento.pagado_total.toFixed(2)} (${porcentaje}%)\n`;
      mensaje += `⏳ Pendiente: $${evento.pendiente.toFixed(2)}\n`;
      
      if (gastosTotales > 0) {
        mensaje += `📉 Gastos: $${gastosTotales.toFixed(2)}\n`;
        mensaje += `📊 Neto: $${netoDespuesGastos.toFixed(2)}\n`;
      }
      
      mensaje += `📈 Estado: ${evento.estado}\n`;
      
      if (index < eventos.length - 1) {
        mensaje += `──────────────\n`;
      }
    });
    
    await ctx.reply(mensaje);
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('completados', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.sheetId,
      range: 'eventos!A:L',
    });

    const rows = response.data.values || [];
    const header = rows[0] || [];
    const eventosCompletados = [];

    for (let i = 1; i < rows.length; i++) {
      const evento = {};
      header.forEach((col, index) => {
        evento[col] = rows[i][index] || '';
      });
      
      if (evento.estado === 'completado') {
        evento.presupuesto_total = parseFloat(evento.presupuesto_total) || 0;
        evento.pagado_total = parseFloat(evento.pagado_total) || 0;
        evento.gastos_totales = parseFloat(evento.gastos_totales) || 0;
        eventosCompletados.push(evento);
      }
    }

    if (eventosCompletados.length === 0) {
      await ctx.reply('📭 No hay eventos completados.');
      return;
    }

    let mensaje = `✅ EVENTOS COMPLETADOS\n\n`;
    
    eventosCompletados.forEach((evento, index) => {
      const netoDespuesGastos = evento.presupuesto_total - evento.gastos_totales;
      
      mensaje += `${evento.id} - ${evento.nombre}\n`;
      mensaje += `👤 ${evento.cliente || 'Sin cliente'}\n`;
      mensaje += `💰 Presupuesto: $${evento.presupuesto_total.toFixed(2)}\n`;
      mensaje += `📥 Pagado: $${evento.pagado_total.toFixed(2)}\n`;
      
      if (evento.gastos_totales > 0) {
        mensaje += `📉 Gastos: $${evento.gastos_totales.toFixed(2)}\n`;
        mensaje += `📊 Neto final: $${netoDespuesGastos.toFixed(2)}\n`;
      }
      
      mensaje += `📅 ${evento.fecha_evento || 'Sin fecha'}\n`;
      
      if (index < eventosCompletados.length - 1) {
        mensaje += `──────────────\n`;
      }
    });
    
    await ctx.reply(mensaje);
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.hears('💰 Registrar Depósito', async (ctx) => {
  await ctx.reply('💰 *REGISTRAR DEPÓSITO*\n\nFormato: /deposito [ID] [MONTO]\n\nEjemplo: /deposito E001 500', { parse_mode: 'Markdown' });
});

bot.hears('✅ Pago Completo', async (ctx) => {
  await ctx.reply('✅ *PAGO COMPLETO*\n\nFormato: /pagocompleto [ID] [MONTO]\n\nEjemplo: /pagocompleto E001 1500', { parse_mode: 'Markdown' });
});

bot.hears('📉 Gasto en Evento', async (ctx) => {
  await ctx.reply(
    '📉 GASTO EN EVENTO\n' +
    '(gastos del evento: alquiler, transporte, etc)\n\n' +
    'Formato: /gasto [ID] [MONTO] [DESCRIPCIÓN]\n\n' +
    'Ejemplo: /gasto E001 200 transporte\n\n' +
    'ℹ️ Este gasto se resta del neto del evento.\n' +
    'NO sale de tu cuenta DJ EDY.'
  );
});

bot.hears('🏢 Gasto Directo', async (ctx) => {
  await ctx.reply(
    '🏢 GASTO DIRECTO DJ EDY\n' +
    '(gastos tuyos: publicidad, gasolina personal, etc)\n\n' +
    'Formato: /gastodirecto [MONTO] [DESCRIPCIÓN]\n\n' +
    'Ejemplo: /gastodirecto 150 publicidad instagram\n\n' +
    '⚠️ Este gasto SÍ sale de tu cuenta DJ EDY.'
  );
});
});

bot.hears('📊 Ver Balance', async (ctx) => {
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
    console.error('Error en balance:', error);
    await ctx.reply(`❌ Error obteniendo balance: ${error.message}`);
  }
});

bot.hears('📈 Reporte Mensual', async (ctx) => {
  // Llamar al comando /reporte directamente
  const sheetsClient = ctx.sheetsClient;
  const mesActual = new Date().toLocaleDateString('es-ES', { month: 'long' });
  
  try {
    const eventos = await sheetsClient.getEventosDelMes(mesActual);
    const transacciones = await sheetsClient.getTransaccionesDelMes(mesActual);
    
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
        
        const categoria = t.categoria || 'general';
        gastosPorCategoria[categoria] = (gastosPorCategoria[categoria] || 0) + monto;
      }
    });
    
    const totalGastos = totalGastosEventos + totalGastosDirectos;
    const balanceMes = totalIngresos - totalGastos;
    
    let mensaje = `📊 REPORTE MENSUAL - ${mesActual.toUpperCase()}\n\n`;
    
    mensaje += `📅 EVENTOS:\n`;
    mensaje += `   ✅ Completados: ${eventosCompletados}\n`;
    mensaje += `   ⏳ En proceso: ${eventosEnProceso}\n`;
    mensaje += `   📋 Total: ${eventos.length}\n\n`;
    
    mensaje += `💰 FINANZAS:\n`;
    mensaje += `   📈 Ingresos totales: $${totalIngresos.toFixed(2)}\n`;
    mensaje += `   📉 Gastos totales: $${totalGastos.toFixed(2)}\n`;
    mensaje += `      └ Gastos en eventos: $${totalGastosEventos.toFixed(2)}\n`;
    mensaje += `      └ Gastos directos: $${totalGastosDirectos.toFixed(2)}\n`;
    mensaje += `   💰 Balance neto: $${balanceMes.toFixed(2)}\n\n`;
    
    const fondoEmpresa = totalIngresos * 0.1;
    const ingresoPersonal = totalIngresos * 0.65;
    const ingresoAhorro = totalIngresos * 0.25;
    
    mensaje += `🏢 DJ EDY - REPARTICIÓN TEÓRICA:\n`;
    mensaje += `   🎧 Personal (65%): $${ingresoPersonal.toFixed(2)}\n`;
    mensaje += `   💰 Ahorros (25%): $${ingresoAhorro.toFixed(2)}\n`;
    mensaje += `   🏢 Fondo empresa (10%): $${fondoEmpresa.toFixed(2)}\n\n`;
    
    if (totalGastos > 0 && Object.keys(gastosPorCategoria).length > 0) {
      mensaje += `📋 GASTOS POR CATEGORÍA:\n`;
      Object.entries(gastosPorCategoria).forEach(([categoria, monto]) => {
        const porcentaje = ((monto / totalGastos) * 100).toFixed(1);
        mensaje += `   • ${categoria}: $${monto.toFixed(2)} (${porcentaje}%)\n`;
      });
      mensaje += `\n`;
    }
    
    mensaje += `📅 Generado: ${new Date().toLocaleDateString('es-ES')}`;
    
    await ctx.reply(mensaje);
    
  } catch (error) {
    console.error('Error en reporte:', error);
    await ctx.reply(`❌ Error generando reporte: ${error.message}`);
  }
});

bot.hears('❓ Ayuda', async (ctx) => {
  await ctx.reply(
    `*🎧 SISTEMA DJ EDY - AYUDA COMPLETA*\n\n` +
    `*📅 GESTIÓN DE EVENTOS:*\n` +
    `/nuevoevento - Crear evento nuevo\n` +
    `/eventos - Listar eventos activos (con gastos)\n` +
    `/completados - Ver eventos completados\n` +
    `/gastosevento [ID] - Ver gastos de un evento\n\n` +
    `*💰 PAGOS Y DEPÓSITOS:*\n` +
    `/deposito [ID] [MONTO] - Registrar depósito inicial\n` +
    `/pagocompleto [ID] [MONTO] - Registrar pago completo (reparte auto)\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto [ID] [MONTO] [DESC] - Gasto DEL evento (alquiler, transporte)\n` +
    `/gastodirecto [MONTO] [DESC] - Gasto TUYO (publicidad, gasolina)\n` +
    `/gastosevento [ID] - Ver lista de gastos de un evento\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance - Ver balances de cuentas\n` +
    `/retenidos - Ver depósitos retenidos\n` +
    `/reporte - Reporte mensual detallado\n\n` +
    `*📝 FORMATOS:*\n` +
    `• ID Evento: E001, E002, etc.\n` +
    `• Montos: 500, 1000.50, 2000\n` +
    `• Fechas: DD-MM-AAAA\n\n` +
    `*🔢 REPARTICIÓN AUTOMÁTICA:*\n` +
    `Al completar pago: 65% Personal, 25% Ahorros, 10% DJ EDY\n\n` +
    `*💡 DIFERENCIA DE GASTOS:*\n` +
    `• Gasto evento (/gasto): Se resta del neto, NO de tu cuenta\n` +
    `• Gasto directo (/gastodirecto): SÍ sale de tu cuenta DJ EDY`,
    { parse_mode: 'Markdown' }
  );
});

bot.hears('📋 Comandos', async (ctx) => {
  await ctx.reply(
    `📋 *LISTA COMPLETA DE COMANDOS*\n\n` +
    `*📅 EVENTOS:*\n` +
    `/nuevoevento /eventos /completados\n\n` +
    `*💰 PAGOS:*\n` +
    `/deposito /pagocompleto\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto /gastodirecto /gastosevento\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance /reporte /retenidos\n\n` +
    `*❓ AYUDA:*\n` +
    `/ayuda /comandos\n\n` +
    `📝 *Usa /ayuda para ejemplos y formatos.*`,
    { parse_mode: 'Markdown' }
  );
});

// ========== COMANDOS PRINCIPALES (IGUAL A TU CÓDIGO) ==========

bot.command('comandos', async (ctx) => {
  await ctx.reply(
    `📋 *LISTA COMPLETA DE COMANDOS*\n\n` +
    `*📅 EVENTOS:*\n` +
    `/nuevoevento /eventos /completados\n\n` +
    `*💰 PAGOS:*\n` +
    `/deposito /pagocompleto\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto /gastodirecto /gastosevento\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance /reporte /retenidos\n\n` +
    `*❓ AYUDA:*\n` +
    `/ayuda /comandos\n\n` +
    `📝 *Usa /ayuda para ejemplos y formatos.*`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('nuevoevento', async (ctx) => {
  const sheetsClient = ctx.sheetsClient;
  
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
    
    let mensaje = `🎉 EVENTO COMPLETADO\n\n`;
    mensaje += `📋 ${result.eventoNombre}\n`;
    mensaje += `💰 Pago final: $${monto.toFixed(2)}\n`;
    mensaje += `🎯 Presupuesto total: $${result.presupuestoTotal.toFixed(2)}\n`;
    
    // Mostrar gastos si existen
    if (result.gastosTotales > 0) {
      mensaje += `📉 Gastos del evento: $${result.gastosTotales.toFixed(2)}\n`;
      mensaje += `📊 Neto a repartir: $${result.netoRepartido.toFixed(2)}\n\n`;
    } else {
      mensaje += `\n`;
    }
    
    mensaje += `📊 REPARTICIÓN AUTOMÁTICA:\n`;
    mensaje += `🎧 Personal (65%): $${result.reparticion.personal.toFixed(2)}\n`;
    mensaje += `💰 Ahorros (25%): $${result.reparticion.ahorro.toFixed(2)}\n`;
    mensaje += `🏢 Fondo DJ EDY (10%): $${result.reparticion.empresa.toFixed(2)}\n\n`;
    mensaje += `✅ Repartido correctamente`;
    
    await ctx.reply(mensaje);
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

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
      
      const gastosTotales = parseFloat(evento.gastos_totales) || 0;
      const netoDespuesGastos = evento.presupuesto_total - gastosTotales;
      
      mensaje += `${evento.id} - ${evento.nombre}\n`;
      mensaje += `👤 ${evento.cliente || 'Sin cliente'}\n`;
      mensaje += `💰 Presupuesto: $${evento.presupuesto_total.toFixed(2)}\n`;
      mensaje += `📥 Pagado: $${evento.pagado_total.toFixed(2)} (${porcentaje}%)\n`;
      mensaje += `⏳ Pendiente: $${evento.pendiente.toFixed(2)}\n`;
      
      if (gastosTotales > 0) {
        mensaje += `📉 Gastos: $${gastosTotales.toFixed(2)}\n`;
        mensaje += `📊 Neto: $${netoDespuesGastos.toFixed(2)}\n`;
      }
      
      mensaje += `📈 Estado: ${evento.estado}\n`;
      
      if (index < eventos.length - 1) {
        mensaje += `──────────────\n`;
      }
    });
    
    await ctx.reply(mensaje);
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

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

bot.command('gasto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 3) {
    await ctx.reply(
      `❌ Formato incorrecto\n\n` +
      `Usa: /gasto [ID_EVENTO] [MONTO] [DESCRIPCIÓN]\n\n` +
      `Ejemplos:\n` +
      `/gasto E001 200 transporte\n` +
      `/gasto E001 500 alquiler equipo\n` +
      `/gasto E001 150 ayudante extra\n\n` +
      `ℹ️ Gasto EN evento (alquiler, transporte del evento)\n` +
      `NO sale de tu cuenta, se resta del neto.`
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
      `📉 GASTO EN EVENTO REGISTRADO\n\n` +
      `📋 Evento: ${eventoId} - ${resultado.eventoNombre}\n` +
      `💰 Gasto: $${monto.toFixed(2)}\n` +
      `📝 Descripción: ${descripcion}\n\n` +
      `📊 Impacto en evento:\n` +
      `   Presupuesto total: $${resultado.presupuestoTotal.toFixed(2)}\n` +
      `   Gastos acumulados: $${resultado.gastosTotales.toFixed(2)}\n` +
      `   Neto para repartir: $${resultado.netoRestante.toFixed(2)}\n\n` +
      `ℹ️ Este gasto ya salió del presupuesto del cliente.\n` +
      `Solo se restará del neto al repartir.`
    );
    
  } catch (error) {
    console.error('Error en /gasto:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('gastodirecto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 2) {
    await ctx.reply(
      `❌ Formato incorrecto\n\n` +
      `Usa: /gastodirecto [MONTO] [DESCRIPCIÓN]\n\n` +
      `Ejemplos:\n` +
      `/gastodirecto 200 publicidad instagram\n` +
      `/gastodirecto 500 compra equipo DJ\n` +
      `/gastodirecto 150 gasolina personal\n\n` +
      `⚠️ Gasto TUYO (personal/empresa)\n` +
      `SÍ sale de tu cuenta DJ EDY.`
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
    
    const resultado = await sheetsClient.registrarGastoDirecto(
      monto, 
      descripcion,
      'gasto_general',
      ctx.chat.id,
      ctx.from.username || ctx.from.first_name
    );
    
    await ctx.reply(
      `📉 *GASTO DIRECTO REGISTRADO*\n\n` +
      `💰 Monto: $${monto.toFixed(2)}\n` +
      `📝 Descripción: ${descripcion}\n` +
      `🏢 Cuenta: DJ EDY\n\n` +
      `📅 Fecha: ${new Date().toLocaleDateString('es-ES')}`
    );
    
  } catch (error) {
    console.error('Error en /gastodirecto:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('retenidos', async (ctx) => {
  try {
    const sheetsClient = ctx.sheetsClient;
    
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.sheetId,
      range: 'eventos!A:L',
    });

    const rows = response.data.values || [];
    const header = rows[0] || [];
    const eventosConRetencion = [];

    for (let i = 1; i < rows.length; i++) {
      const evento = {};
      header.forEach((col, index) => {
        evento[col] = rows[i][index] || '';
      });
      
      if (evento.estado === 'en_proceso' && parseFloat(evento.deposito_inicial || 0) > 0) {
        evento.deposito_inicial = parseFloat(evento.deposito_inicial) || 0;
        evento.pendiente = parseFloat(evento.pendiente) || 0;
        evento.presupuesto_total = parseFloat(evento.presupuesto_total) || 0;
        eventosConRetencion.push(evento);
      }
    }

    if (eventosConRetencion.length === 0) {
      await ctx.reply('📭 No hay eventos con depósitos retenidos.');
      return;
    }

    let mensaje = `💵 DEPÓSITOS RETENIDOS\n\n`;
    
    eventosConRetencion.forEach((evento, index) => {
      const deposito = parseFloat(evento.deposito_inicial) || 0;
      mensaje += `${index + 1}. ${evento.id} - ${evento.nombre}\n`;
      mensaje += `   Depósito: $${deposito.toFixed(2)}\n`;
      mensaje += `   Pendiente: $${evento.pendiente.toFixed(2)}\n`;
      
      if (index < eventosConRetencion.length - 1) {
        mensaje += `   ─────\n`;
      }
    });
    
    await ctx.reply(mensaje);
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

bot.command('gastosevento', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length !== 1) {
    await ctx.reply(
      `❌ Formato incorrecto\n\n` +
      `Usa: /gastosevento [ID_EVENTO]\n\n` +
      `Ejemplo: /gastosevento E001\n\n` +
      `ℹ️ Muestra todos los gastos registrados de un evento.`
    );
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
    let mensaje = `📋 GASTOS - ${eventoId} - ${evento.nombre}\n\n`;
    
    gastos.forEach((gasto, index) => {
      totalGastos += gasto.monto;
      const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES');
      mensaje += `${index + 1}. $${gasto.monto.toFixed(2)} - ${gasto.descripcion}\n`;
      mensaje += `   📅 ${fecha}\n`;
      if (index < gastos.length - 1) mensaje += `   ─────\n`;
    });
    
    mensaje += `\n💰 Total gastos: $${totalGastos.toFixed(2)}\n`;
    mensaje += `🎯 Presupuesto total: $${evento.presupuesto_total.toFixed(2)}\n`;
    mensaje += `📊 Neto para repartir: $${(evento.presupuesto_total - totalGastos).toFixed(2)}`;
    
    await ctx.reply(mensaje);
    
  } catch (error) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ========== HANDLER DE MENSAJES DE TEXTO ==========
bot.on('text', async (ctx) => {
  try {
    // Si es un comando, ya se manejó por los handlers específicos
    if (ctx.message.text.startsWith('/')) {
      return;
    }
    
    // Si no hay estado activo, mostrar ayuda
    const sheetsClient = ctx.sheetsClient;
    const userState = await sheetsClient.getState(ctx.chat.id);
    
    if (!userState || !userState.step) {
      // Mensaje no reconocido - mostrar comandos
      await ctx.reply(
        `❓ *No entiendo ese mensaje*\n\n` +
        `📋 *Comandos disponibles:*\n\n` +
        `*📅 Eventos:*\n` +
        `/nuevoevento - Crear evento\n` +
        `/eventos - Ver eventos activos\n` +
        `/completados - Ver completados\n\n` +
        `*💰 Pagos:*\n` +
        `/deposito [ID] [MONTO]\n` +
        `/pagocompleto [ID] [MONTO]\n\n` +
        `*📉 Gastos:*\n` +
        `/gasto [ID] [MONTO] [DESC]\n` +
        `/gastodirecto [MONTO] [DESC]\n` +
        `/gastosevento [ID]\n\n` +
        `*📊 Reportes:*\n` +
        `/balance\n` +
        `/reporte\n` +
        `/retenidos\n\n` +
        `Usa /ayuda para más información`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Si hay estado, pasar a handleMessage
    await handleMessage(ctx);
  } catch (error) {
    console.error('Error en mensaje:', error);
    await ctx.reply('❌ Error procesando mensaje.');
  }
});

// ========== HANDLER PRINCIPAL PARA VERCEL ==========
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

// Manejo de errores
bot.catch((err, ctx) => {
  console.error(`Error:`, err);
});
