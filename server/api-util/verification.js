/**
 * Anunciante document verification — shared definitions and state helpers.
 *
 * This module is the single source of truth for which documents are required.
 * The client never hardcodes the list: it asks GET /api/verification and
 * renders whatever comes back, so changing REQUIRED_DOCS below is enough to
 * change the flow end to end.
 *
 * Where the data lives, and why:
 *
 *   privateData.verification  — the file keys and the per-document review
 *     state. Readable only by the user themselves and through the Integration
 *     API. Identity documents must never be anywhere else.
 *
 *   metadata.verificationStatus — the overall status only. User metadata is
 *     PUBLIC in Sharetribe, so it can carry a "verified host" flag later, but
 *     never a reference to a document.
 *
 * The gate itself is the postListings permission rather than the account-wide
 * pending-approval state: an anunciante waiting on review can still browse,
 * message and book as a customer. They just cannot publish.
 */

const { getIntegrationSdk } = require('./sdk');

const ANUNCIANTE_USER_TYPE = 'anunciante';

/**
 * Which user types must verify. Configurable because the Console user type ids
 * can change, and because legacy accounts can carry ids that no longer exist
 * there — a hardcoded string silently exempts them instead of failing loudly.
 *
 * VERIFICATION_USER_TYPES=anunciante,prestador_de_servicos
 */
const verificationUserTypes = () => {
  const raw = (process.env.VERIFICATION_USER_TYPES || ANUNCIANTE_USER_TYPE).trim();
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
};

/**
 * User types that may publish without verifying.
 *
 * This exists because of a trap in Console's "Restrict posting rights": once
 * it is on, every NEW user starts with postListings denied — including types
 * this flow never touches. A prestador de serviços would be blocked forever,
 * with no documents to submit that could unblock them.
 *
 * Types listed here are granted the permission once, on their first status
 * read. Anything in neither list (a visitante, say) is left denied, which is
 * the correct outcome for an account that is not meant to publish at all.
 *
 * POSTING_ALLOWED_USER_TYPES=prestador_de_servicos
 */
const postingAllowedUserTypes = () => {
  const raw = (process.env.POSTING_ALLOWED_USER_TYPES || 'prestador_de_servicos').trim();
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
};

// Marker stored in privateData so the grant below runs once per account
// instead of on every page load.
const EXEMPT_MARKER = 'isento';

const STATUS = {
  MISSING: 'em_falta',
  PENDING: 'pendente',
  APPROVED: 'aprovado',
  REJECTED: 'recusado',
};

// Overall account status, mirrored into public metadata.
const ACCOUNT_STATUS = {
  NOT_STARTED: 'nao_iniciado',
  PENDING: 'pendente',
  APPROVED: 'aprovado',
  REJECTED: 'recusado',
};

/**
 * The documents an anunciante must submit. Order here is the order shown.
 * `optionalIf` lets a document be waived — currently the company registration
 * only applies to businesses.
 */
const REQUIRED_DOCS = [
  {
    key: 'identificacao',
    label: 'Documento de identificação',
    labelEN: 'Identity document',
    hint: 'Cartão de cidadão, passaporte ou título de residência. Frente e verso legíveis.',
    hintEN: 'ID card, passport or residence permit. Both sides, clearly legible.',
  },
  {
    key: 'morada_anunciante',
    label: 'Comprovativo de morada do anunciante',
    labelEN: "Proof of the host's home address",
    hint: 'Morada de residência de quem publica o anúncio. Fatura de água, luz ou telecomunicações emitida nos últimos 6 meses.',
    hintEN:
      'Home address of the person publishing the listing. Utility bill issued within the last 6 months.',
  },
  {
    key: 'morada_espaco',
    label: 'Comprovativo de morada do espaço',
    labelEN: "Proof of the venue's address",
    hint: 'Documento que confirme a morada do espaço anunciado, emitido nos últimos 6 meses.',
    hintEN: "Document confirming the advertised venue's address, issued within the last 6 months.",
  },
  {
    key: 'titularidade',
    label: 'Comprovativo de titularidade do espaço',
    labelEN: 'Proof of venue ownership',
    hint: 'Caderneta predial, contrato de arrendamento ou autorização escrita do proprietário.',
    hintEN: 'Property record, lease agreement or written authorisation from the owner.',
  },
];

const DOC_KEYS = REQUIRED_DOCS.map(d => d.key);

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

const EXTENSION_BY_MIME = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * What the upload endpoint will actually accept, in a shape the browser and the
 * page copy can both use. Derived from the two constants above rather than
 * restated, so the limits shown to the anunciante cannot drift away from the
 * ones enforced on POST. `accept` is the MIME list itself, which also covers
 * .jpeg without having to list both spellings.
 */
const UPLOAD_LIMITS = {
  accept: ACCEPTED_MIME.join(','),
  formats: ACCEPTED_MIME.map(m => EXTENSION_BY_MIME[m].toUpperCase()),
  maxBytes: MAX_BYTES,
  maxMb: Math.round(MAX_BYTES / (1024 * 1024)),
};

const isAnunciante = user =>
  verificationUserTypes().includes(user?.attributes?.profile?.publicData?.userType);

/**
 * Normalise whatever is stored into a full per-document map, so callers never
 * have to deal with a half-filled object.
 *
 * @param {Object} verification raw privateData.verification
 * @returns {Object} { [docKey]: { status, ... } } covering every required doc
 */
const readDocs = verification => {
  const stored = verification?.docs || {};
  return DOC_KEYS.reduce((acc, key) => {
    const doc = stored[key];
    acc[key] = doc?.key
      ? { ...doc, status: doc.status || STATUS.PENDING }
      : { status: STATUS.MISSING };
    return acc;
  }, {});
};

/**
 * Overall status derived from the individual documents. Rejected wins over
 * missing: the user needs to see there is something to fix, not just something
 * to add.
 *
 * @param {Object} docs output of readDocs
 * @returns {string} one of ACCOUNT_STATUS
 */
const accountStatusFrom = docs => {
  const values = DOC_KEYS.map(k => docs[k]?.status);
  if (values.every(s => s === STATUS.APPROVED)) return ACCOUNT_STATUS.APPROVED;
  if (values.some(s => s === STATUS.REJECTED)) return ACCOUNT_STATUS.REJECTED;
  if (values.every(s => s === STATUS.MISSING)) return ACCOUNT_STATUS.NOT_STARTED;
  return ACCOUNT_STATUS.PENDING;
};

/**
 * Bring the user's postListings permission and public status flag in line with
 * their documents. Called after every change, and also whenever the status is
 * read — that makes it self-healing for accounts that existed before this
 * feature, without needing a migration.
 *
 * `appliedStatus` is what we last wrote (kept in privateData). When it already
 * matches, both API calls are skipped, so polling the status from the client
 * costs nothing.
 *
 * @param {string} userId
 * @param {Object} docs output of readDocs
 * @param {string} [appliedStatus] status last synced for this user
 * @returns {Promise<{status: string, changed: boolean}>}
 */
const syncPermissions = async (userId, docs, appliedStatus = null) => {
  const status = accountStatusFrom(docs);
  if (appliedStatus === status) {
    return { status, changed: false };
  }

  const sdk = getIntegrationSdk();
  if (!sdk) throw new Error('integration-sdk-not-configured');

  await sdk.users.updateProfile({ id: userId, metadata: { verificationStatus: status } });
  await sdk.users.updatePermissions({
    id: userId,
    postListings: status === ACCOUNT_STATUS.APPROVED ? 'permission/allow' : 'permission/deny',
  });

  return { status, changed: true };
};

/**
 * Grant postListings to a user type that publishes without verifying.
 *
 * Idempotent via the marker in privateData, so this costs one API call per
 * account ever, not one per page load.
 *
 * @param {string} userId
 * @param {string} userType
 * @param {string} [appliedStatus] marker last written for this user
 * @returns {Promise<boolean>} true when a grant was written
 */
const ensurePostingAllowed = async (userId, userType, appliedStatus = null) => {
  if (appliedStatus === EXEMPT_MARKER) return false;

  const allowed = postingAllowedUserTypes();
  // "*" means every type that isn't required to verify. Chosen deliberately:
  // with "Restrict posting rights" on, anything not granted here starts denied
  // for new accounts, and being denied with no way out is a worse failure than
  // being allowed something the UI never offers.
  const isAllowed = allowed.includes('*')
    ? !verificationUserTypes().includes(userType)
    : allowed.includes(userType);
  if (!isAllowed) return false;

  const sdk = getIntegrationSdk();
  if (!sdk) throw new Error('integration-sdk-not-configured');

  await sdk.users.updatePermissions({ id: userId, postListings: 'permission/allow' });
  return true;
};

/**
 * Build the object key for a document. Includes a timestamp so a re-upload
 * never silently overwrites the file a reviewer is looking at.
 */
const buildObjectKey = (userId, docKey, mime) =>
  `verificacoes/${userId}/${docKey}-${Date.now()}.${EXTENSION_BY_MIME[mime] || 'bin'}`;

/**
 * Shape sent to the client. Deliberately omits the R2 object key — the browser
 * has no use for it and it should not travel further than it must.
 */
const publicShape = docs =>
  REQUIRED_DOCS.map(def => {
    const doc = docs[def.key] || { status: STATUS.MISSING };
    return {
      key: def.key,
      label: def.label,
      labelEN: def.labelEN,
      hint: def.hint,
      hintEN: def.hintEN,
      status: doc.status,
      reason: doc.reason || null,
      filename: doc.filename || null,
      uploadedAt: doc.uploadedAt || null,
      reviewedAt: doc.reviewedAt || null,
    };
  });

module.exports = {
  ANUNCIANTE_USER_TYPE,
  verificationUserTypes,
  postingAllowedUserTypes,
  ensurePostingAllowed,
  EXEMPT_MARKER,
  STATUS,
  ACCOUNT_STATUS,
  REQUIRED_DOCS,
  DOC_KEYS,
  ACCEPTED_MIME,
  MAX_BYTES,
  UPLOAD_LIMITS,
  isAnunciante,
  readDocs,
  accountStatusFrom,
  syncPermissions,
  buildObjectKey,
  publicShape,
};
