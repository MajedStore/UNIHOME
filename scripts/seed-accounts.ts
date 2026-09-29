import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { seed } from "../lib/model";
import { initializeMongo } from "../lib/mongo-state";
async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing");
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "unihome");
    await initializeMongo(client, db);
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const users = db.collection<{
          _id: string;
          name: string;
          phone: string;
          role: string;
        }>("users");
        for (const user of seed().users) {
          const existing = await users.findOne(
            { phone: user.phone },
            { session },
          );
          if (existing)
            await users.updateOne(
              { _id: existing._id },
              { $set: { name: user.name, role: user.role } },
              { session },
            );
          else {
            const { id, ...rest } = user;
            const conflict = await users.findOne({ _id: id }, { session });
            await users.insertOne(
              { _id: conflict ? randomUUID() : id, ...rest },
              { session },
            );
          }
        }
      });
    } finally {
      await session.endSession();
    }
    console.log(
      JSON.stringify(
        {
          database: db.databaseName,
          accounts: await db
            .collection("users")
            .find({}, { projection: { name: 1, role: 1 } })
            .toArray(),
          payments: await db.collection("payments").countDocuments(),
          notifications: await db.collection("notifications").countDocuments(),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(
    "Initialization failed:",
    error instanceof Error ? error.name : "Unknown",
  );
  console.error(
    error instanceof Error ? error.stack?.split("\n").slice(1).join("\n") : "",
  );
  process.exitCode = 1;
});
