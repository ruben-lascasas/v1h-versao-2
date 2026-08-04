/**
 * Minimal S3-compatible client for Cloudflare R2, signed with AWS SigV4.
 *
 * Written against node's `crypto` rather than pulling in @aws-sdk: we need
 * exactly three operations (put, presigned get, delete) and the AWS SDK would
 * add ~15 MB to the server bundle for them.
 *
 * Uploads are proxied through our own API rather than sent to R2 straight from
 * the browser. That costs a little memory per request but means the bucket
 * needs no CORS rules and the credentials never leave the server.
 *
 * Required env:
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * Optional:
 *   R2_JURISDICTION — "eu" for buckets created under the EU jurisdiction.
 *     Those live behind their own endpoint; hitting the default one answers
 *     403 AccessDenied, which is easy to mistake for a credentials problem.
 */

const crypto = require('crypto');

const REGION = 'auto';
const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

const config = () => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  const jurisdiction = (process.env.R2_JURISDICTION || '').trim().toLowerCase();
  const host = jurisdiction
    ? `${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
    : `${accountId}.r2.cloudflarestorage.com`;
  return { accountId, bucket, accessKeyId, secretAccessKey, host };
};

exports.isConfigured = () => config() !== null;

const sha256Hex = data => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// RFC 3986. S3 wants every character escaped except the unreserved set, and
// `encodeURIComponent` leaves !'()* alone.
const uriEncode = str =>
  encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Object keys keep their slashes: each segment is encoded separately.
const encodeKey = key =>
  String(key)
    .split('/')
    .map(uriEncode)
    .join('/');

const amzDate = date => date.toISOString().replace(/[:-]|\.\d{3}/g, '');

const signingKey = (secret, dateStamp) => {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
};

/**
 * Upload an object. Returns the key on success.
 *
 * @param {string} key object key, e.g. "verificacoes/<userId>/identificacao-<ts>.pdf"
 * @param {Buffer} body file bytes
 * @param {string} contentType
 * @returns {Promise<string>}
 */
exports.putObject = async (key, body, contentType) => {
  const cfg = config();
  if (!cfg) throw new Error('r2-not-configured');

  const now = new Date();
  const stamp = amzDate(now);
  const dateStamp = stamp.slice(0, 8);
  const path = `/${cfg.bucket}/${encodeKey(key)}`;
  const payloadHash = sha256Hex(body);

  const canonicalHeaders =
    `content-length:${body.length}\n` +
    `content-type:${contentType}\n` +
    `host:${cfg.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${stamp}\n`;
  const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(cfg.secretAccessKey, dateStamp), stringToSign).toString('hex');

  const authorization =
    `${ALGORITHM} Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${cfg.host}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Length': String(body.length),
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': stamp,
      Authorization: authorization,
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`r2-put-failed ${response.status} ${detail.slice(0, 200)}`);
  }
  return key;
};

/**
 * Build a presigned GET URL. Used so the review panel can show a document
 * without the bucket ever being public — the link stops working on its own.
 *
 * @param {string} key
 * @param {number} expiresInSeconds
 * @returns {string}
 */
exports.getSignedUrl = (key, expiresInSeconds = 300) => {
  const cfg = config();
  if (!cfg) throw new Error('r2-not-configured');

  const now = new Date();
  const stamp = amzDate(now);
  const dateStamp = stamp.slice(0, 8);
  const path = `/${cfg.bucket}/${encodeKey(key)}`;
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const params = {
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQueryString = Object.keys(params)
    .sort()
    .map(k => `${uriEncode(k)}=${uriEncode(params[k])}`)
    .join('&');

  const canonicalRequest = [
    'GET',
    path,
    canonicalQueryString,
    `host:${cfg.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(cfg.secretAccessKey, dateStamp), stringToSign).toString('hex');

  return `https://${cfg.host}${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
};

/**
 * Delete an object. Used when a document is replaced or the account is erased,
 * so rejected/superseded identity documents don't linger.
 *
 * @param {string} key
 * @returns {Promise<boolean>} true when the object is gone
 */
exports.deleteObject = async key => {
  const cfg = config();
  if (!cfg) throw new Error('r2-not-configured');

  const now = new Date();
  const stamp = amzDate(now);
  const dateStamp = stamp.slice(0, 8);
  const path = `/${cfg.bucket}/${encodeKey(key)}`;
  const payloadHash = sha256Hex('');

  const canonicalHeaders =
    `host:${cfg.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${stamp}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = ['DELETE', path, '', canonicalHeaders, signedHeaders, payloadHash].join(
    '\n'
  );
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(cfg.secretAccessKey, dateStamp), stringToSign).toString('hex');

  const response = await fetch(`https://${cfg.host}${path}`, {
    method: 'DELETE',
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': stamp,
      Authorization:
        `${ALGORITHM} Credential=${cfg.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });

  // R2 answers 204 on success and 404 when it was already gone; both are fine.
  return response.status === 204 || response.status === 404;
};
