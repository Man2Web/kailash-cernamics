// One-off data rename: "Geetha Ceramics" -> "Kailash Ceramics" in the database.
//   - company name / email, sample login accounts (@geethaceramics.com -> @kailashceramics.com), employee ids (GC-EMP- -> KC-EMP-)
// Runs in ONE transaction. Default is a DRY RUN that prints what would change and rolls back. Use DRY=1 explicitly or DRY=0 to apply.
//   node scripts/rename-geetha-to-kailash.cjs        (dry run)
//   DRY=0 node scripts/rename-geetha-to-kailash.cjs  (apply)
const { Client } = require("pg");
const DRY = process.env.DRY !== "0";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const out = [];
  await c.query("begin");
  try {
    const before = await c.query("select email from users where email ilike '%@geethaceramics.com' order by email");
    out.push("login accounts to rename: " + before.rows.map((r) => r.email).join(", "));

    const r1 = await c.query(
      "update users set email = regexp_replace(email, '@geethaceramics\\.com$', '@kailashceramics.com', 'i') where email ilike '%@geethaceramics.com'"
    );
    out.push("users updated=" + r1.rowCount);
    const r2 = await c.query(
      "update employees set email = regexp_replace(email, '@geethaceramics\\.com$', '@kailashceramics.com', 'i') where email ilike '%@geethaceramics.com'"
    );
    out.push("employees (email) updated=" + r2.rowCount);
    const r3 = await c.query("update employees set employee_no = regexp_replace(employee_no, '^GC-EMP-', 'KC-EMP-') where employee_no like 'GC-EMP-%'");
    out.push("employees (employee id GC-EMP- -> KC-EMP-) updated=" + r3.rowCount);
    const r4 = await c.query(
      "update companies set name = replace(name, 'Geetha', 'Kailash'), email = regexp_replace(coalesce(email, ''), 'geethaceramics\\.com$', 'kailashceramics.com', 'i') where name ilike '%geetha%' or email ilike '%geetha%'"
    );
    out.push("companies updated=" + r4.rowCount);

    const after = await c.query("select email from users where email ilike '%@kailashceramics.com' order by email");
    out.push("kailash login accounts now: " + after.rows.map((r) => r.email).join(", "));
    const left = await c.query("select (select count(*) from users where email ilike '%geetha%') u, (select count(*) from companies where name ilike '%geetha%' or email ilike '%geetha%') co, (select count(*) from employees where employee_no like 'GC-%' or email ilike '%geetha%') e");
    out.push("geetha references left (users/companies/employees): " + JSON.stringify(left.rows[0]));

    console.log(out.join("\n"));
    if (DRY) { await c.query("rollback"); console.log("DRY RUN: rolled back, nothing changed."); }
    else { await c.query("commit"); console.log("COMMITTED."); }
  } catch (e) {
    await c.query("rollback");
    console.log("ERROR, rolled back:", e.message);
  }
  await c.end();
})();
