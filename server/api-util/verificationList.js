/**
 * Varredura das verificações pendentes.
 *
 * Vivia dentro do endpoint do painel. Passou para aqui porque o resumo diário
 * para o administrador precisa exactamente da mesma lista, e duas cópias da
 * mesma varredura acabariam por divergir — bastaria alguém corrigir um filtro
 * num sítio e não no outro para o email deixar de bater certo com o painel.
 */

const {
  STATUS,
  readDocs,
  publicShape,
  verificationUserTypes,
} = require('./verification');

// Teto deliberado: a filtragem por metadata exigiria um search schema na
// Console, por isso pagina-se e filtra-se aqui. Sem limite, uma base de
// utilizadores a crescer transformava isto numa varredura sem fim.
const MAX_USERS = 500;

/** true se o administrador ainda tem alguma coisa para decidir sobre esta pessoa. */
const temPorRever = row =>
  Object.values(row.docs || {}).some(d => d?.status === STATUS.SUBMITTED);

/**
 * Todos os utilizadores sujeitos a verificação que já submeteram alguma coisa,
 * do mais recente para o mais antigo.
 *
 * @param {Object} sdk Integration SDK
 * @returns {Promise<Array>} linhas prontas a devolver ao painel
 */
const collectVerificationRows = async sdk => {
  const collected = [];
  for (let page = 1; page <= Math.ceil(MAX_USERS / 100); page++) {
    const response = await sdk.users.query({ page, perPage: 100 });
    const batch = response?.data?.data || [];
    collected.push(...batch);
    const totalPages = response?.data?.meta?.totalPages || 1;
    if (page >= totalPages || batch.length === 0) break;
  }

  return collected
    .filter(u => verificationUserTypes().includes(u?.attributes?.profile?.publicData?.userType))
    .map(u => {
      const profile = u.attributes.profile || {};
      const verification = profile.privateData?.verification || {};
      const docs = readDocs(verification);
      const submitted = Object.values(docs).filter(d => d.status !== STATUS.MISSING);
      const lastUpload = submitted
        .map(d => d.uploadedAt)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        userId: u.id.uuid,
        displayName: profile.displayName || null,
        email: u.attributes.email || null,
        status: profile.metadata?.verificationStatus || null,
        submittedCount: submitted.length,
        // Quantos aguardam decisão agora — é este número, e não o total
        // submetido, que diz ao administrador se tem trabalho.
        pendingCount: Object.values(docs).filter(d => d.status === STATUS.SUBMITTED).length,
        lastUploadAt: lastUpload || null,
        docs: publicShape(docs),
      };
    })
    .filter(row => row.submittedCount > 0)
    .sort((a, b) => String(b.lastUploadAt || '').localeCompare(String(a.lastUploadAt || '')));
};

module.exports = { collectVerificationRows, temPorRever, MAX_USERS };
