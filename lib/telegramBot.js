const { initializeSheets } = require('./googleSheets');

async function handleMessage(ctx) {
  try {
    const sheetsClient = ctx.sheetsClient;
    const chatId = ctx.chat.id;
    
    // Obtener estado actual
    const userState = await sheetsClient.getState(chatId);
    
    // Si no hay estado, mostrar menú simple
    if (!userState || !userState.step) {
      await ctx.reply(
        `🤔 *Escribe un comando:*\n\n` +
        `📅 /nuevoevento - Crear evento\n` +
        `📋 /eventos - Ver eventos\n` +
        `💰 /deposito [ID] [MONTO]\n` +
        `✅ /pagocompleto [ID] [MONTO]\n` +
        `📉 /gasto [ID] [MONTO] [DESC]\n` +
        `🏢 /gastodirecto [MONTO] [DESC]\n` +
        `📊 /balance - Ver balances\n` +
        `📈 /reporte - Reporte mensual\n` +
        `❓ /ayuda - Ayuda completa\n` +
        `📋 /comandos - Lista de comandos`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Si hay estado, manejar flujo conversacional
    const text = ctx.message.text;
    const username = ctx.from.username || ctx.from.first_name;
    
    // Solo manejar flujo de nuevo evento por ahora
    switch (userState.step) {
      case 'nuevoevento_nombre':
        await sheetsClient.updateState(chatId, {
          step: 'nuevoevento_cliente',
          event: text,
          metadata: userState.metadata
        });
        await ctx.reply(`✅ Nombre: "${text}"\n\nAhora escribe el cliente:`);
        break;
        
      case 'nuevoevento_cliente':
        await sheetsClient.updateState(chatId, {
          step: 'nuevoevento_presupuesto',
          event: userState.event,
          amount: text,
          metadata: userState.metadata
        });
        await ctx.reply(`✅ Cliente: "${text}"\n\nAhora escribe el presupuesto total:`);
        break;
        
      case 'nuevoevento_presupuesto':
        const presupuesto = parseFloat(text.replace(',', '.'));
        if (isNaN(presupuesto) || presupuesto <= 0) {
          await ctx.reply('❌ Presupuesto inválido. Escribe un número:');
          return;
        }
        await sheetsClient.updateState(chatId, {
          step: 'nuevoevento_deposito',
          event: userState.event,
          amount: presupuesto.toString(),
          metadata: { ...userState.metadata, cliente: userState.amount }
        });
        await ctx.reply(`✅ Presupuesto: $${presupuesto}\n\n¿Depósito inicial? (0 si no hay):`);
        break;
        
      case 'nuevoevento_deposito':
        const deposito = parseFloat(text.replace(',', '.'));
        if (isNaN(deposito) || deposito < 0) {
          await ctx.reply('❌ Monto inválido. Escribe 0 si no hay:');
          return;
        }
        
        // Crear evento
        const eventoData = {
          nombre: userState.event,
          cliente: userState.metadata.cliente,
          presupuesto_total: userState.amount,
          deposito_inicial: deposito,
          chat_id: chatId,
          username: username
        };
        
        try {
          const evento = await sheetsClient.crearEvento(eventoData);
          await sheetsClient.clearState(chatId);
          
          await ctx.reply(
            `🎉 ¡EVENTO CREADO!\n\n` +
            `ID: ${evento.id}\n` +
            `Nombre: ${evento.nombre}\n` +
            `Presupuesto: $${evento.presupuesto_total}\n` +
            `Depósito: $${evento.deposito_inicial}\n\n` +
            `Usa: /deposito ${evento.id} [MONTO]`
          );
        } catch (error) {
          console.error('Error:', error);
          await ctx.reply(`❌ Error: ${error.message}`);
          await sheetsClient.clearState(chatId);
        }
        break;
        
      default:
        await sheetsClient.clearState(chatId);
        await ctx.reply('Estado desconocido. Usa /nuevoevento para comenzar.');
    }
    
  } catch (error) {
    console.error('❌ Error en handleMessage:', error);
    await ctx.reply('❌ Error procesando mensaje. Usa /ayuda para ver comandos.');
  }
}

async function handleCommand(ctx, command, args) {
  // Esta función se maneja en telegram.js
  console.log(`Comando ${command} recibido en telegramBot.js`);
}

module.exports = {
  handleMessage,
  handleCommand
};
