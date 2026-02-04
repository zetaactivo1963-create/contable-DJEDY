function parseMessage(text) {
  const normalized = text.toLowerCase().trim();
  
  // Patrones de regex para extraer información
  const patterns = [
    // "depósito 500 boda María" o "deposito 500 boda maria"
    /^(depósito|deposito|ingreso|ingreso)\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i,
    
    // "gasto 120 supermercado"
    /^(gasto|pago|compra)\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i,
    
    // "transferencia 200 a ahorros"
    /^(transferencia|mover|enviar)\s+(\d+(?:[.,]\d+)?)\s+(?:a\s+)?(.+)$/i,
    
    // "500 boda María" (asume ingreso por defecto)
    /^(\d+(?:[.,]\d+)?)\s+(.+)$/
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      let type = 'ingreso'; // por defecto
      let amount, event;
      
      if (pattern === patterns[0]) {
        // depósito X Y
        type = 'ingreso';
        amount = match[2];
        event = match[3];
      } else if (pattern === patterns[1]) {
        // gasto X Y
        type = 'gasto';
        amount = match[2];
        event = match[3];
      } else if (pattern === patterns[2]) {
        // transferencia X a Y
        type = 'transferencia';
        amount = match[2];
        event = match[3];
      } else if (pattern === patterns[3]) {
        // X Y (asume ingreso)
        type = 'ingreso';
        amount = match[1];
        event = match[2];
      }
      
      // Normalizar el monto (reemplazar coma por punto)
      amount = amount.replace(',', '.');
      
      return {
        type,
        amount,
        event: event.trim(),
        originalText: text,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  // Si no coincide con ningún patrón completo
  const singleWord = normalized.split(/\s+/)[0];
  
  if (['depósito', 'deposito', 'ingreso', 'ingreso'].includes(singleWord)) {
    return { type: 'ingreso', step: 'start' };
  }
  
  if (['gasto', 'pago', 'compra'].includes(singleWord)) {
    return { type: 'gasto', step: 'start' };
  }
  
  if (['transferencia', 'mover', 'enviar'].includes(singleWord)) {
    return { type: 'transferencia', step: 'start' };
  }
  
  // Si es solo un número, podría ser un monto
  const numberMatch = normalized.match(/^(\d+(?:[.,]\d+)?)$/);
  if (numberMatch) {
    return { amount: numberMatch[1].replace(',', '.'), step: 'amount_only' };
  }
  
  // Si es texto sin números, podría ser un evento
  return { event: text, step: 'event_only' };
}

function isCompleteTransaction(parsedData) {
  return parsedData.type && parsedData.amount && parsedData.event && !parsedData.step;
}

module.exports = {
  parseMessage,
  isCompleteTransaction
};
