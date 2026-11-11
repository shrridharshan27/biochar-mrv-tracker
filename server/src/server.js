const app = require('./app');
const { closeDB } = require('./db');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Biochar MRV Tracker server running on port ${PORT}`);
});

function handleShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    closeDB();
    console.log('Server and database connection closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = server;
