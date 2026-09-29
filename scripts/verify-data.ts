import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";
import assert from "node:assert/strict";
import {
  readMongoState,
  writeChanges,
  initializeMongo,
} from "../lib/mongo-state";
async function main() {
  loadEnvConfig(process.cwd());
  const client = await new MongoClient(process.env.MONGODB_URI!).connect();
  const db = client.db(process.env.MONGODB_DB || "unihome");
  const session = client.startSession();
  try {
    await initializeMongo(client, db);
    session.startTransaction();
    const before = await readMongoState(db, session);
    assert.equal(before.users.length, 6);
    assert.deepEqual(
      before.users
        .filter((u) => u.role === "admin")
        .map((u) => u.name)
        .sort(),
      ["مجد الدين", "سامح"].sort(),
    );
    const after = structuredClone(before);
    after.notices.push({
      id: "transaction-verification",
      userId: "1",
      paymentId: "test",
      read: false,
      text: "test",
      createdAt: new Date().toISOString(),
    });
    await writeChanges(db, session, before, after);
    const saved = await readMongoState(db, session);
    assert.equal(saved.notices.length, before.notices.length + 1);
    assert.deepEqual(saved.users, before.users);
    await writeChanges(db, session, saved, {
      ...saved,
      notices: before.notices,
    });
    assert.equal(
      (await readMongoState(db, session)).notices.length,
      before.notices.length,
    );
    await session.abortTransaction();
    assert.equal(
      await db
        .collection("notifications")
        .countDocuments({ _id: "transaction-verification" as never }),
      0,
    );
    console.log(
      "PASS: normalized accounts, two admins, transactional read/write/delete and rollback; no test records persisted.",
    );
  } finally {
    if (session.inTransaction()) await session.abortTransaction();
    await session.endSession();
    await client.close();
  }
}
main().catch((error) => {
  console.error("Verification failed:", error.name);
  process.exitCode = 1;
});
