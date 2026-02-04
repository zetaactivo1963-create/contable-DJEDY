const { google } = require('googleapis');

class GoogleSheetsService {
  constructor() {
    this.sheetId = process.env.GOOGLE_SHEET_ID;
    this.auth = null;
    this.sheets = null;
  }

  async initialize() {
    try {
      this.auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const authClient = await this.auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: authClient });

      await this.ensureSheetExists();
      
      console.log('✅ Google Sheets Service inicializado');
      return this;
    } catch (error) {
      console.error('❌ Error inicializando Google Sheets:', error);
      throw error;
    }
  }

  async ensureSheetExists() {
    try {
      await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId,
      });
      console.log('✅ Sheet encontrada');
    } catch (error) {
      if (error.code === 404) {
        console.log('📄 Sheet no encontrada, creando nueva...');
        await this.createNewSheet();
      } else {
        throw error;
      }
    }
  }

  async createNewSheet() {
    const response = await this.sheets.spreadsheets.create({
      resource: {
        properties: {
          title: 'Contabilidad Personal Bot',
        },
        sheets: [
          {
            properties: {
              title: 'state',
              gridProperties: { rowCount: 1000, columnCount: 10 },
            },
          },
          {
            properties: {
              title: 'transactions',
              gridProperties: { rowCount: 10000, columnCount: 10 },
            },
          },
        ],
      },
    });

    const newSheetId = response.data.spreadsheetId;
    await this.setupSheetHeaders(newSheetId);
    
    console.log(`✅ Nueva sheet creada: ${newSheetId}`);
    return newSheetId;
  }

  async setupSheetHeaders(sheetId) {
    const headers = {
      'state': ['chat_id', 'step', 'transaction_type', 'event', 'amount', 'timestamp', 'metadata'],
      'transactions': ['id', 'chat_id', 'username', 'transaction_type', 'event', 'amount', 'timestamp', 'notes']
    };

    for (const [sheetName, headerRow] of Object.entries(headers)) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1:${String.fromCharCode(65 + headerRow.length - 1)}1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headerRow],
        },
      });
    }
  }

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
            resource: {
              values: [Object.values(state)],
            },
          });
        }
      } else {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.sheetId,
          range: 'state!A:G',
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: {
            values: [Object.values(state)],
          },
        });
      }

      return state;
    } catch (error) {
      console.error('Error actualizando state:', error);
      throw error;
    }
  }

  async clearState(chatId) {
    return this.updateState(chatId, {
      step: '',
      transaction_type: '',
      event: '',
      amount: '',
      metadata: {}
    });
  }

  async addTransaction(transactionData) {
    try {
      const transaction = {
        id: Date.now().toString(),
        chat_id: transactionData.chat_id.toString(),
        username: transactionData.username || '',
        transaction_type: transactionData.transaction_type,
        event: transactionData.event,
        amount: parseFloat(transactionData.amount),
        timestamp: new Date().toISOString(),
        notes: transactionData.notes || ''
      };

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'transactions!A:H',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [Object.values(transaction)],
        },
      });

      console.log(`✅ Transacción registrada: ${transaction.transaction_type} ${transaction.amount} - ${transaction.event}`);
      return transaction;
    } catch (error) {
      console.error('Error añadiendo transacción:', error);
      throw error;
    }
  }

  async getTransactions(chatId, limit = 10) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'transactions!A:H',
      });

      const rows = response.data.values || [];
      const header = rows[0] || [];
      const transactions = [];

      for (let i = 1; i < rows.length && transactions.length < limit; i++) {
        if (rows[i][1] === chatId.toString()) {
          const transaction = {};
          header.forEach((col, index) => {
            transaction[col] = rows[i][index] || null;
          });
          transactions.push(transaction);
        }
      }

      return transactions;
    } catch (error) {
      console.error('Error obteniendo transacciones:', error);
      return [];
    }
  }
}

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
