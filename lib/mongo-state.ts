import {
  MongoClient,
  type ClientSession,
  type Db,
  type Document,
} from "mongodb";
import { createHash } from "node:crypto";
import { seed, type State } from "./model";

export const collections = [
  "users",
  "payments",
  "notifications",
  "files",
  "sessions",
  "login_attempts",
  "audit_logs",
] as const;
type Row = Document & { _id: string };
function rows(state: State): Record<(typeof collections)[number], Row[]> {
  return {
    users: state.users.map(({ id, ...rest }) => ({ _id: id, ...rest })),
    payments: state.payments.map(({ id, ...rest }) => ({ _id: id, ...rest })),
    notifications: state.notices.map(({ id, ...rest }) => ({
      _id: id,
      ...rest,
    })),
    files: state.files.map(({ id, ...rest }) => ({ _id: id, ...rest })),
    sessions: state.sessions.map(({ hash, ...rest }) => ({
      _id: hash,
      ...rest,
    })),
    login_attempts: Object.entries(state.attempts).map(([phone, rest]) => ({
      _id: phone,
      ...rest,
    })),
    audit_logs: state.audit.map(({ id, ...entry }, index) => ({
      _id:
        id ||
        createHash("sha256")
          .update(JSON.stringify(entry) + ":" + index)
          .digest("hex"),
      ...entry,
      sequence: index,
    })),
  };
}
export async function readMongoState(
  db: Db,
  session: ClientSession,
): Promise<State> {
  const data = {} as Record<(typeof collections)[number], Row[]>;
  // MongoDB does not support parallel operations within one transaction.
  for (const name of collections)
    data[name] = await db.collection<Row>(name).find({}, { session }).toArray();
  const identified = (items: Row[]): (Document & { id: string })[] =>
    items.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  return {
    users: identified(data.users),
    payments: identified(data.payments).sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    ),
    notices: identified(data.notifications).sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    ),
    files: identified(data.files),
    sessions: data.sessions.map(({ _id, ...rest }) => ({ hash: _id, ...rest })),
    attempts: Object.fromEntries(
      data.login_attempts.map(({ _id, ...rest }) => [_id, rest]),
    ),
    audit: data.audit_logs
      .sort((a, b) => a.sequence - b.sequence)
      .map(({ _id, sequence, ...rest }) => ({ id: _id, ...rest })),
  } as State;
}
export async function writeChanges(
  db: Db,
  session: ClientSession,
  before: State,
  after: State,
) {
  const oldRows = rows(before),
    newRows = rows(after);
  for (const name of collections) {
    const old = new Map(oldRows[name].map((row) => [row._id, row]));
    const current = new Map(newRows[name].map((row) => [row._id, row]));
    for (const [id, row] of current) {
      if (!old.has(id))
        await db.collection<Row>(name).insertOne(row, { session });
      else if (JSON.stringify(old.get(id)) !== JSON.stringify(row))
        await db
          .collection<Row>(name)
          .replaceOne({ _id: id }, row, { session });
    }
    for (const id of old.keys())
      if (!current.has(id))
        await db.collection<Row>(name).deleteOne({ _id: id }, { session });
  }
}
export async function initializeMongo(client: MongoClient, db: Db) {
  for (const name of [...collections, "app_metadata", "migration_backups"]) {
    try {
      await db.createCollection(name);
    } catch (error) {
      if ((error as { code?: number }).code !== 48) throw error;
    }
  }
  await db.collection("users").createIndex({ phone: 1 }, { unique: true });
  await db
    .collection("payments")
    .createIndex({ userId: 1, status: 1, createdAt: -1 });
  await db
    .collection("notifications")
    .createIndex({ userId: 1, read: 1, createdAt: -1 });
  await db.collection("sessions").createIndex({ userId: 1 });
  await db.collection("files").createIndex({ ownerId: 1, paymentId: 1 });
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const meta = db.collection<Row>("app_metadata");
      if (await meta.findOne({ _id: "schema" }, { session })) return;
      for (const name of collections)
        if (await db.collection(name).countDocuments({}, { session }))
          throw new Error(
            "Unmanaged data exists; migration stopped to preserve it",
          );
      const legacy = await db
        .collection<Row>("households")
        .findOne({ _id: "home" }, { session });
      const empty: State = {
        users: [],
        payments: [],
        notices: [],
        files: [],
        sessions: [],
        attempts: {},
        audit: [],
      };
      const initial: State = legacy ? { ...empty, ...legacy.state } : seed();
      if (legacy)
        await db
          .collection<Row>("migration_backups")
          .insertOne(
            { _id: "households-v1", source: legacy, migratedAt: new Date() },
            { session },
          );
      for (const user of initial.users)
        if (["+905343344584", "+905374778847"].includes(user.phone))
          user.role = "admin";
      await writeChanges(db, session, empty, initial);
      await meta.insertOne(
        { _id: "schema", version: 2, revision: 0, migratedAt: new Date() },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}
