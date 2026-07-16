import { types as sdkTypes } from './sdkLoader';

const { UUID } = sdkTypes;

// Fetch the latest message createdAt per transaction id, in parallel.
// Returns a map { [txId]: isoCreatedAt }. Failures are silently skipped.
// Used to compute "last activity" for inquiry transactions, whose
// lastTransitionedAt does not advance on sdk.messages.send.
export const fetchLatestMessageTimes = async (sdk, txIds) => {
  const uniqueIds = [...new Set(txIds)];
  const results = await Promise.all(
    uniqueIds.map(id =>
      sdk.messages
        .query({
          transaction_id: new UUID(id),
          'fields.message': ['createdAt'],
          perPage: 1,
        })
        .then(resp => {
          const msgs = resp?.data?.data || [];
          let latest = null;
          msgs.forEach(m => {
            const t = m.attributes?.createdAt;
            if (t && (!latest || new Date(t) > new Date(latest))) latest = t;
          });
          return { id, createdAt: latest };
        })
        .catch(() => ({ id, createdAt: null }))
    )
  );
  return results.reduce((acc, { id, createdAt }) => {
    if (createdAt) acc[id] = createdAt;
    return acc;
  }, {});
};
