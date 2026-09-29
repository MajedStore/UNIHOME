import { MongoClient } from "mongodb";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { seed, type State } from "./model";
import { initializeMongo, readMongoState, writeChanges } from "./mongo-state";
export const demo = process.env.DEMO_MODE === "true";
export const dataPath = path.join(
  process.cwd(),
  ".data",
  process.env.DEMO_DATA_DIR
    ? path.basename(process.env.DEMO_DATA_DIR)
    : "local",
);
const globals = globalThis as typeof globalThis & {
  mongoV2?: Promise<MongoClient>;
  mongoSchemaV2?: Promise<void>;
  queue?: Promise<unknown>;
};
async function connection() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  globals.mongoV2 ??= new MongoClient(process.env.MONGODB_URI)
    .connect()
    .catch((error) => {
      globals.mongoV2 = undefined;
      throw error;
    });
  const client = await globals.mongoV2;
  const db = client.db(process.env.MONGODB_DB || "unihome");
  globals.mongoSchemaV2 ??= initializeMongo(client, db).catch((error) => {
    globals.mongoSchemaV2 = undefined;
    throw error;
  });
  await globals.mongoSchemaV2;
  return { client, db };
}
async function readLocal(): Promise<State> {
  try {
    return JSON.parse(
      await readFile(path.join(dataPath, "state.json"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return seed();
  }
}
export async function mutate<T>(fn: (state: State) => T): Promise<T> {
  if (demo) {
    const task = (globals.queue || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const state = await readLocal();
        const result = fn(state);
        await mkdir(dataPath, { recursive: true });
        await writeFile(
          path.join(dataPath, "state.tmp"),
          JSON.stringify(state),
        );
        await rename(
          path.join(dataPath, "state.tmp"),
          path.join(dataPath, "state.json"),
        );
        return result;
      });
    globals.queue = task;
    return task;
  }
  const { client, db } = await connection();
  const session = client.startSession();
  try {
    return (await session.withTransaction(
      async () => {
        // Serialize application writes while committing all related collections atomically.
        await db
          .collection<{ _id: string; revision: number }>("app_metadata")
          .updateOne({ _id: "schema" }, { $inc: { revision: 1 } }, { session });
        const state = await readMongoState(db, session);
        const before = structuredClone(state);
        const result = fn(state);
        await writeChanges(db, session, before, state);
        return result;
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    )) as T;
  } finally {
    await session.endSession();
  }
}
export async function readState(): Promise<State> {
  if (demo) {
    await globals.queue?.catch(() => {});
    return readLocal();
  }
  const { client, db } = await connection();
  const session = client.startSession();
  try {
    return (await session.withTransaction(() => readMongoState(db, session), {
      readConcern: { level: "snapshot" },
    })) as State;
  } finally {
    await session.endSession();
  }
}
