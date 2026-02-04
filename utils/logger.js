class Logger {
  static info(message, data = null) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  }
  
  static error(message, error = null) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    if (error) {
      console.error('Stack:', error.stack);
      console.error('Details:', error.message);
    }
  }
  
  static warn(message, data = null) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
    if (data) console.warn(JSON.stringify(data, null, 2));
  }
  
  static debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`);
      if (data) console.debug(JSON.stringify(data, null, 2));
    }
  }
}

module.exports = Logger;
