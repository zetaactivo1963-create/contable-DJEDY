const { initializeSheets } = require('./googleSheets');

async function handleMessage(ctx) {
  try {
    const sheetsClient = ctx.sheetsClient;
    const chatId = ctx.chat.id;
    
    // Obtener estado actual
    const userState = await sheetsClient.getState(chatId);
    
    // Si no hay estado, mostrar menú SIMPLE SIN BOTONES
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
        `❓ /ayuda - Ayuda completa`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // [MANTÉN EL RESTO DE TU CÓDIGO IGUAL...]
    // ... tu flujo de nuevo evento ...
    
  } catch (error) {
    console.error('❌ Error en handleMessage:', error);
    await ctx.reply('❌ Error procesando mensaje.');
  }
}

module.exports = { handleMessage };
