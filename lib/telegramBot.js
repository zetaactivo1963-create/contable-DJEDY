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
    // PARA INGRESO/GASTO: Esperando cuenta
    case 'waiting_for_account':
      const account = text.toLowerCase();
      const validAccounts = ['personal', 'dj edy', 'ahorro', 'dj edy', 'djedy'];
      
      if (!validAccounts.includes(account)) {
        await ctx.reply('❌ Cuenta no válida. Elige: Personal, DJ EDY o Ahorro');
        return;
      }
      
      // Normalizar nombre de cuenta
      let normalizedAccount = account;
      if (account === 'djedy') normalizedAccount = 'dj edy';
      
      await sheetsClient.updateState(chatId, {
        step: 'waiting_for_event',
        transaction_type: userState.transaction_type,
        account: normalizedAccount,
        event: '',
        amount: '',
        metadata: { username }
      });
      
      await ctx.reply(`📝 ¿Para qué es este ${userState.transaction_type}? (ej: "boda María", "salario", "compra equipo")`);
      break;
      
    // PARA INGRESO/GASTO: Esperando evento
    case 'waiting_for_event':
      await sheetsClient.updateState(chatId, {
        step: 'waiting_for_amount',
        transaction_type: userState.transaction_type,
        account: userState.account,
        event: text,
        amount: '',
        metadata: { username }
      });
      
      const amountQuestion = userState.transaction_type === 'gasto' 
        ? `💸 ¿Cuánto gastaste en "${text}"?` 
        : `💰 ¿Cuánto ingresó por "${text}"?`;
      
      await ctx.reply(amountQuestion);
      break;
      
    // PARA INGRESO/GASTO: Esperando monto
    case 'waiting_for_amount':
      const amount = parseFloat(text.replace(',', '.'));
      
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Monto inválido. Ejemplos: 120, 50.5, 1000');
        return;
      }
      
      // Calcular retención si es ingreso DJ EDY
      let retencion = 0;
      if (userState.transaction_type === 'ingreso' && userState.account === 'dj edy') {
        retencion = amount * 0.10; // 10% retención
      }
      
      // Registrar transacción
      await registerTransaction(ctx, {
        type: userState.transaction_type,
        account: userState.account,
        description: userState.event,
        amount: amount.toString(),
        retencion: retencion
      }, username);
      
      // Limpiar estado
      await sheetsClient.clearState(chatId);
      break;
      
    // PARA TRANSFERENCIA: Esperando cuentas "desde-hacia"
    case 'waiting_for_account_from':
      const parts = text.toLowerCase().split(' a ');
      if (parts.length !== 2) {
        await ctx.reply('❌ Formato incorrecto. Ejemplo: "personal a ahorro"');
        return;
      }
      
      await sheetsClient.updateState(chatId, {
        step: 'waiting_for_transfer_amount',
        transaction_type: 'transferencia',
        account_from: parts[0].trim(),
        account_to: parts[1].trim(),
        amount: '',
        metadata: { username }
      });
      
      await ctx.reply(`💵 ¿Cuánto quieres transferir de ${parts[0]} a ${parts[1]}?`);
      break;
      
    // PARA TRANSFERENCIA: Esperando monto
    case 'waiting_for_transfer_amount':
      const transferAmount = parseFloat(text.replace(',', '.'));
      
      if (isNaN(transferAmount) || transferAmount <= 0) {
        await ctx.reply('❌ Monto inválido');
        return;
      }
      
      // Registrar transferencia (dos transacciones: gasto desde, ingreso hacia)
      await registerTransaction(ctx, {
        type: 'gasto',
        account: userState.account_from,
        description: `Transferencia a ${userState.account_to}`,
        amount: transferAmount.toString(),
        retencion: 0
      }, username);
      
      await registerTransaction(ctx, {
        type: 'ingreso',
        account: userState.account_to,
        description: `Transferencia de ${userState.account_from}`,
        amount: transferAmount.toString(),
        retencion: 0
      }, username);
      
      await ctx.reply(
        `✅ *Transferencia completada*\n\n` +
        `🔄 $${transferAmount.toFixed(2)} transferidos\n` +
        `📤 De: ${userState.account_from}\n` +
        `📥 A: ${userState.account_to}`,
        { parse_mode: 'Markdown' }
      );
      
      await sheetsClient.clearState(chatId);
      break;
      
    default:
      await ctx.reply('🔄 Reiniciando... Escribe "ingreso", "gasto" o "transferencia"');
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
      event: parsedData.description || parsedData.event,
      amount: parsedData.amount,
      notes: parsedData.notes || '',
      cuenta: parsedData.account || 'Personal',  // NUEVO
      retencion: parsedData.retencion || 0  // NUEVO
    });
    
    // Determinar mensaje según tipo y cuenta
    let emoji, message, details = '';
    
    switch (parsedData.type) {
      case 'ingreso':
        emoji = '💰';
        message = `Ingreso registrado en ${parsedData.account}`;
        if (parsedData.account === 'dj edy' && parsedData.retencion > 0) {
          details = `\n📊 *Retención 10%:* $${parsedData.retencion.toFixed(2)} para fondos DJ EDY`;
        }
        break;
      case 'gasto':
        emoji = '💸';
        message = `Gasto registrado de ${parsedData.account}`;
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
      `*Cuenta:* ${parsedData.account}\n` +
      `*Monto:* $${parseFloat(parsedData.amount).toFixed(2)}\n` +
      `*Descripción:* ${parsedData.description || parsedData.event}\n` +
      `${details}\n` +
      `*Fecha:* ${new Date().toLocaleDateString('es-ES')}\n\n` +
      `✅ Guardado en Google Sheets`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error registrando transacción:', error);
    await ctx.reply('❌ Error guardando la transacción. Intenta de nuevo.');
  }
}

module.exports = {
  handleMessage,
  registerTransaction
};
