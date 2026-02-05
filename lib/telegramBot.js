const { parseMessage, isCompleteTransaction } = require('./stateMachine');

async function handleMessage(ctx) {
  const text = ctx.message.text.trim();
  const chatId = ctx.chat.id;
  const username = ctx.from.username || ctx.from.first_name;

  console.log(`📝 Procesando mensaje: "${text}" de ${username}`);

  const sheetsClient = ctx.sheetsClient;
  let userState = await sheetsClient.getState(chatId);

  const parsed = parseMessage(text);
  
  if (isCompleteTransaction(parsed)) {
    await registerTransaction(ctx, parsed, username);
    if (userState && userState.step) {
      await sheetsClient.clearState(chatId);
    }
    return;
  }

  await handleStateMachine(ctx, text, userState, username);
}

async function handleStateMachine(ctx, text, userState, username) {
  const chatId = ctx.chat.id;
  const sheetsClient = ctx.sheetsClient;
  
  const normalizedText = text.toLowerCase().trim();
  
  // PASO 1: Detectar tipo de transacción
  if (['depósito', 'deposito', 'ingreso', 'ingreso'].includes(normalizedText)) {
    await sheetsClient.updateState(chatId, {
      step: 'waiting_for_account',
      transaction_type: 'ingreso',
      account: '',
      event: '',
      amount: '',
      metadata: { username }
    });
    await ctx.reply('💰 *¿Es ingreso para qué cuenta?*\n\n• Personal\n• DJ EDY\n• Ahorro', { parse_mode: 'Markdown' });
    
  } else if (['gasto', 'pago', 'compra'].includes(normalizedText)) {
    await sheetsClient.updateState(chatId, {
      step: 'waiting_for_account',
      transaction_type: 'gasto',
      account: '',
      event: '',
      amount: '',
      metadata: { username }
    });
    await ctx.reply('💸 *¿Es gasto de qué cuenta?*\n\n• Personal\n• DJ EDY\n• Ahorro', { parse_mode: 'Markdown' });
    
  } else if (['transferencia', 'mover', 'enviar'].includes(normalizedText)) {
    await sheetsClient.updateState(chatId, {
      step: 'waiting_for_account_from',
      transaction_type: 'transferencia',
      account_from: '',
      account_to: '',
      amount: '',
      metadata: { username }
    });
    await ctx.reply('🔄 *¿Transferir de qué cuenta a qué cuenta?*\n\nEjemplo: "personal a ahorro"');
    
  } else if (userState && userState.step) {
    // Continuar con el flujo basado en el paso actual
    await continueFlow(ctx, text, userState, username);
    
  } else {
    await ctx.reply(
      `🤔 *Comandos disponibles:*\n\n` +
      `• *Ingreso*: "ingreso" (te guiaré paso a paso)\n` +
      `• *Gasto*: "gasto" (te guiaré paso a paso)\n` +
      `• *Transferencia*: "transferencia" (te guiaré)\n\n` +
      `• *O completo*: "ingreso 1000 boda maria"\n` +
      `• *Balance*: "/balance" (próximamente)`,
      { parse_mode: 'Markdown' }
    );
  }
}

async function continueFlow(ctx, text, userState, username) {
  const chatId = ctx.chat.id;
  const sheetsClient = ctx.sheetsClient;
  
  switch (userState.step) {
case 'waiting_for_event':
  // Guardar el evento y pedir el monto
  await sheetsClient.updateState(chatId, {
    step: 'waiting_for_amount',
    transaction_type: userState.transaction_type,
    event: text,
    amount: '',
    metadata: { username }
  });
  
  // Determinar pregunta según tipo
  let question = '';
  switch(userState.transaction_type) {
    case 'gasto':
      question = '💸 ¿Cuánto gastaste en ' + text + '?';
      break;
    case 'ingreso':
      question = '💰 ¿Cuánto ingresó por ' + text + '?';
      break;
    case 'transferencia':
      question = '🔄 ¿Cuánto quieres transferir a ' + text + '?';
      break;
    default:
      question = '📝 ¿Cuál es el monto?';
  }
  
  await ctx.reply(question);
  break;
      
      const amountQuestion = userState.transaction_type === 'gasto' 
        ? '💸 ¿Cuánto gastaste?' 
        : userState.transaction_type === 'ingreso'
        ? '💰 ¿Cuánto ingresó?'
        : '💳 ¿Cuánto quieres transferir?';
      
      await ctx.reply(amountQuestion);
      break;
      
    case 'waiting_for_amount':
      const amount = parseFloat(text.replace(',', '.'));
      
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Por favor, escribe un monto válido (ej: 120, 50.5, 1000)');
        return;
      }
      
      await registerTransaction(ctx, {
        type: userState.transaction_type,
        amount: amount.toString(),
        event: userState.event
      }, username);
      
      await sheetsClient.clearState(chatId);
      break;
      
    default:
      await ctx.reply('🔄 Reiniciando... Escribe "gasto", "depósito" o "transferencia" para comenzar.');
      await sheetsClient.clearState(chatId);
  }
}

async function registerTransaction(ctx, parsedData, username) {
  const chatId = ctx.chat.id;
  const sheetsClient = ctx.sheetsClient;
  
  try {
    const transaction = await sheetsClient.addTransaction({
      chat_id: chatId,
      username: username,
      transaction_type: parsedData.type,
      event: parsedData.event,
      amount: parsedData.amount,
      notes: parsedData.notes || ''
    });
    
    let emoji, message;
    switch (parsedData.type) {
      case 'ingreso':
        emoji = '💰';
        message = `Ingreso registrado`;
        break;
      case 'gasto':
        emoji = '💸';
        message = `Gasto registrado`;
        break;
      case 'transferencia':
        emoji = '🔄';
        message = `Transferencia registrada`;
        break;
      default:
        emoji = '📝';
        message = `Transacción registrada`;
    }
    
    await ctx.reply(
      `${emoji} *${message}*\n\n` +
      `*Tipo:* ${parsedData.type}\n` +
      `*Monto:* $${parseFloat(parsedData.amount).toFixed(2)}\n` +  // ← $ 
      `*Evento:* ${parsedData.event}\n` +
      `*Fecha:* ${new Date().toLocaleDateString('es-ES')}\n\n` +
      `✅ Guardado en tu hoja de cálculo`,
      { parse_mode: 'Markdown' }
    );
    
const recentTransactions = await sheetsClient.getTransactions(chatId, 3);
if (recentTransactions.length > 0) {
  let summary = `\n*Últimas transacciones:*\n`;
  recentTransactions.forEach(t => {
    const sign = t.transaction_type === 'gasto' ? '-' : '+';
    // Asegurar que t.amount y t.event existan
    const amount = t.amount ? parseFloat(t.amount).toFixed(2) : '0.00';
    const event = t.event || 'Sin descripción';
    summary += `${sign}$${amount} - ${event}\n`;
  });
  await ctx.reply(summary, { parse_mode: 'Markdown' });
}
    
  } catch (error) {
    console.error('Error registrando transacción:', error);
    await ctx.reply('❌ Error guardando la transacción. Intenta de nuevo.');
  }
}

module.exports = {
  handleMessage,
  registerTransaction
};
