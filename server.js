require('dotenv').config();
const { createApp } = require('./src/createApp');

function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 16 || /change-me/i.test(secret)) {
    console.error('SESSION_SECRET must be a strong production value.');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
  }
}

assertProductionConfig();

const port = Number(process.env.PORT || 3050);
createApp()
  .then((app) => {
    app.listen(port, () => {
      console.log(`Oracle HCM Opportunities listening on ${port}`);
    });
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
