const { google } = require('googleapis');

class GoogleSheetsService {
  constructor() {
    this.sheetId = process.env.GOOGLE_SHEET_ID;
    this.auth = null;
    this.sheets = null;
  }

  async initialize() {
    try {
      // Configurar autenticación con Service Account
      const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
      if (!credentialsBase64) {
        throw new Error('GOOGLE_CREDENTIALS_BASE64 no está definida');
      }
      
      // Decodificar Base64 a JSON
      const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
      const credentials = JSON.parse(credentialsJson);
      
      this.auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const authClient = await this.auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: authClient });

      // Verificar/crear estructura
      await this.ensureSheetsExist();
      
      console.log('✅ Google Sheets Service inicializado para DJ EDY');
      return this;
    } catch (error) {
      console.error('❌ Error inicializando Google Sheets:', error.message);
      throw error;
    }
  }

  async ensureSheetsExist() {
    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId,
      });

      const existingSheets = spreadsheet.data.sheets.map(sheet => sheet.properties.title);
      const requiredSheets = ['eventos', 'pagos_eventos', 'transacciones', 'balance_cuentas', 'state'];
      
      for (const sheetName of requiredSheets) {
        if (!existingSheets.includes(sheetName)) {
          await this.createSheet(sheetName);
          console.log(`✅ Sheet creada: ${sheetName}`);
        }
      }
      
      // Configurar headers de cada sheet
      await this.setupSheetHeaders();
      
    } catch (error) {
      console.error('Error verificando sheets:', error);
      throw error;
    }
  }

  async createSheet(sheetName) {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      resource: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName,
              gridProperties: { rowCount: 1000, columnCount: 20 }
            }
          }
        }]
      }
    });
  }

  async setupSheetHeaders() {
    const headers = {
      'eventos': ['id', 'nombre', 'cliente', 'presupuesto_total', 'deposito_inicial', 'pagado_total', 'pendiente', 'estado', 'fecha_evento', 'fecha_creacion', 'notas', 'gastos_totales'],
      'pagos_eventos': ['id', 'evento_id', 'tipo', 'monto', 'fecha', 'reparticion_hecha', 'repartido_personal', 'repartido_ahorro', 'repartido_empresa', 'notas'],
      'transacciones': ['id', 'fecha', 'tipo', 'cuenta', 'monto', 'descripcion', 'evento_id', 'categoria'],
      'balance_cuentas': ['cuenta', 'balance_actual', 'balance_pendiente', 'ultima_actualizacion'],
      'state': ['chat_id', 'step', 'transaction_type', 'event', 'amount', 'timestamp', 'metadata']
    };

    for (const [sheetName, headerRow] of Object.entries(headers)) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `${sheetName}!A1:${String.fromCharCode(65 + headerRow.length - 1)}1`,
        valueInputOption: 'RAW',
        resource: { values: [headerRow] },
      });
    }

    // Inicializar balances si no existen
    await this.initializeBalances();
  }

  async initializeBalances() {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'balance_cuentas!A2:D',
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      const initialBalances = [
        ['Personal', '0', '0', new Date().toISOString()],
        ['DJ EDY', '0', '0', new Date().toISOString()],
        ['Ahorros', '0', '0', new Date().toISOString()]
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: 'balance_cuentas!A2:D4',
        valueInputOption: 'RAW',
        resource: { values: initialBalances },
      });
    }
  }

  // ========== GESTIÓN DE EVENTOS ==========

  async crearEvento(eventoData) {
      console.log('🔍 DEBUG crearEvento - Datos recibidos:', eventoData);
  console.log('🔍 DEBUG - Tipo presupuesto:', typeof eventoData.presupuesto_total, 'valor:', eventoData.presupuesto_total);
    try {
      // Generar ID único
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'eventos!A2:A',
      });

      const rows = response.data.values || [];
      const nextId = `E${String(rows.length + 1).padStart(3, '0')}`;

      const evento = {
        id: nextId,
        nombre: eventoData.nombre,
        cliente: eventoData.cliente || '',
        presupuesto_total: parseFloat(eventoData.presupuesto_total),
        deposito_inicial: parseFloat(eventoData.deposito_inicial) || 0,
        pagado_total: parseFloat(eventoData.deposito_inicial) || 0,
        pendiente: parseFloat(eventoData.presupuesto_total) - (parseFloat(eventoData.deposito_inicial) || 0),
        estado: 'en_proceso',
        fecha_evento: eventoData.fecha_evento || '',
        fecha_creacion: new Date().toISOString(),
        notas: eventoData.notas || '',
        gastos_totales: 0
      };

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'eventos!A:L',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [Object.values(evento)] },
      });

      // Registrar depósito inicial si existe
      //if (eventoData.deposito_inicial && eventoData.deposito_inicial > 0) {
      //  await this.registrarDeposito(nextId, eventoData.deposito_inicial, eventoData.chat_id, eventoData.username);
      //}

      // Registrar solo el pago en pagos_eventos (sin actualizar pagado_total otra vez)
if (eventoData.deposito_inicial && parseFloat(eventoData.deposito_inicial) > 0) {
  const depositoNum = parseFloat(eventoData.deposito_inicial);
  
  // Registrar en pagos_eventos
  const pagoId = `P${Date.now()}`;
  const pago = {
    id: pagoId,
    evento_id: nextId,
    tipo: 'deposito',
    monto: depositoNum,
    fecha: new Date().toISOString(),
    reparticion_hecha: 'NO',
    repartido_personal: 0,
    repartido_ahorro: 0,
    repartido_empresa: 0,
    notas: `Depósito inicial`
  };

  await this.sheets.spreadsheets.values.append({
    spreadsheetId: this.sheetId,
    range: 'pagos_eventos!A:J',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [Object.values(pago)] },
  });

  // Actualizar balance pendiente
  await this.actualizarBalance('DJ EDY', depositoNum, true);
  
  console.log(`✅ Depósito inicial registrado: ${nextId} - $${depositoNum}`);
}

      console.log(`✅ Evento creado: ${nextId} - ${evento.nombre}`);
      return evento;

    } catch (error) {
      console.error('Error creando evento:', error);
      throw error;
    }
  }

async registrarDeposito(eventoId, monto, chatId, username) {
  try {
    console.log('🔍 DEBUG registrarDeposito INICIO para:', eventoId);
    
    // 1. Obtener evento
    const evento = await this.getEventoById(eventoId);
    console.log('🔍 DEBUG evento actual:', {
      id: evento.id,
      presupuesto: evento.presupuesto_total,
      pagado_actual: evento.pagado_total,
      pendiente_actual: evento.pendiente,
      deposito_inicial: evento.deposito_inicial
    });
    
    // 2. Asegurar que son números
    const presupuestoNum = parseFloat(evento.presupuesto_total) || 0;
    const pagadoActualNum = parseFloat(evento.pagado_total) || 0;
    const pendienteActualNum = parseFloat(evento.pendiente) || 0;
    const montoNum = parseFloat(monto) || 0;
    
    console.log('🔍 DEBUG valores numéricos:', {
      presupuestoNum,
      pagadoActualNum,
      pendienteActualNum,
      montoNum
    });
    
    // 3. Calcular NUEVOS valores CORRECTOS
    const nuevoPagadoTotal = pagadoActualNum + montoNum;
    const nuevoPendiente = presupuestoNum - nuevoPagadoTotal;
    
    console.log('🔍 DEBUG nuevos cálculos:', {
      nuevoPagadoTotal,
      nuevoPendiente,
      formula: `${presupuestoNum} - ${nuevoPagadoTotal} = ${nuevoPendiente}`
    });
    
    // 4. Encontrar fila del evento
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'eventos!A:K',
    });

    const rows = response.data.values || [];
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === eventoId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex > 0) {
      // 5. Estado SIEMPRE 'en_proceso' para depósitos
      const nuevoEstado = 'en_proceso';
      
      console.log('🔍 DEBUG actualizando Google Sheets:', {
        rowIndex,
        range: `eventos!F${rowIndex}:H${rowIndex}`,
        valores: [nuevoPagadoTotal, nuevoPendiente, nuevoEstado],
        columnas: ['F=pagado_total', 'G=pendiente', 'H=estado']
      });
      
      // 6. Actualizar SOLO las 3 columnas
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `eventos!F${rowIndex}:H${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: { 
          values: [[
            nuevoPagadoTotal.toString(),
            nuevoPendiente.toString(),
            nuevoEstado
          ]] 
        },
      });
  
  console.log(`✅ Evento ${eventoId} actualizado: pagado=$${nuevoPagadoTotal}, pendiente=$${nuevoPendiente}`);
}

      // Registrar pago en pagos_eventos
      const pagoId = `P${Date.now()}`;
      const pago = {
        id: pagoId,
        evento_id: eventoId,
        tipo: 'deposito',
        monto: monto,
        fecha: new Date().toISOString(),
        reparticion_hecha: 'NO',
        repartido_personal: 0,
        repartido_ahorro: 0,
        repartido_empresa: 0,
        notas: `Depósito registrado por ${username}`
      };

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'pagos_eventos!A:J',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [Object.values(pago)] },
      });

      // Registrar transacción
      await this.registrarTransaccion({
        tipo: 'ingreso',
        cuenta: 'DJ EDY',
        monto: monto,
        descripcion: `Depósito evento ${eventoId}: ${evento.nombre}`,
        evento_id: eventoId,
        categoria: 'deposito'
      }, chatId, username);

      // Actualizar balance DJ EDY (pendiente)
      await this.actualizarBalance('DJ EDY', monto, true);

            console.log(`✅ Depósito registrado: ${eventoId} - $${monto}`);
      return {
        eventoNombre: evento.nombre,
        presupuestoTotal: evento.presupuesto_total,
        totalPagado: nuevoPagadoTotal,
        pendiente: nuevoPendiente
      };

    } catch (error) {
      console.error('❌ Error en registrarDeposito:', error);
      throw error;
    }
  }

  async registrarPagoCompleto(eventoId, monto, chatId, username) {
    try {
      // Registrar pago final
      const evento = await this.getEventoById(eventoId);
      if (!evento) {
        throw new Error(`Evento ${eventoId} no encontrado`);
      }

      // Calcular repartición del PRESUPUESTO TOTAL
// Obtener gastos del evento
const gastosTotales = parseFloat(evento.gastos_totales) || 0;
const netoParaRepartir = evento.presupuesto_total - gastosTotales;

console.log('🔍 DEBUG repartición con gastos:', {
  presupuestoTotal: evento.presupuesto_total,
  gastosTotales: gastosTotales,
  netoParaRepartir: netoParaRepartir
});

// Calcular repartición del NETO (presupuesto - gastos)
const reparticion = {
  personal: netoParaRepartir * 0.65,
  ahorro: netoParaRepartir * 0.25,
  empresa: netoParaRepartir * 0.10
};

      // Registrar pago final en pagos_eventos
      const pagoId = `P${Date.now()}`;
      const pago = {
        id: pagoId,
        evento_id: eventoId,
        tipo: 'pago_final',
        monto: monto,
        fecha: new Date().toISOString(),
        reparticion_hecha: 'SÍ',
        repartido_personal: reparticion.personal,
        repartido_ahorro: reparticion.ahorro,
        repartido_empresa: reparticion.empresa,
        notas: `Pago completo registrado por ${username}`
      };

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'pagos_eventos!A:J',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [Object.values(pago)] },
      });

      // Actualizar pagado_total y pendiente en el evento
      const nuevoPagadoTotal = parseFloat(evento.pagado_total) + parseFloat(monto);
      const nuevoPendiente = 0;

      // Encontrar y actualizar la fila del evento
      const eventosResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'eventos!A:K',
      });

      const eventosRows = eventosResponse.data.values || [];
      let eventoRowIndex = -1;

      for (let i = 1; i < eventosRows.length; i++) {
        if (eventosRows[i][0] === eventoId) {
          eventoRowIndex = i + 1;
          break;
        }
      }

      if (eventoRowIndex > 0) {
        // Actualizar pagado_total (columna F) y pendiente (columna G)
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: `eventos!F${eventoRowIndex}:G${eventoRowIndex}`,
          valueInputOption: 'USER_ENTERED',
          resource: { 
            values: [[
              nuevoPagadoTotal.toString(),
              nuevoPendiente.toString()
            ]] 
          },
        });
        
        console.log(`✅ Evento ${eventoId} actualizado: pagado_total=$${nuevoPagadoTotal}, pendiente=$${nuevoPendiente}`);
      }

      // Cambiar estado a completado
      await this.actualizarEventoEstado(eventoId, 'completado');

      // Registrar transacciones de repartición
      // 1. DJ EDY Personal recibe 65%
      await this.registrarTransaccion({
        tipo: 'ingreso',
        cuenta: 'Personal',
        monto: reparticion.personal,
        descripcion: `Pago evento ${eventoId}: ${evento.nombre} (65%)`,
        evento_id: eventoId,
        categoria: 'ingreso_evento'
      }, chatId, username);

      // 2. Ahorros recibe 25%
      await this.registrarTransaccion({
        tipo: 'ingreso',
        cuenta: 'Ahorros',
        monto: reparticion.ahorro,
        descripcion: `Pago evento ${eventoId}: ${evento.nombre} (25%)`,
        evento_id: eventoId,
        categoria: 'ahorro_evento'
      }, chatId, username);

      // 3. DJ EDY Empresa recibe 10%
      await this.registrarTransaccion({
        tipo: 'ingreso',
        cuenta: 'DJ EDY',
        monto: reparticion.empresa,
        descripcion: `Fondo evento ${eventoId}: ${evento.nombre} (10%)`,
        evento_id: eventoId,
        categoria: 'fondo_empresa'
      }, chatId, username);

      // Actualizar balances
      // NOTA: El depósito ya estaba en balance_pendiente de DJ EDY
      // Ahora sumamos el saldo final también a pendiente
      await this.actualizarBalance('DJ EDY', monto, true);
      
      // Luego restamos el TOTAL repartido (presupuesto_total) de pendiente
      await this.actualizarBalance('DJ EDY', -evento.presupuesto_total, true);
      
      // Finalmente sumamos la parte que queda en DJ EDY (10%)
      await this.actualizarBalance('DJ EDY', reparticion.empresa, false);
      
      // Actualizar otras cuentas
      await this.actualizarBalance('Personal', reparticion.personal, false);
      await this.actualizarBalance('Ahorros', reparticion.ahorro, false);

      console.log(`✅ Pago completo registrado: ${eventoId} - Repartido $${evento.presupuesto_total}`);
      return {
        eventoNombre: evento.nombre,
        presupuestoTotal: evento.presupuesto_total,
        reparticion: reparticion
      };

    } catch (error) {
      console.error('Error registrando pago completo:', error);
      throw error;
    }
  }

  
async getEventoById(eventoId) {
  const response = await this.sheets.spreadsheets.values.get({
    spreadsheetId: this.sheetId,
    range: 'eventos!A:L', // <-- CAMBIAR de A:K a A:L
  });

  const rows = response.data.values || [];
  const header = rows[0] || [];
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === eventoId) {
      const evento = {};
      header.forEach((col, index) => {
        evento[col] = rows[i][index] || '';
      });
      
      // Convertir números
      evento.presupuesto_total = parseFloat(evento.presupuesto_total) || 0;
      evento.pagado_total = parseFloat(evento.pagado_total) || 0;
      evento.pendiente = parseFloat(evento.pendiente) || 0;
      evento.gastos_totales = parseFloat(evento.gastos_totales) || 0; // <-- NUEVO
      
      return evento;
    }
  }
  
  return null;
}

  async getEventosActivos() {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'eventos!A:K',
    });

    const rows = response.data.values || [];
    const header = rows[0] || [];
    const eventos = [];

    for (let i = 1; i < rows.length; i++) {
      const evento = {};
      header.forEach((col, index) => {
        evento[col] = rows[i][index] || '';
      });
      
      // Convertir números
      evento.presupuesto_total = parseFloat(evento.presupuesto_total) || 0;
      evento.pagado_total = parseFloat(evento.pagado_total) || 0;
      evento.pendiente = parseFloat(evento.pendiente) || 0;
      
      // Solo eventos en proceso
      if (evento.estado === 'en_proceso') {
        eventos.push(evento);
      }
    }

    return eventos;
  }

  async actualizarEventoEstado(eventoId, nuevoEstado) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'eventos!A:K',
    });

    const rows = response.data.values || [];
    let rowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === eventoId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex > 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `eventos!H${rowIndex}`,
        valueInputOption: 'RAW',
        resource: { values: [[nuevoEstado]] },
      });
    }
  }

  // ========== TRANSACCIONES ==========

  async registrarTransaccion(transaccionData, chatId, username) {
    const transaccion = {
      id: `T${Date.now()}`,
      fecha: new Date().toISOString(),
      tipo: transaccionData.tipo,
      cuenta: transaccionData.cuenta,
      monto: parseFloat(transaccionData.monto),
      descripcion: transaccionData.descripcion,
      evento_id: transaccionData.evento_id || '',
      categoria: transaccionData.categoria || 'general'
    };

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: 'transacciones!A:H',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [Object.values(transaccion)] },
    });

    console.log(`✅ Transacción: ${transaccion.tipo} $${transaccion.monto} - ${transaccion.cuenta}`);
  }

  // ========== BALANCES ==========

async actualizarBalance(cuentaNombre, monto, esPendiente = false) {
  // DEBUG: Ver qué llega
  console.log('🔍 DEBUG actualizarBalance ENTRADA:', {
    cuentaNombre,
    monto,
    montoTipo: typeof monto,
    esPendiente
  });
  
  // ¡IMPORTANTE! Convertir monto a número
  const montoNumero = parseFloat(monto);
  if (isNaN(montoNumero)) {
    console.error('❌ ERROR: monto no es número:', monto);
    return;
  }
  
  console.log('🔍 DEBUG monto procesado:', montoNumero);
  
  const response = await this.sheets.spreadsheets.values.get({
    spreadsheetId: this.sheetId,
    range: 'balance_cuentas!A:D',
  });

  const rows = response.data.values || [];
  let rowIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === cuentaNombre) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    // Asegurar que los valores actuales son números
    let balanceActual = parseFloat(rows[rowIndex - 1][1]) || 0;
    let balancePendiente = parseFloat(rows[rowIndex - 1][2]) || 0;
    
    console.log('🔍 DEBUG balances actuales:', {
      balanceActual,
      balancePendiente,
      montoNumero,
      esPendiente
    });

    if (esPendiente) {
      balancePendiente += montoNumero;
    } else {
      balanceActual += montoNumero;
    }

    console.log('🔍 DEBUG balances nuevos:', {
      balanceActual,
      balancePendiente
    });

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: `balance_cuentas!B${rowIndex}:D${rowIndex}`,
      valueInputOption: 'RAW',
      resource: { 
        values: [[
          balanceActual.toString(), 
          balancePendiente.toString(), 
          new Date().toISOString()
        ]] 
      },
    });
  }
}
  async getBalances() {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'balance_cuentas!A:D',
    });

    const rows = response.data.values || [];
    const balances = {
      personal: 0,
      empresa: 0,
      ahorro: 0
    };

    rows.forEach(row => {
      const cuenta = row[0];
      const balance = parseFloat(row[1]) || 0;
      
      if (cuenta === 'Personal') balances.personal = balance;
      if (cuenta === 'DJ EDY') balances.empresa = balance;
      if (cuenta === 'Ahorros') balances.ahorro = balance;
    });

    return balances;
  }

  // ========== STATE MANAGEMENT ==========

  async getState(chatId) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'state!A:G',
      });

      const rows = response.data.values || [];
      const header = rows[0] || [];
      
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === chatId.toString()) {
          const state = {};
          header.forEach((col, index) => {
            state[col] = rows[i][index] || null;
          });
          
          // Parsear metadata si existe
          if (state.metadata) {
            try {
              state.metadata = JSON.parse(state.metadata);
            } catch (e) {
              state.metadata = {};
            }
          }
          
          return state;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error obteniendo state:', error);
      return null;
    }
  }

  async updateState(chatId, stateData) {
    try {
      const existingState = await this.getState(chatId);
      
      const state = {
        chat_id: chatId.toString(),
        step: stateData.step || '',
        transaction_type: stateData.transaction_type || '',
        event: stateData.event || '',
        amount: stateData.amount || '',
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify(stateData.metadata || {})
      };

      if (existingState) {
        // Encontrar fila existente
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.sheetId,
          range: 'state!A:G',
        });

        const rows = response.data.values || [];
        let rowIndex = -1;

        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === chatId.toString()) {
            rowIndex = i + 1;
            break;
          }
        }

        if (rowIndex > 0) {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.sheetId,
            range: `state!A${rowIndex}:G${rowIndex}`,
            valueInputOption: 'RAW',
            resource: { values: [Object.values(state)] },
          });
        }
      } else {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.sheetId,
          range: 'state!A:G',
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [Object.values(state)] },
        });
      }

      return state;
    } catch (error) {
      console.error('Error actualizando state:', error);
      throw error;
    }
  }  // ← ESTA LLAVE CIERRA updateState

  async clearState(chatId) {
    return this.updateState(chatId, {
      step: '',
      transaction_type: '',
      event: '',
      amount: '',
      metadata: {}
    });
  }  // ← ESTA LLAVE CIERRA clearState

  // ========== FUNCIONES PARA REPORTES ==========

  async getEventosDelMes(mesNombre) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'eventos!A:K',
    });

    const rows = response.data.values || [];
    const header = rows[0] || [];
    const eventos = [];

    // Si no hay mes específico, usar mes actual
    const mesActual = new Date().getMonth();
    const añoActual = new Date().getFullYear();

    for (let i = 1; i < rows.length; i++) {
      const evento = {};
      header.forEach((col, index) => {
        evento[col] = rows[i][index] || '';
      });
      
      // Convertir fechas
      const fechaCreacion = new Date(evento.fecha_creacion);
      
      // Filtrar por mes si se especifica
      if (mesNombre && mesNombre.toLowerCase() !== 'actual') {
        const mesEvento = fechaCreacion.toLocaleDateString('es-ES', { month: 'long' }).toLowerCase();
        if (!mesEvento.includes(mesNombre.toLowerCase())) {
          continue;
        }
      } else if (fechaCreacion.getMonth() !== mesActual || fechaCreacion.getFullYear() !== añoActual) {
        continue;
      }
      
      evento.presupuesto_total = parseFloat(evento.presupuesto_total) || 0;
      evento.pagado_total = parseFloat(evento.pagado_total) || 0;
      evento.pendiente = parseFloat(evento.pendiente) || 0;
      
      eventos.push(evento);
    }

    return eventos;
  }  // ← ESTA LLAVE CIERRA getEventosDelMes

  async getTransaccionesDelMes(mesNombre) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'transacciones!A:H',
    });

    const rows = response.data.values || [];
    const header = rows[0] || [];
    const transacciones = [];

    const mesActual = new Date().getMonth();
    const añoActual = new Date().getFullYear();

    for (let i = 1; i < rows.length; i++) {
      const transaccion = {};
      header.forEach((col, index) => {
        transaccion[col] = rows[i][index] || '';
      });
      
      const fecha = new Date(transaccion.fecha);
      
      // Filtrar por mes
      if (mesNombre && mesNombre.toLowerCase() !== 'actual') {
        const mesTransaccion = fecha.toLocaleDateString('es-ES', { month: 'long' }).toLowerCase();
        if (!mesTransaccion.includes(mesNombre.toLowerCase())) {
          continue;
        }
      } else if (fecha.getMonth() !== mesActual || fecha.getFullYear() !== añoActual) {
        continue;
      }
      
      transaccion.monto = parseFloat(transaccion.monto) || 0;
      transacciones.push(transaccion);
    }

    return transacciones;
  }  // ← ESTA LLAVE CIERRA getTransaccionesDelMes

   async getEventosProximos() {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'eventos!A:K',
    });

    const rows = response.data.values || [];
    const header = rows[0] || [];
    const eventosProximos = [];

    const hoy = new Date();
    const unaSemanaDespues = new Date();
    unaSemanaDespues.setDate(hoy.getDate() + 7);

    for (let i = 1; i < rows.length; i++) {
      const evento = {};
      header.forEach((col, index) => {
        evento[col] = rows[i][index] || '';
      });
      
      // Solo eventos en proceso
      if (evento.estado !== 'en_proceso') continue;
      
      // Verificar si tiene fecha
      if (!evento.fecha_evento) continue;
      
      // Parsear fecha (formato DD-MM-AAAA)
      const [dia, mes, año] = evento.fecha_evento.split('-').map(Number);
      const fechaEvento = new Date(año, mes - 1, dia);
      
      // Verificar si está dentro de 7 días
      if (fechaEvento >= hoy && fechaEvento <= unaSemanaDespues) {
        evento.presupuesto_total = parseFloat(evento.presupuesto_total) || 0;
        evento.pagado_total = parseFloat(evento.pagado_total) || 0;
        evento.pendiente = parseFloat(evento.pendiente) || 0;
        eventosProximos.push(evento);
      }
    }
    
    return eventosProximos;
  }  // ← CIERRA getEventosProximos

  // ========== GESTIÓN DE GASTOS POR EVENTO ==========
  async registrarGastoEvento(eventoId, monto, descripcion, chatId, username) {
    try {
      console.log('🔍 DEBUG registrarGastoEvento:', { eventoId, monto, descripcion });
      
      // 1. Obtener evento
      const evento = await this.getEventoById(eventoId);
      if (!evento) {
        throw new Error(`Evento ${eventoId} no encontrado`);
      }

      // 2. Actualizar gastos_totales en el evento
      const gastosActuales = parseFloat(evento.gastos_totales) || 0;
      const nuevosGastosTotales = gastosActuales + parseFloat(monto);
      
      // Encontrar fila del evento
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'eventos!A:L',
      });

      const rows = response.data.values || [];
      let rowIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === eventoId) {
          rowIndex = i + 1;
          break;
        }
      }

      if (rowIndex > 0) {
        // Actualizar gastos_totales (columna L)
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: `eventos!L${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[nuevosGastosTotales.toString()]] },
        });
        
        console.log(`✅ Gastos actualizados para ${eventoId}: $${gastosActuales} → $${nuevosGastosTotales}`);
      }

      // 3. Registrar transacción como gasto
      await this.registrarTransaccion({
        tipo: 'gasto',
        cuenta: 'DJ EDY',
        monto: monto,
        descripcion: `[${eventoId}] ${descripcion}`,
        evento_id: eventoId,
        categoria: 'gasto_evento'
      }, chatId, username);

      // 4. Actualizar balance DJ EDY (gasto reduce balance)
      await this.actualizarBalance('DJ EDY', -parseFloat(monto), false);

      console.log(`✅ Gasto registrado: ${eventoId} - $${monto} - "${descripcion}"`);
      return {
        eventoNombre: evento.nombre,
        gastosTotales: nuevosGastosTotales,
        presupuestoTotal: evento.presupuesto_total,
        netoRestante: evento.presupuesto_total - nuevosGastosTotales
      };

    } catch (error) {
      console.error('❌ Error registrando gasto:', error);
      throw error;
    }
  }  // ← CIERRA registrarGastoEvento

  // ========== GASTOS DIRECTOS (NO VINCULADOS A EVENTO) ==========
async registrarGastoDirecto(monto, descripcion, categoria, chatId, username) {
  try {
    console.log('🔍 DEBUG registrarGastoDirecto:', { monto, descripcion, categoria });
    
    // 1. Registrar transacción como gasto directo
    await this.registrarTransaccion({
      tipo: 'gasto',
      cuenta: 'DJ EDY',
      monto: monto,
      descripcion: `[GENERAL] ${descripcion}`,
      evento_id: '', // Vacío porque no está vinculado a evento
      categoria: categoria || 'gasto_general'
    }, chatId, username);

    // 2. Actualizar balance DJ EDY (gasto reduce balance ACTUAL, no pendiente)
    await this.actualizarBalance('DJ EDY', -parseFloat(monto), false);

    console.log(`✅ Gasto directo registrado: $${monto} - "${descripcion}"`);
    return {
      monto: monto,
      descripcion: descripcion,
      categoria: categoria,
      fecha: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error registrando gasto directo:', error);
    throw error;
  }
}

  async getGastosEvento(eventoId) {
    try {
      // Buscar transacciones de tipo 'gasto' para este evento
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'transacciones!A:H',
      });

      const rows = response.data.values || [];
      const header = rows[0] || [];
      const gastos = [];

      for (let i = 1; i < rows.length; i++) {
        const transaccion = {};
        header.forEach((col, index) => {
          transaccion[col] = rows[i][index] || '';
        });
        
        // Filtrar: gastos del evento específico
        if (transaccion.tipo === 'gasto' && transaccion.evento_id === eventoId) {
          transaccion.monto = parseFloat(transaccion.monto) || 0;
          gastos.push(transaccion);
        }
      }

      return gastos;
    } catch (error) {
      console.error('Error obteniendo gastos:', error);
      return [];
    }
  }  // ← CIERRA getGastosEvento


  // ========== MÉTODOS FALTANTES PARA GASTOS ==========

async registrarGastoEvento(eventoId, monto, descripcion, chatId, username) {
  try {
    console.log('🔍 DEBUG registrarGastoEvento:', { eventoId, monto, descripcion });
    
    // 1. Obtener evento
    const evento = await this.getEventoById(eventoId);
    if (!evento) {
      throw new Error(`Evento ${eventoId} no encontrado`);
    }

    // 2. Actualizar gastos_totales en el evento
    const gastosActuales = parseFloat(evento.gastos_totales) || 0;
    const nuevosGastosTotales = gastosActuales + parseFloat(monto);
    
    // Encontrar fila del evento
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'eventos!A:L',
    });

    const rows = response.data.values || [];
    let rowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === eventoId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex > 0) {
      // Actualizar gastos_totales (columna L)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `eventos!L${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[nuevosGastosTotales.toString()]] },
      });
      
      console.log(`✅ Gastos actualizados para ${eventoId}: $${gastosActuales} → $${nuevosGastosTotales}`);
    }

    // 3. Registrar transacción como gasto
    await this.registrarTransaccion({
      tipo: 'gasto',
      cuenta: 'DJ EDY',
      monto: monto,
      descripcion: `[${eventoId}] ${descripcion}`,
      evento_id: eventoId,
      categoria: 'gasto_evento'
    }, chatId, username);

    // 4. Actualizar balance DJ EDY
    await this.actualizarBalance('DJ EDY', -parseFloat(monto), false);

    console.log(`✅ Gasto registrado: ${eventoId} - $${monto} - "${descripcion}"`);
    return {
      eventoNombre: evento.nombre,
      gastosTotales: nuevosGastosTotales,
      presupuestoTotal: evento.presupuesto_total,
      netoRestante: evento.presupuesto_total - nuevosGastosTotales
    };

  } catch (error) {
    console.error('❌ Error registrando gasto:', error);
    throw error;
  }
}

async getGastosEvento(eventoId) {
  try {
    // Buscar transacciones de tipo 'gasto' para este evento
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: 'transacciones!A:H',
    });

    const rows = response.data.values || [];
    const header = rows[0] || [];
    const gastos = [];

    for (let i = 1; i < rows.length; i++) {
      const transaccion = {};
      header.forEach((col, index) => {
        transaccion[col] = rows[i][index] || '';
      });
      
      // Filtrar: gastos del evento específico
      if (transaccion.tipo === 'gasto' && transaccion.evento_id === eventoId) {
        transaccion.monto = parseFloat(transaccion.monto) || 0;
        gastos.push(transaccion);
      }
    }

    return gastos;
  } catch (error) {
    console.error('Error obteniendo gastos:', error);
    return [];
  }
}
  

}  // ← ¡ESTA LLAVE CIERRA LA CLASE GoogleSheetsService!

let sheetsServiceInstance = null;

async function initializeSheets() {
  if (!sheetsServiceInstance) {
    sheetsServiceInstance = new GoogleSheetsService();
    await sheetsServiceInstance.initialize();
  }
  return sheetsServiceInstance;
}

module.exports = {
  GoogleSheetsService,
  initializeSheets,
};
