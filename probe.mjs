import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
const schema = fs.readFileSync('db/schema.sql','utf8');
await db.exec(schema);
console.log('schema loaded OK');
const p = await db.query("INSERT INTO property(name) VALUES('P') RETURNING id");
const pid = p.rows[0].id;
const r = await db.query("INSERT INTO room(property_id,name,room_type,price_night) VALUES($1,'R1','x',50) RETURNING id",[pid]);
const rid = r.rows[0].id;
const c = await db.query("INSERT INTO customer(name,email) VALUES('C','c@x.sk') RETURNING id");
const cid = c.rows[0].id;
const b = await db.query("INSERT INTO booking(customer_id,status) VALUES($1,'confirmed') RETURNING id",[cid]);
const bid = b.rows[0].id;
await db.query("INSERT INTO booking_room(booking_id,room_id,stay,price,status) VALUES($1,$2,daterange('2026-08-01','2026-08-05'),200,'confirmed')",[bid,rid]);
console.log('first booking OK');
try {
  await db.query("INSERT INTO booking_room(booking_id,room_id,stay,price,status) VALUES($1,$2,daterange('2026-08-03','2026-08-07'),200,'confirmed')",[bid,rid]);
  console.log('ERROR: overlap was allowed!');
} catch(e){ console.log('overlap blocked, code=', e.code || e.message); }
