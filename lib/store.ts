import { MongoClient } from "mongodb";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { seed, State } from "./model";
export const demo = process.env.DEMO_MODE === "true";
export const dataPath = path.join(
  process.cwd(),
  ".data",
  process.env.DEMO_DATA_DIR
    ? path.basename(process.env.DEMO_DATA_DIR)
    : "local",
);
type Household = { _id: string; version: number; state: State };
const globals = globalThis as typeof globalThis & {
  mongo?: Promise<MongoClient>;
  queue?: Promise<unknown>;
};
async function collection() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  globals.mongo ??= new MongoClient(process.env.MONGODB_URI).connect();
  return (await globals.mongo)
    .db(process.env.MONGODB_DB || "unihome")
    .collection<Household>("households");
}
async function readLocal() {
  try {
    return JSON.parse(
      await readFile(path.join(dataPath, "state.json"), "utf8"),
    ) as State;
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
  const col = await collection();
  for (let retry = 0; retry < 12; retry++) {
    let doc = await col.findOne({ _id: "home" });
    if (!doc) {
      try {
        await col.insertOne({ _id: "home", version: 0, state: seed() });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
      doc = await col.findOne({ _id: "home" });
    }
    if (!doc) throw new Error("Database initialization failed");
    const result = fn(doc.state);
    const write = await col.replaceOne(
      { _id: "home", version: doc.version },
      { ...doc, version: doc.version + 1 },
    );
    if (write.modifiedCount) return result;
  }
  throw new Error("Concurrent update limit reached");
}
export async function readState(): Promise<State> {
  if (demo) {
    await globals.queue?.catch(() => {});
    return readLocal();
  }
  const doc = await (await collection()).findOne({ _id: "home" });
  if (doc) return doc.state;
  return mutate((state) => state);
}
