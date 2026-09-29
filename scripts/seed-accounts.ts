import { loadEnvConfig } from '@next/env';
import { MongoClient } from 'mongodb';
import { seed, verifyPassword, type State } from '../lib/model';

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const collection = client.db(process.env.MONGODB_DB || 'unihome').collection<{ _id: string; version: number; state: State }>('households');
    const initial = seed();
    await collection.updateOne({ _id: 'home' }, { $setOnInsert: { version: 0, state: initial } }, { upsert: true });
    for (let retry = 0; retry < 12; retry++) {
      const doc = await collection.findOne({ _id: 'home' });
      if (!doc) throw new Error('Household initialization failed');
      const missing = initial.users.filter(u => !doc.state.users.some(existing => existing.phone === u.phone));
      if (missing.some(u => doc.state.users.some(existing => existing.id === u.id))) throw new Error('Account ID conflict; existing records preserved');
      if (missing.length) {
        doc.state.users.push(...missing);
        const result = await collection.replaceOne({ _id: 'home', version: doc.version }, { ...doc, version: doc.version + 1 });
        if (!result.modifiedCount) continue;
      }
      console.log(JSON.stringify({ database: process.env.MONGODB_DB || 'unihome', collection: 'households', accounts: doc.state.users.map(u => ({ name: u.name, role: u.role, initialPasswordMatches: verifyPassword('mjd123', u.password) })), payments: doc.state.payments.length }, null, 2));
      return;
    }
    throw new Error('Concurrent updates prevented initialization');
  } finally { await client.close(); }
}
main().catch(error => { console.error('Account initialization failed:', error instanceof Error ? error.name : 'Unknown error'); process.exitCode = 1; });
