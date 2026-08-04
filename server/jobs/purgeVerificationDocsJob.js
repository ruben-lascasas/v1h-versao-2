/**
 * Retention for anunciante verification documents.
 *
 * Identity documents are only needed while a decision is being made or is
 * being contested. Keeping them indefinitely is a liability under GDPR
 * (storage limitation), so this job deletes the files once their retention
 * window closes and leaves the decision behind.
 *
 * What survives the purge, deliberately:
 *   - the per-document status, dates and reviewer
 *   - the rejection reason
 * What goes:
 *   - the object in R2, and the key that pointed at it
 *
 * So the audit trail stays intact ("aprovado a 12 de março por X") while the
 * scan of someone's passport does not.
 *
 * Windows, in days, override via env:
 *   VERIFICATION_RETENTION_APPROVED_DAYS   default 90, counted from review
 *   VERIFICATION_RETENTION_REJECTED_DAYS   default 30, counted from review
 *   VERIFICATION_RETENTION_STALE_DAYS      default 180, for documents never
 *                                          reviewed — an abandoned submission
 *   VERIFICATION_PURGE_CRON                default "30 3 * * *"
 */

const cron = require('node-cron');
const { getIntegrationSdk } = require('../api-util/sdk');
const r2 = require('../api-util/r2');
const { STATUS, DOC_KEYS } = require('../api-util/verification');

const days = (name, fallback) => {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {number|null} retention window in ms, or null to keep the file
 */
const retentionFor = doc => {
  if (!doc?.key) return null;
  if (doc.status === STATUS.APPROVED) {
    return days('VERIFICATION_RETENTION_APPROVED_DAYS', 90) * DAY_MS;
  }
  if (doc.status === STATUS.REJECTED) {
    return days('VERIFICATION_RETENTION_REJECTED_DAYS', 30) * DAY_MS;
  }
  // Still pending: only purge if it has been sitting unreviewed for a very
  // long time, so an operator's backlog never destroys evidence they need.
  return days('VERIFICATION_RETENTION_STALE_DAYS', 180) * DAY_MS;
};

const referenceDate = doc => doc.reviewedAt || doc.uploadedAt || null;

const isExpired = (doc, now) => {
  const window = retentionFor(doc);
  const ref = referenceDate(doc);
  if (window == null || !ref) return false;
  const at = Date.parse(ref);
  return Number.isFinite(at) && now - at > window;
};

/**
 * Run the purge once. Exported so it can be triggered manually.
 *
 * @returns {Promise<{scanned:number, purged:number, failed:number}>}
 */
const runOnce = async () => {
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.error('[purgeVerificationDocs] Integration SDK not configured');
    return { scanned: 0, purged: 0, failed: 0 };
  }
  if (!r2.isConfigured()) {
    console.error('[purgeVerificationDocs] R2 not configured');
    return { scanned: 0, purged: 0, failed: 0 };
  }

  const now = Date.now();
  let scanned = 0;
  let purged = 0;
  let failed = 0;

  for (let page = 1; page <= 20; page++) {
    const response = await sdk.users.query({ page, perPage: 100 });
    const batch = response?.data?.data || [];

    for (const user of batch) {
      const profile = user.attributes?.profile || {};
      const verification = profile.privateData?.verification;
      const stored = verification?.docs;
      if (!stored) continue;

      let changed = false;
      const nextDocs = { ...stored };

      for (const docKey of DOC_KEYS) {
        const doc = stored[docKey];
        if (!doc?.key) continue;
        scanned++;
        if (!isExpired(doc, now)) continue;

        const deleted = await r2.deleteObject(doc.key).catch(err => {
          console.error(
            `[purgeVerificationDocs] delete failed for ${doc.key}:`,
            err?.message || err
          );
          return false;
        });

        if (!deleted) {
          failed++;
          continue;
        }

        // Drop the key, keep the decision.
        const { key, contentType, size, filename, ...rest } = doc;
        nextDocs[docKey] = { ...rest, purgedAt: new Date().toISOString() };
        changed = true;
        purged++;
      }

      if (changed) {
        await sdk.users.updateProfile({
          id: user.id.uuid,
          privateData: { verification: { ...verification, docs: nextDocs } },
        });
      }
    }

    const totalPages = response?.data?.meta?.totalPages || 1;
    if (page >= totalPages || batch.length === 0) break;
  }

  if (purged > 0 || failed > 0) {
    console.log(
      `[purgeVerificationDocs] scanned ${scanned}, purged ${purged}, failed ${failed}`
    );
  }
  return { scanned, purged, failed };
};

const start = () => {
  try {
    const expr = process.env.VERIFICATION_PURGE_CRON || '30 3 * * *';
    cron.schedule(expr, () => {
      runOnce().catch(e =>
        console.error('[purgeVerificationDocs] tick failed:', e?.message || e)
      );
    });
    console.log(`[purgeVerificationDocs] scheduled (cron: "${expr}")`);
  } catch (e) {
    console.error('[purgeVerificationDocs] failed to schedule:', e?.message || e);
  }
};

module.exports = { start, runOnce, isExpired, retentionFor };
