// Optional dotenv configuration
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (err) {
  // Dotenv not installed, fallback to system environment variables
}

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/school',
  dbName: process.env.DB_NAME || 'school',
  useMockDb: process.env.USE_MOCK_DB !== 'false'
};
