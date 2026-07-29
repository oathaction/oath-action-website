// THROWAWAY verification harness for src/lib/db/pg/awards.ts. Delete when done.
//
// Compiles the real module with tsc into the scratchpad, rewrites its module
// specifiers so plain node can load it, and exercises every exported function
// against a live database.
//
//   export DATABASE_URL="$(./scripts/setup-test-db.sh awardlens_awards)"
//   node verify-awards.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROOT = "/home/user/oath-action-website/awardlens";
const SCRATCH = "/tmp/claude-0/-home-user-oath-action-website/5bbf6b70-a185-5c0d-8ea5-16e819f0e571/scratchpad";
const BUILD = path.join(SCRATCH, "build");

/* ------------------------------------------------------------- compile -- */

rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

const tsconfigPath = path.join(SCRATCH, "tsconfig.verify.json");
writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      esModuleInterop: true,
      skipLibCheck: true,
      strict: false,
      noEmitOnError: false,
      outDir: BUILD,
      rootDir: path.join(ROOT, "src"),
      baseUrl: ROOT,
      paths: { "@/*": ["src/*"] },
      types: [],
    },
    files: [path.join(ROOT, "src/lib/db/pg/awards.ts")],
  }),
);

try {
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: ROOT, stdio: "pipe" });
} catch (error) {
  // tsc emits even when unrelated files fail to typecheck; only a missing
  // output is fatal.
  process.stdout.write(String(error.stdout ?? ""));
}

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

// The env module reads a zod schema over process.env; the adapter only needs
// databaseUrl, so it is replaced wholesale.
writeFileSync(
  path.join(BUILD, "lib/env.js"),
  "export function getServerConfig() { return { databaseUrl: process.env.DATABASE_URL }; }\n",
);

const POSTGRES_ENTRY = path.join(ROOT, "node_modules/postgres/src/index.js");
for (const file of walk(BUILD).filter((f) => f.endsWith(".js"))) {
  let code = readFileSync(file, "utf8");
  code = code.replace(/^import ["']server-only["'];?\s*$/gm, "");
  code = code.replace(/(["'])postgres\1/g, JSON.stringify(POSTGRES_ENTRY));
  // Node needs explicit extensions on the relative specifiers tsc preserves.
  code = code.replace(/(from\s+["'])(\.\.?\/[^"']+?)(["'])/g, (m, a, spec, b) =>
    spec.endsWith(".js") ? m : `${a}${spec}.js${b}`,
  );
  code = code.replace(/(from\s+["'])@\/([^"']+)(["'])/g, (_m, a, spec, b) => {
    let rel = path.relative(path.dirname(file), path.join(BUILD, spec));
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return `${a}${rel}.js${b}`;
  });
  writeFileSync(file, code);
}

const db = await import(path.join(BUILD, "lib/db/pg/awards.js"));

/* -------------------------------------------------------------- set-up -- */

const url = process.env.DATABASE_URL;
assert.ok(url, "DATABASE_URL must be set");
const sql = postgres(url, { max: 2, onnotice: () => {} });

const results = [];
const check = (name, fn) => {
  results.push({ name, fn });
};
let orgA;
let orgB;
let userA;

async function reset() {
  await sql`delete from public.awards`;
  await sql`delete from public.organization_members`;
  await sql`delete from public.organizations`;
  await sql`delete from public.profiles`;
  await sql`delete from auth.users`;

  const mkUser = async (email) => {
    const [u] = await sql`insert into auth.users (email) values (${email}) returning id`;
    await sql`insert into public.profiles (id, email) values (${u.id}, ${email})`;
    return u.id;
  };
  userA = await mkUser("a@example.org");
  const userB = await mkUser("b@example.org");
  const [a] = await sql`
    insert into public.organizations (name, slug, created_by)
    values ('Org A', 'org-a', ${userA}) returning id`;
  const [b] = await sql`
    insert into public.organizations (name, slug, created_by)
    values ('Org B', 'org-b', ${userB}) returning id`;
  orgA = a.id;
  orgB = b.id;
}

const HASH = "a".repeat(64);
const awardInput = (over = {}) => ({
  organizationId: orgA,
  name: "Youth Literacy Partnership",
  funder: "Department of Education",
  recipientName: "Example Nonprofit",
  awardNumber: "ED-2026-001",
  awardAmount: 125000.5,
  currency: "USD",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  effectiveDate: "2025-12-15",
  grantPeriodText: "One year",
  programName: "Literacy",
  assistanceType: "Grant",
  primaryContacts: [
    { name: "Dana", role: "PO", organization: "ED", email: "dana@ed.gov", phone: null },
  ],
  governingDocuments: ["2 CFR 200"],
  status: "processing",
  reviewStatus: "not_started",
  sourceType: "pdf",
  createdBy: userA,
  ...over,
});

const documentInput = (awardId, over = {}) => ({
  awardId,
  organizationId: orgA,
  storagePath: null,
  originalFilename: "award.pdf",
  mimeType: "application/pdf",
  byteSize: 2048,
  contentHash: HASH,
  parserStatus: "pending",
  parserMessage: null,
  pageCount: null,
  extractedTextVersion: "1",
  ...over,
});

const segmentInputs = [
  {
    locatorType: "section",
    locatorValue: "IV.2",
    heading: "Reporting",
    text: "Quarterly report within thirty days.",
    sequence: 0,
    tokenEstimate: 12,
  },
  {
    locatorType: "page",
    locatorValue: "7",
    heading: null,
    text: "Final financial report within ninety days.",
    sequence: 1,
    tokenEstimate: 14,
  },
];

/* --------------------------------------------------------------- tests -- */

check("createAward / getAward round-trip and column mapping", async () => {
  const created = await db.createAward(awardInput());
  assert.equal(created.organizationId, orgA);
  assert.equal(created.awardAmount, 125000.5, "numeric -> number");
  assert.equal(typeof created.awardAmount, "number");
  assert.equal(created.startDate, "2026-01-01", "date stays YYYY-MM-DD");
  assert.equal(created.effectiveDate, "2025-12-15");
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/, "timestamptz -> ISO string");
  assert.deepEqual(created.primaryContacts, awardInput().primaryContacts, "jsonb -> typed shape");
  assert.deepEqual(created.governingDocuments, ["2 CFR 200"]);
  assert.equal(created.sourceType, "pdf");

  const fetched = await db.getAward(created.id, orgA);
  assert.deepEqual(fetched, created);
});

check("getAward with another organisation's id returns null", async () => {
  const award = await db.createAward(awardInput());
  assert.equal(await db.getAward(award.id, orgB), null);
});

check("listAwards is organisation-scoped and ordered created_at desc", async () => {
  const first = await db.createAward(awardInput({ name: "First" }));
  const second = await db.createAward(awardInput({ name: "Second" }));
  await db.createAward(awardInput({ organizationId: orgB, name: "Other org" }));

  const listed = await db.listAwards(orgA);
  assert.deepEqual(
    listed.map((a) => a.name),
    ["Second", "First"],
  );
  assert.ok(listed.every((a) => a.organizationId === orgA));
  assert.equal(second.createdAt >= first.createdAt, true);

  const other = await db.listAwards(orgB);
  assert.deepEqual(
    other.map((a) => a.name),
    ["Other org"],
  );
  assert.deepEqual(await db.listAwards("00000000-0000-4000-8000-0000000000ff"), []);
});

check("updateAward applies a partial patch and bumps updatedAt", async () => {
  const award = await db.createAward(awardInput());
  await new Promise((r) => setTimeout(r, 5));
  const updated = await db.updateAward(award.id, orgA, {
    status: "active",
    funder: "New Funder",
    awardAmount: 999.99,
    endDate: "2027-06-30",
    primaryContacts: [],
    governingDocuments: ["Uniform Guidance"],
  });
  assert.equal(updated.status, "active");
  assert.equal(updated.funder, "New Funder");
  assert.equal(updated.awardAmount, 999.99);
  assert.equal(updated.endDate, "2027-06-30");
  assert.deepEqual(updated.primaryContacts, []);
  assert.deepEqual(updated.governingDocuments, ["Uniform Guidance"]);
  assert.equal(updated.name, award.name, "untouched columns survive");
  assert.ok(updated.updatedAt > award.updatedAt, "updated_at bumped");
  assert.equal(updated.createdAt, award.createdAt);
});

check("updateAward with an empty patch still bumps updatedAt", async () => {
  const award = await db.createAward(awardInput());
  await new Promise((r) => setTimeout(r, 5));
  const updated = await db.updateAward(award.id, orgA, {});
  assert.ok(updated, "row returned");
  assert.ok(updated.updatedAt > award.updatedAt);
});

check("updateAward cannot move an award between organisations", async () => {
  const award = await db.createAward(awardInput());
  const updated = await db.updateAward(award.id, orgA, {
    id: "00000000-0000-4000-8000-00000000dead",
    organizationId: orgB,
    name: "Renamed",
  });
  assert.equal(updated.id, award.id, "id re-pinned");
  assert.equal(updated.organizationId, orgA, "organization_id re-pinned");
  assert.equal(updated.name, "Renamed");
  assert.equal(await db.getAward(award.id, orgB), null);
});

check("updateAward from the wrong organisation returns null and writes nothing", async () => {
  const award = await db.createAward(awardInput());
  assert.equal(await db.updateAward(award.id, orgB, { name: "Hijacked" }), null);
  const after = await db.getAward(award.id, orgA);
  assert.equal(after.name, award.name);
  assert.equal(after.updatedAt, award.updatedAt, "no write happened at all");
});

check("createDocument / getDocument / listDocuments with scoping", async () => {
  const award = await db.createAward(awardInput());
  const created = await db.createDocument(documentInput(award.id));
  assert.equal(created.awardId, award.id);
  assert.equal(created.byteSize, 2048);
  assert.equal(typeof created.byteSize, "number", "bigint -> number");
  assert.equal(created.pageCount, null);
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);

  assert.deepEqual(await db.getDocument(created.id, orgA), created);
  assert.equal(await db.getDocument(created.id, orgB), null);

  const second = await db.createDocument(
    documentInput(award.id, { contentHash: "b".repeat(64), originalFilename: "second.pdf" }),
  );
  const listed = await db.listDocuments(award.id, orgA);
  assert.deepEqual(
    listed.map((d) => d.id),
    [created.id, second.id],
    "oldest first",
  );
  assert.deepEqual(await db.listDocuments(award.id, orgB), [], "wrong organisation -> []");
});

check("updateDocument patches, is scoped, and never leaks bytes", async () => {
  const award = await db.createAward(awardInput());
  const doc = await db.createDocument(documentInput(award.id));

  const updated = await db.updateDocument(doc.id, orgA, {
    parserStatus: "parsed",
    parserMessage: null,
    pageCount: 14,
  });
  assert.equal(updated.parserStatus, "parsed");
  assert.equal(updated.pageCount, 14);
  assert.equal(updated.originalFilename, doc.originalFilename);
  assert.equal("content" in updated, false, "content is never selected");

  assert.equal(await db.updateDocument(doc.id, orgB, { parserStatus: "failed" }), null);
  assert.equal((await db.getDocument(doc.id, orgA)).parserStatus, "parsed", "no cross-org write");

  assert.deepEqual(
    await db.updateDocument(doc.id, orgA, {}),
    await db.getDocument(doc.id, orgA),
    "empty patch returns the record unchanged",
  );

  const patched = await db.updateDocument(doc.id, orgA, {
    id: "00000000-0000-4000-8000-00000000beef",
    awardId: "00000000-0000-4000-8000-00000000beef",
    organizationId: orgB,
    mimeType: "text/plain",
  });
  assert.equal(patched.id, doc.id);
  assert.equal(patched.awardId, doc.awardId);
  assert.equal(patched.organizationId, orgA);
  assert.equal(patched.mimeType, "text/plain");
});

check("saveDocumentBytes / readDocumentBytes round-trip and honour the byte-source constraint", async () => {
  const award = await db.createAward(awardInput());
  const doc = await db.createDocument(documentInput(award.id));
  const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x0a]);

  const locator = await db.saveDocumentBytes(doc.id, bytes);
  assert.equal(locator, `postgres://documents/${doc.id}`);

  const read = await db.readDocumentBytes(doc.id);
  assert.ok(Buffer.isBuffer(read));
  assert.equal(read.equals(bytes), true, "bytes round-trip unchanged");

  // The pipeline writes the locator back through updateDocument; the check
  // constraint must survive it.
  const after = await db.updateDocument(doc.id, orgA, { storagePath: locator });
  assert.equal(after.storagePath, null, "inline bytes keep storage_path null");
  assert.equal((await db.readDocumentBytes(doc.id)).equals(bytes), true, "bytes still there");

  // A document with no inline bytes does record an object-store path.
  const other = await db.createDocument(
    documentInput(award.id, { contentHash: "c".repeat(64) }),
  );
  const withPath = await db.updateDocument(other.id, orgA, {
    storagePath: "organizations/x/awards/y/z/file.pdf",
  });
  assert.equal(withPath.storagePath, "organizations/x/awards/y/z/file.pdf");

  assert.equal(await db.readDocumentBytes(other.id), null, "no bytes -> null");
  assert.equal(
    await db.readDocumentBytes("00000000-0000-4000-8000-00000000c0de"),
    null,
    "unknown document -> null",
  );
  await assert.rejects(
    () => db.saveDocumentBytes("00000000-0000-4000-8000-00000000c0de", bytes),
    /unknown document/,
  );
});

check("findAwardByContentHash is organisation-scoped", async () => {
  const award = await db.createAward(awardInput());
  const doc = await db.createDocument(documentInput(award.id));

  const found = await db.findAwardByContentHash(orgA, HASH);
  assert.equal(found.award.id, award.id);
  assert.equal(found.document.id, doc.id);
  assert.equal(await db.findAwardByContentHash(orgB, HASH), null, "wrong organisation -> null");
  assert.equal(await db.findAwardByContentHash(orgA, "d".repeat(64)), null, "unknown hash -> null");
});

check("createSegments mints documentId:sequence ids; listSegments orders by sequence", async () => {
  const award = await db.createAward(awardInput());
  const doc = await db.createDocument(documentInput(award.id));

  assert.deepEqual(await db.createSegments(doc.id, []), [], "empty input -> []");

  // Deliberately out of order to prove the result keeps the caller's order.
  const created = await db.createSegments(doc.id, [segmentInputs[1], segmentInputs[0]]);
  assert.deepEqual(
    created.map((s) => s.id),
    [`${doc.id}:1`, `${doc.id}:0`],
    "ids are documentId:sequence, in input order",
  );
  assert.equal(created[0].documentId, doc.id);
  assert.equal(created[0].locatorType, "page");
  assert.equal(created[1].heading, "Reporting");
  assert.equal(created[0].tokenEstimate, 14);
  assert.match(created[0].createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);

  const listed = await db.listSegments(doc.id);
  assert.deepEqual(
    listed.map((s) => s.sequence),
    [0, 1],
    "listSegments orders by sequence asc",
  );
  assert.deepEqual(listed.map((s) => s.id), [`${doc.id}:0`, `${doc.id}:1`]);
  assert.deepEqual(await db.listSegments("00000000-0000-4000-8000-00000000dddd"), []);
});

check("obligation citations can reference a derived segment id (0006)", async () => {
  const award = await db.createAward(awardInput());
  const doc = await db.createDocument(documentInput(award.id));
  const [segment] = await db.createSegments(doc.id, [segmentInputs[0]]);

  const [obligation] = await sql`
    insert into public.obligations (award_id, organization_id, category, title, description, confidence)
    values (${award.id}, ${orgA}, 'reporting', 'Quarterly report', 'Submit it', 0.9)
    returning id`;
  const [citation] = await sql`
    insert into public.obligation_citations
      (obligation_id, document_segment_id, locator_type, locator_value, excerpt, match_score)
    values (${obligation.id}, ${segment.id}, 'section', 'IV.2', 'Quarterly report', 1)
    returning document_segment_id`;
  assert.equal(citation.document_segment_id, segment.id);
});

check("createRun derives organization_id; updateRun and getLatestRun behave", async () => {
  const award = await db.createAward(awardInput());
  const doc = await db.createDocument(documentInput(award.id));

  const older = await db.createRun({
    awardId: award.id,
    documentId: doc.id,
    status: "queued",
    stage: "securing_document",
    model: null,
    promptVersion: "",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    usageMetadata: null,
  });
  assert.equal(older.awardId, award.id);
  assert.equal(older.documentId, doc.id);
  assert.equal(older.usageMetadata, null);
  assert.equal(older.completedAt, null);
  assert.equal(older.startedAt, "2026-01-01T00:00:00.000Z");
  assert.equal("organizationId" in older, false, "domain type has no organizationId");

  const [stored] = await sql`select organization_id from public.processing_runs where id = ${older.id}`;
  assert.equal(stored.organization_id, orgA, "organization_id read from the award");

  const newer = await db.createRun({
    awardId: award.id,
    documentId: doc.id,
    status: "running",
    stage: "identifying_award",
    model: null,
    promptVersion: "",
    startedAt: "2026-02-01T00:00:00.000Z",
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    usageMetadata: null,
  });

  const usage = {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    calls: 2,
    stages: { finding_obligations: { durationMs: 1200, calls: 1 } },
  };
  const updated = await db.updateRun(newer.id, {
    status: "succeeded",
    stage: "preparing_review",
    model: "claude-test",
    promptVersion: "v1",
    completedAt: "2026-02-01T00:05:00.000Z",
    usageMetadata: usage,
  });
  assert.equal(updated.status, "succeeded");
  assert.equal(updated.model, "claude-test");
  assert.equal(updated.completedAt, "2026-02-01T00:05:00.000Z");
  assert.deepEqual(updated.usageMetadata, usage, "jsonb round-trips as UsageMetadata");
  assert.equal(updated.awardId, award.id, "award_id re-pinned");

  const pinned = await db.updateRun(newer.id, {
    id: "00000000-0000-4000-8000-0000000000aa",
    awardId: "00000000-0000-4000-8000-0000000000aa",
    errorCode: "boom",
  });
  assert.equal(pinned.id, newer.id);
  assert.equal(pinned.awardId, award.id);
  assert.equal(pinned.errorCode, "boom");

  assert.deepEqual(await db.updateRun(newer.id, {}), await db.updateRun(newer.id, {}));
  assert.equal(await db.updateRun("00000000-0000-4000-8000-0000000000bb", { status: "failed" }), null);

  const latest = await db.getLatestRun(award.id);
  assert.equal(latest.id, newer.id, "latest by started_at desc");
  assert.notEqual(latest.id, older.id);
  assert.equal(await db.getLatestRun("00000000-0000-4000-8000-0000000000cc"), null);
});

check("deleteDocument is scoped and cascades segments", async () => {
  const award = await db.createAward(awardInput());
  const doc = await db.createDocument(documentInput(award.id));
  await db.createSegments(doc.id, segmentInputs);

  assert.equal(await db.deleteDocument(doc.id, orgB), false, "wrong organisation -> false");
  assert.ok(await db.getDocument(doc.id, orgA), "still there");

  assert.equal(await db.deleteDocument(doc.id, orgA), true);
  assert.equal(await db.getDocument(doc.id, orgA), null);
  assert.deepEqual(await db.listSegments(doc.id), [], "segments cascaded");
  assert.equal(await db.deleteDocument(doc.id, orgA), false, "already gone -> false");
});

check("deleteAward is scoped and every child cascades", async () => {
  const award = await db.createAward(awardInput());
  const doc = await db.createDocument(documentInput(award.id));
  await db.saveDocumentBytes(doc.id, Buffer.from("bytes"));
  const [segment] = await db.createSegments(doc.id, segmentInputs);
  await db.createRun({
    awardId: award.id,
    documentId: doc.id,
    status: "queued",
    stage: "securing_document",
    model: null,
    promptVersion: "",
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    usageMetadata: null,
  });
  const [obligation] = await sql`
    insert into public.obligations (award_id, organization_id, category, title, description, confidence)
    values (${award.id}, ${orgA}, 'reporting', 'Quarterly report', 'Submit it', 0.9)
    returning id`;
  await sql`
    insert into public.obligation_citations
      (obligation_id, document_segment_id, locator_type, locator_value, excerpt, match_score)
    values (${obligation.id}, ${segment.id}, 'section', 'IV.2', 'Quarterly report', 1)`;
  await sql`
    insert into public.reminders
      (obligation_id, organization_id, user_id, offset_days, scheduled_for, idempotency_key)
    values (${obligation.id}, ${orgA}, ${userA}, 7, now(), 'key-1')`;
  await sql`
    insert into public.exports (award_id, organization_id, format, generated_by)
    values (${award.id}, ${orgA}, 'csv', ${userA})`;
  await sql`
    insert into public.ask_exchanges (award_id, organization_id, user_id, question, answer, answer_type)
    values (${award.id}, ${orgA}, ${userA}, 'q', 'a', 'answered')`;

  assert.equal(await db.deleteAward(award.id, orgB), false, "wrong organisation -> false");
  assert.ok(await db.getAward(award.id, orgA), "award survives a wrong-organisation delete");

  assert.equal(await db.deleteAward(award.id, orgA), true);
  assert.equal(await db.getAward(award.id, orgA), null);
  assert.equal(await db.deleteAward(award.id, orgA), false, "already gone -> false");

  const counts = {};
  for (const table of [
    "documents",
    "document_segments",
    "processing_runs",
    "obligations",
    "obligation_citations",
    "reminders",
    "exports",
    "ask_exchanges",
  ]) {
    const [row] = await sql`select count(*)::int as n from ${sql(`public.${table}`)}`;
    counts[table] = row.n;
  }
  assert.deepEqual(
    counts,
    {
      documents: 0,
      document_segments: 0,
      processing_runs: 0,
      obligations: 0,
      obligation_citations: 0,
      reminders: 0,
      exports: 0,
      ask_exchanges: 0,
    },
    "every child row cascaded away",
  );
  assert.equal(await db.readDocumentBytes(doc.id), null, "document bytes went with the row");
});

/* ----------------------------------------------------------------- run -- */

let failed = 0;
for (const { name, fn } of results) {
  await reset();
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message.split("\n").join("\n       ")}`);
  }
}

await sql.end({ timeout: 5 });
console.log(failed === 0 ? `\nall ${results.length} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
