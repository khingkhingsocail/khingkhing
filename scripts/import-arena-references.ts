import "dotenv/config";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { z } from "zod";
import {
  arenaReferenceSchema,
  referenceCategory,
  referenceGroup,
} from "../shared/arenaReferences";

const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: pnpm exec tsx scripts/import-arena-references.ts data/celebrity-references.json"
  );
const input = z
  .array(arenaReferenceSchema)
  .min(1)
  .max(1000)
  .parse(JSON.parse(await readFile(file, "utf8")));
if (new Set(input.map(r => r.id)).size !== input.length)
  throw new Error("Duplicate reference ID");
if (
  new Set(input.map(r => `${r.personId}|${referenceGroup(r)}`)).size !==
  input.length
)
  throw new Error("Duplicate person per comparable group");
const db = await mysql.createConnection(process.env.DATABASE_URL!);
try {
  await db.beginTransaction();
  let added = 0;
  for (const record of input) {
    const [rows] = await db.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM arena_public_references WHERE id=? OR (person_id=? AND group_key=?)",
      [record.id, record.personId, referenceGroup(record)]
    );
    if (rows.length) continue; // Preserve prior imports and any future curated corrections.
    await db.execute(
      "INSERT INTO arena_public_references (id,person_id,group_key,category,board_key,payload) VALUES (?,?,?,?,?,?)",
      [
        record.id,
        record.personId,
        referenceGroup(record),
        referenceCategory(record),
        record.boardKey,
        JSON.stringify(record),
      ]
    );
    added++;
  }
  await db.commit();
  console.log(
    `Imported ${added} new public-reference records; ${input.length - added} existing records preserved.`
  );
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
