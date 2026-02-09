const { initializeSheets } = require('./googleSheets');

// Handler para mensajes de texto (flujo conversacional para /nuevoevento)
async function handleMessage(ctx) {
  const text = ctx.message.text.trim();
  const chatId = ctx.chat.id;
  const username = ctx.from.username || ctx.from.first_name;
  
  const sheetsClient = ctx.sheetsClient;
  const userState = await sheetsClient.getState(chatId);
  
  console.log(`📨 Mensaje: "${text}" - Estado: ${userState?.step || 'sin estado'}`);
  
// Si no hay estado, manejar como comando normal
if (!userState || !userState.step) {
  await ctx.reply(
    `🤔 *Escribe un comando:*\n\n` +
    `*📅 GESTIÓN DE EVENTOS:*\n` +
    `/nuevoevento - Crear nuevo evento\n` +
    `/eventos - Ver eventos activos (con gastos)\n` +
    `/evento [ID] - Ver detalle de evento\n` +
    `/gastosevento [ID] - Ver gastos de evento\n` +
    `/proximos - Ver eventos próximos (7 días)\n\n` +
    `*💰 PAGOS Y DEPÓSITOS:*\n` +
    `/deposito [ID] [MONTO] - Registrar depósito\n` +
    `/pagocompleto [ID] [MONTO] - Completar pago (reparte 65/25/10)\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto [ID] [MONTO] [DESCRIPCIÓN] - Gasto en evento\n` +
    `/gastodirecto [MONTO] [DESCRIPCIÓN] - Gasto general DJ EDY\n\n` +
    `*📊 FINANZAS Y REPORTES:*\n` +
    `/balance - Ver balances de cuentas\n` +
    `/reporte [MES] - Reporte mensual detallado\n` +
    `/retenciones - Ver retenciones del mes\n\n` +
    `*❓ AYUDA:*\n` +
    `/ayuda - Ayuda completa con ejemplos\n` +
    `/comandos - Lista rápida de comandos\n\n` +
    `*📝 EJEMPLOS RÁPIDOS:*\n` +
    `• /deposito E001 500\n` +
    `• /gasto E001 200 transporte\n` +
    `• /gastodirecto 150 publicidad\n` +
    `• /reporte enero`,
    { parse_mode: 'Markdown' }
  );
  return;
}


  // ========== COMANDO /COMANDOS ==========
bot.command('comandos', async (ctx) => {
  await ctx.reply(
    `📋 *LISTA COMPLETA DE COMANDOS*\n\n` +
    `*📅 GESTIÓN DE EVENTOS:*\n` +
    `/nuevoevento - Crear evento nuevo\n` +
    `/eventos - Listar eventos activos\n` +
    `/evento [ID] - Ver detalle de evento\n` +
    `/gastosevento [ID] - Ver gastos de evento\n` +
    `/proximos - Ver eventos próximos\n\n` +
    `*💰 PAGOS Y DEPÓSITOS:*\n` +
    `/deposito [ID] [MONTO] - Registrar depósito\n` +
    `/pagocompleto [ID] [MONTO] - Completar pago (65/25/10)\n\n` +
    `*📉 GASTOS:*\n` +
    `/gasto [ID] [MONTO] [DESCRIPCIÓN] - Gasto en evento\n` +
    `/gastodirecto [MONTO] [DESCRIPCIÓN] - Gasto general DJ EDY\n\n` +
    `*📊 FINANZAS:*\n` +
    `/balance - Ver balances\n` +
    `/reporte [MES] - Reporte mensual\n` +
    `/retenciones - Ver retenciones\n\n` +
    `*❓ AYUDA:*\n` +
    `/ayuda - Ayuda completa\n` +
    `/comandos - Esta lista\n\n` +
    `📝 Usa /ayuda para ver formatos y ejemplos detallados.`,
    { parse_mode: 'Markdown' }
  );
});
  
  
  // Flujo conversacional para /nuevoevento
  await handleNuevoEventoFlow(ctx, text, userState, username);
}

async function handleNuevoEventoFlow(ctx, text, userState, username) {
  const chatId = ctx.chat.id;
  const sheetsClient = ctx.sheetsClient;
  
  switch (userState.step) {
    case 'nuevoevento_nombre':
      // Guardar nombre y pedir cliente
      await sheetsClient.updateState(chatId, {
        step: 'nuevoevento_cliente',
        event: text,
        metadata: userState.metadata
      });
      
      await ctx.reply(
        `✅ Nombre guardado: *${text}*\n\n` +
        `2. Ahora escribe el *nombre del cliente*:\n` +
        `(ej: "María López", "Empresa XYZ", "Juan Pérez")`,
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'nuevoevento_cliente':
      // Guardar cliente y pedir presupuesto
      await sheetsClient.updateState(chatId, {
        step: 'nuevoevento_presupuesto',
        event: userState.event,
        amount: text, // reusamos amount para guardar cliente temporalmente
        metadata: userState.metadata
      });
      
      await ctx.reply(
        `✅ Cliente: *${text}*\n\n` +
        `3. Ahora escribe el *presupuesto total* del evento:\n` +
        `(solo el número, ej: 2000, 1500.50, 3000)`,
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'nuevoevento_presupuesto':
      const presupuesto = parseFloat(text.replace(',', '.'));
      
      if (isNaN(presupuesto) || presupuesto <= 0) {
        await ctx.reply('❌ Presupuesto inválido. Escribe solo el número (ej: 2000, 1500.50)');
        return;
      }
      
      // Guardar presupuesto y pedir depósito inicial
      await sheetsClient.updateState(chatId, {
        step: 'nuevoevento_deposito',
        event: userState.event,
        amount: presupuesto.toString(),
        metadata: { ...userState.metadata, cliente: userState.amount }
      });
      
      await ctx.reply(
        `✅ Presupuesto: *$${presupuesto.toFixed(2)}*\n\n` +
        `4. ¿Hay *depósito inicial*? Escribe el monto:\n` +
        `(si no hay depósito, escribe 0)`,
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'nuevoevento_deposito':
      const deposito = parseFloat(text.replace(',', '.'));
      
      if (isNaN(deposito) || deposito < 0) {
        await ctx.reply('❌ Depósito inválido. Escribe 0 si no hay depósito.');
        return;
      }
      
      if (deposito > parseFloat(userState.amount)) {
        await ctx.reply(`❌ El depósito no puede ser mayor al presupuesto total ($${userState.amount})`);
        return;
      }
      
      // Guardar depósito y pedir fecha del evento
      await sheetsClient.updateState(chatId, {
        step: 'nuevoevento_fecha',
        event: userState.event,
        amount: userState.amount,
        transaction_type: deposito.toString(), // reusamos para guardar depósito
        metadata: { ...userState.metadata, cliente: userState.metadata.cliente }
      });
      
      await ctx.reply(
        `✅ Depósito inicial: *$${deposito.toFixed(2)}*\n\n` +
        `5. Escribe la *fecha del evento*:\n` +
        `(formato: DD-MM-AAAA, ej: 15-03-2024)\n` +
        `(o escribe "no" si no hay fecha definida)`,
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'nuevoevento_fecha':
      let fechaEvento = '';
      
      if (text.toLowerCase() !== 'no') {
        // Validar formato de fecha simple
        const fechaMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (!fechaMatch) {
          await ctx.reply('❌ Formato de fecha incorrecto. Usa DD-MM-AAAA (ej: 15-03-2024)');
          return;
        }
        fechaEvento = text;
      }
      
      // Ahora crear el evento con todos los datos
      try {
        const eventoData = {
          nombre: userState.event,
          cliente: userState.metadata.cliente,
          presupuesto_total: userState.amount,
          deposito_inicial: userState.transaction_type,
          fecha_evento: fechaEvento,
          chat_id: chatId,
          username: username
        };
        
        const evento = await sheetsClient.crearEvento(eventoData);
        
await ctx.reply(
  `🎉 ¡EVENTO CREADO EXITOSAMENTE!\n\n` +
  `📋 ID: ${evento.id}\n` +
  `🏷️ Nombre: ${evento.nombre}\n` +
  `👤 Cliente: ${evento.cliente || 'No especificado'}\n` +
  `💰 Presupuesto: $${evento.presupuesto_total.toFixed(2)}\n` +
  `💵 Depósito inicial: $${evento.deposito_inicial.toFixed(2)}\n` +
  `⏳ Pendiente: $${evento.pendiente.toFixed(2)}\n` +
  `📅 Fecha evento: ${evento.fecha_evento || 'No definida'}\n` +
  `📊 Estado: ${evento.estado}\n\n` +
  `📝 USAR ESTE ID PARA PAGOS:\n` +
  `/deposito ${evento.id} [MONTO]\n` +
  `/pagocompleto ${evento.id} [MONTO]`
);  
        // Limpiar estado
        await sheetsClient.clearState(chatId);
        
      } catch (error) {
        console.error('Error creando evento:', error);
        await ctx.reply(`❌ Error creando evento: ${error.message}`);
        await sheetsClient.clearState(chatId);
      }
      break;
      
    default:
      await ctx.reply('🔄 Flujo desconocido. Escribe /nuevoevento para comenzar.');
      await sheetsClient.clearState(chatId);
  }
}

// Handler para comandos (ya implementado en api/telegram.js)
async function handleCommand(ctx, command, args) {
  // Esta función ya está implementada en api/telegram.js
  // La mantenemos por compatibilidad
  switch (command) {
    case 'balance':
    case 'eventos':
    case 'deposito':
    case 'pagocompleto':
      // Estos comandos ya están manejados directamente
      break;
    default:
      await ctx.reply(`Comando "${command}" no reconocido. Usa /ayuda`);
  }
}

module.exports = {
  handleMessage,
  handleCommand
};
