// Labels every finished conversation that has no labels yet (Jev + a short summary for vector search).
import { labelPending } from "../labeler";
import { closeDb } from "../store";

const t0 = Date.now();
const r = await labelPending(500, 10);
console.log(`Labeled ${r.labeled}/${r.pending} conversations in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await closeDb();
