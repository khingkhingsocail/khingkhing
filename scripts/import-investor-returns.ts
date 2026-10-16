import "dotenv/config";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { z } from "zod";
import { investorReturnSchema } from "../shared/investorReturns";
const file = process.argv[2];
if (!file) throw new Error("Provide investor returns JSON path");
const rows = z
  .array(investorReturnSchema)
  .min(1)
  .max(500)
  .parse(JSON.parse(await readFile(file, "utf8")));
if (new Set(rows.map(row => row.id)).size !== rows.length)
  throw new Error("Duplicate investor return ID");
const db = await mysql.createConnection(process.env.DATABASE_URL!);
try {
  await db.beginTransaction();
  let added = 0;
  for (const row of rows) {
    const [existing] = await db.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM investor_return_references WHERE id=?",
      [row.id]
    );
    if (existing.length) continue;
    await db.execute(
      "INSERT INTO investor_return_references(id,payload) VALUES(?,?)",
      [row.id, JSON.stringify(row)]
    );
    added++;
  }
  await db.commit();
  console.log(
    `Imported ${added} return references; preserved ${rows.length - added} existing records.`
  );
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
