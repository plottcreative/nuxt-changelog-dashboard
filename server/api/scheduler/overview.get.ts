// server/api/scheduler/overview.get.ts
import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/mongo';
// If you have a helper, prefer it:
import { requireRole } from '../../utils/session'; // or requireAuth if you have one

function todayISODateUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD
}

export default defineEventHandler(async event => {
  // Protect this API (adjust roles to whatever your app uses)
  await requireRole(event, ['admin', 'manager']); // or await requireAuth(event)

  const db = await getDb();
  const sites = await db.collection('sites').find({}).sort({ name: 1, id: 1 }).toArray();
  const cutoff = todayISODateUTC();

  const results = await Promise.all(
    sites.map(async (s: any) => {
      const next = await db
        .collection('maintenance')
        .findOne(
          { 'site.id': s.id, 'site.env': s.env, date: { $gte: cutoff } },
          { sort: { date: 1 }, projection: { date: 1, kind: 1, labels: 1 } }
        );

      return {
        id: s.id,
        name: s.name ?? null,
        env: s.env ?? 'production',
        renewMonth: s.renewMonth ?? null,
        nextMaintenance: next?.date ?? null,

        // >>> make these visible to the dashboard <<<
        websiteUrl: s.websiteUrl ?? null,
        gitUrl: s.gitUrl ?? null,
        primaryContact: s.primaryContact ?? null,
      };
    })
  );

  // Get all maintenance items (for the dashboard overview)
  const maintenanceItems = await db.collection('maintenance').find({}).sort({ date: 1 }).toArray();

  return {
    sites: results,
    maintenance: maintenanceItems,
  };
});
