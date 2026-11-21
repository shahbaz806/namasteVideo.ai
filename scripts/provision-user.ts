import { parseArgs } from 'node:util';
import { provisionUser } from '../apps/web/lib/auth/admission';
import { closeMongoClient } from '../apps/web/lib/db/client';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string' },
    operator: { type: 'string' },
  },
});

async function main() {
  if (!values.email) {
    console.error('Usage: tsx scripts/provision-user.ts --email <email> [--password <password>] [--name <name>] [--operator <ref>]');
    process.exit(1);
  }

  const result = await provisionUser({
    email: values.email,
    password: values.password || 'TemporaryPassword123!',
    name: values.name || 'Approved Creator',
    operatorRef: values.operator || 'cli-operator',
  });

  console.log('User provisioned successfully:', JSON.stringify(result, null, 2));
  await closeMongoClient();
}

main().catch((err) => {
  console.error('Provisioning failed:', err);
  process.exit(1);
});
