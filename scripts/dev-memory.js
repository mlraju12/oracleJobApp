const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'development';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'local-dev-session-secret';

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  const { createApp } = require('../src/createApp');
  const app = await createApp();
  const port = Number(process.env.PORT || 3050);
  app.listen(port, () => {
    console.log(`Oracle HCM Opportunities (local memory database) http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
