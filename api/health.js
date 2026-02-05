module.exports = async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'DJ EDY Accounting System',
    version: '2.0',
    environment: process.env.NODE_ENV || 'development'
  });
};
