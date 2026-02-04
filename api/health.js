module.exports = async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Telegram Accounting Bot',
    environment: process.env.NODE_ENV || 'development'
  });
};
