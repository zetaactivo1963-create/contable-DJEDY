const { initializeSheets } = require('./googleSheets');

// Handler para mensajes de texto (flujo conversacional para /nuevoevento)
async function handleMessage(ctx) {
  try {
    const sheetsClient = ctx.sheetsClient;
    const chatId = ctx.chat.id;
    
    // Obtener estado actual
    const userState = await sheetsClient.getState(chatId);
    
    // Si no hay estado, mostrar menú simple
    if (!userState || !userState.step) {
      // NO mostrar nada aquí - ya telegram.js maneja esto
      return;
    }

    // Si hay estado, manejar flujo conversacional
    const text = ctx.message.text;
    const username = ctx.from.username || ctx.from.first_name;
    
    // Solo manejar flujo de nuevo evento
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
            `🎉 *¡EVENTO CREADO EXITOSAMENTE!*\n\n` +
            `📋 *ID:* ${evento.id}\n` +
            `🏷️ *Nombre:* ${evento.nombre}\n` +
            `👤 *Cliente:* ${evento.cliente || 'No especificado'}\n` +
            `💰 *Presupuesto:* $${evento.presupuesto_total.toFixed(2)}\n` +
            `💵 *Depósito inicial:* $${evento.deposito_inicial.toFixed(2)}\n` +
            `⏳ *Pendiente:* $${evento.pendiente.toFixed(2)}\n` +
            `📅 *Fecha evento:* ${evento.fecha_evento || 'No definida'}\n` +
            `📊 *Estado:* ${evento.estado}\n\n` +
            `📝 *USAR ESTE ID PARA PAGOS:*\n` +
            `/deposito ${evento.id} [MONTO]\n` +
            `/pagocompleto ${evento.id} [MONTO]`,
            { parse_mode: 'Markdown' }
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
    
  } catch (error) {
    console.error('❌ Error en handleMessage:', error);
    
    // Mensajes de error más amigables
    let mensajeError = '❌ Error procesando mensaje. ';
    
    if (error.message.includes('Google Sheets') || error.message.includes('conexión')) {
      mensajeError += 'Error de conexión con Google Sheets. Intenta más tarde.';
    } else if (error.message.includes('no encontrado')) {
      mensajeError += 'Evento no encontrado. Verifica el ID.';
    } else {
      mensajeError += error.message || 'Error desconocido.';
    }
    
    await ctx.reply(mensajeError);
    
    // Limpiar estado en caso de error
    try {
      if (ctx.chat && ctx.chat.id) {
        const sheetsClient = ctx.sheetsClient;
        await sheetsClient.clearState(ctx.chat.id);
      }
    } catch (clearError) {
      console.error('Error limpiando estado:', clearError);
    }
  }
}

// Handler para comandos (ya implementado en telegram.js)
async function handleCommand(ctx, command, args) {
  // Esta función ya está implementada en telegram.js
  // Solo la mantenemos por compatibilidad
  console.log(`Comando ${command} recibido en telegramBot.js`);
  
  switch (command) {
    case 'balance':
    case 'eventos':
    case 'deposito':
    case 'pagocompleto':
      // Estos comandos ya están manejados directamente en telegram.js
      break;
    default:
      await ctx.reply(`Comando "${command}" no reconocido. Usa /ayuda`);
  }
}

module.exports = {
  handleMessage,
  handleCommand
};
