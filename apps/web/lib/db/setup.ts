import { getDb, closeMongoClient } from './client';
import { initIndexes, REQUIRED_INDEXES } from './indexes';

export interface DbSetupReport {
  connected: boolean;
  dbName: string;
  pingOk: boolean;
  indexesCreatedOrVerified: number;
  collectionsVerified: number;
}

export async function verifyAndSetupDatabase(): Promise<DbSetupReport> {
  const db = await getDb();
  const pingResult = await db.command({ ping: 1 });
  const pingOk = pingResult.ok === 1;

  const { created, existing } = await initIndexes(db);

  return {
    connected: true,
    dbName: db.databaseName,
    pingOk,
    indexesCreatedOrVerified: created + existing,
    collectionsVerified: REQUIRED_INDEXES.length,
  };
}

// Allow direct execution via CLI
if (process.argv[1]?.endsWith('setup.ts') || process.argv[1]?.endsWith('setup.js')) {
  verifyAndSetupDatabase()
    .then(async (report) => {
      console.log('MongoDB setup and verification report:', JSON.stringify(report, null, 2));
      await closeMongoClient();
      process.exit(0);
    })
    .catch((err) => {
      console.error('MongoDB setup failed:', err.message);
      process.exit(1);
    });
}
