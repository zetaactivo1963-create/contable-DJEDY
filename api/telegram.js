const { Telegraf } = require('telegraf');
const { handleMessage } = require('../lib/telegramBot');
const { initializeSheets } = require('../lib/googleSheets');

const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'GOOGLE_SHEET_ID',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Variable de entorno faltante: ${envVar}`);
  }
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

let sheetsClient = null;

// Función para obtener sheetsClient con manejo de errores
async function getSheetsClient() {
  if (!sheetsClient) {
    try {
      sheetsClient = await initializeSheets();
      console.log('✅ Google Sheets inicializado');
    } catch (error) {
      console.error('❌ Error inicializando Google Sheets:', error);
      throw error;
    }
  }
  return sheetsClient;
}

// Middleware para asegurar que sheetsClient esté disponible
bot.use(async (ctx, next) => {
  try {
    ctx.sheetsClient = await getSheetsClient();
  } catch (error) {
    console.error('❌ No se pudo obtener sheetsClient:', error);
    // Responder con error claro
    if (ctx.message && ctx.message.text !== '/start') {
      await ctx.reply('⚠️ El servicio de Google Sheets no está disponible. Intenta de nuevo en unos segundos.');
      return;
    }
  }
  await next();
});

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'ok', 
      message: 'Bot de contabilidad activo' 
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const update = req.body;
    bot.context.sheetsClient = sheetsClient;
    await bot.handleUpdate(update);
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Error procesando webhook:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

bot.use(async (ctx, next) => {
  console.log(`📨 Mensaje de ${ctx.from?.username || ctx.from?.id}: ${ctx.message?.text}`);
  await next();
});

bot.start(async (ctx) => {
  await ctx.reply(
    `👋 ¡Hola ${ctx.from.first_name}!\n\n` +
    `Soy tu bot de contabilidad personal. Puedo ayudarte a registrar:\n\n` +
    `• *Ingresos*: "depósito 500 boda María"\n` +
    `• *Gastos*: "gasto 120 supermercado"\n` +
    `• *Transferencias*: "transferencia 200 a ahorros"\n\n` +
    `*Ejemplos rápidos:*\n` +
    `- depósito 500 boda María\n` +
    `- gasto 120 supermercado\n` +
    `- transferencia 200 a ahorros\n\n` +
    `También puedes escribir solo "gasto" o "depósito" y te guiaré paso a paso.`,
    { parse_mode: 'Markdown' }
  );
});

bot.help((ctx) => {
  ctx.reply(
    `*Comandos disponibles:*\n\n` +
    `/start - Iniciar el bot\n` +
    `/help - Mostrar esta ayuda\n\n` +
    `*Formato de mensajes:*\n\n` +
    `• *Registro completo:*\n` +
    `  "depósito 500 boda María"\n` +
    `  "gasto 120 supermercado"\n` +
    `  "transferencia 200 a ahorros"\n\n` +
    `• *Registro paso a paso:*\n` +
    `  1. Escribe "gasto"\n` +
    `  2. Te preguntaré por el evento\n` +
    `  3. Te preguntaré por el monto\n\n` +
    `*Palabras clave:*\n` +
    `- depósito / ingreso / ingreso\n` +
    `- gasto / pago / compra\n` +
    `- transferencia / mover / enviar`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('text', async (ctx) => {
  try {
    await handleMessage(ctx);
  } catch (error) {
    console.error('Error en handler de mensaje:', error);
    await ctx.reply('❌ Ocurrió un error procesando tu mensaje. Intenta de nuevo.');
  }
});

bot.catch((err, ctx) => {
  console.error(`Error para ${ctx.updateType}:`, err);
});
