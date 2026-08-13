/**
 * Resumo diário das verificações à espera de decisão.
 *
 * Substitui o email que saía a cada documento submetido. Uma pessoa com quatro
 * documentos gerava quatro emails; dez anunciantes numa tarde enchiam a caixa
 * de correio com avisos que diziam todos a mesma coisa — "vai ao painel". O
 * painel é que manda, e é lá que está o trabalho; o email só precisa de dizer
 * que há trabalho, uma vez por dia.
 *
 * Nada pendente, nenhum email: um resumo vazio todas as manhãs treina quem o
 * recebe a ignorá-lo.
 *
 * Ambiente:
 *   VERIFICATION_DIGEST_CRON     por omissão "0 8 * * *" (08:00, hora do servidor)
 *   ADMIN_EMAILS                 destinatários
 *   DISABLE_VERIFICATION_DIGEST  'true' salta o agendamento
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { mailFrom } = require('../api-util/emailSender');
const { getIntegrationSdk } = require('../api-util/sdk');
const { collectVerificationRows } = require('../api-util/verificationList');
const { STATUS } = require('../api-util/verification');

const ROOT_URL = () => (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');

const destinatarios = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

const escapeHtml = str =>
  String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatarData = iso => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Lisbon',
    });
  } catch (_) {
    return iso;
  }
};

/** Há quantas horas espera o documento mais antigo desta pessoa. */
const horasDeEspera = row => {
  if (!row.lastUploadAt) return null;
  const ms = Date.now() - new Date(row.lastUploadAt).getTime();
  return Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
};

const construir = pendentes => {
  const total = pendentes.reduce((n, r) => n + r.pendingCount, 0);
  const pessoas = pendentes.length;

  // O prazo prometido ao anunciante é de 48 horas. Quem já passou disso vai
  // assinalado, para não se perder no meio da lista.
  const linhas = pendentes
    .map(r => {
      const horas = horasDeEspera(r);
      const atrasado = horas != null && horas >= 48;
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(r.displayName || '(sem nome)')}</strong><br />
          <span style="font-size:12px;color:#999;">${escapeHtml(r.email || '—')}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;">
          ${r.pendingCount}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;${
          atrasado ? 'color:#8E3220;font-weight:bold;' : 'color:#555;'
        }">
          ${formatarData(r.lastUploadAt)}${
        atrasado ? `<br /><span style="font-size:12px;">há ${horas}h — fora das 48h</span>` : ''
      }
        </td>
      </tr>`;
    })
    .join('');

  const atrasados = pendentes.filter(r => {
    const h = horasDeEspera(r);
    return h != null && h >= 48;
  }).length;

  const subject =
    `Verificações por rever: ${total} documento${total === 1 ? '' : 's'}` +
    (atrasados ? ` (${atrasados} fora do prazo)` : '');

  const html = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:24px;background:#F5F0EB;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#2E2E2E;">Verificações à espera</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.65;">
      ${total} documento${total === 1 ? '' : 's'} de ${pessoas} ${
    pessoas === 1 ? 'pessoa' : 'pessoas'
  } aguarda${total === 1 ? '' : 'm'} decisão.
      ${
        atrasados
          ? `<strong style="color:#8E3220;">${atrasados} ${
              atrasados === 1 ? 'está' : 'estão'
            } fora das 48 horas prometidas.</strong>`
          : ''
      }
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <th style="padding:8px 12px;background:#F5F0EB;text-align:left;font-size:12px;text-transform:uppercase;color:#8a8178;">Pessoa</th>
        <th style="padding:8px 12px;background:#F5F0EB;text-align:center;font-size:12px;text-transform:uppercase;color:#8a8178;">Por rever</th>
        <th style="padding:8px 12px;background:#F5F0EB;text-align:left;font-size:12px;text-transform:uppercase;color:#8a8178;">Última submissão</th>
      </tr>
      ${linhas}
    </table>
    <p style="margin:24px 0 0;">
      <a href="${ROOT_URL()}/verificacoes" style="display:inline-block;padding:12px 22px;background:#2E2E2E;
         color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;">
        Abrir painel de verificações
      </a>
    </p>
    <p style="margin:32px 0 0;font-size:12px;color:#9a938a;line-height:1.6;">
      Venue1Hub · resumo diário, enviado automaticamente. Só sai quando há algo pendente.
    </p>
  </div>
</body>
</html>`;

  return { subject, html };
};

/**
 * Uma passagem. Exportada para poder ser corrida à mão.
 * @param {Object} [opts]
 * @param {boolean} [opts.dryRun] calcula e mostra, mas não envia
 */
const runOnce = async ({ dryRun = false } = {}) => {
  const to = destinatarios();
  if (to.length === 0) {
    console.warn('[verification-digest] ADMIN_EMAILS não está configurado — nada a fazer');
    return { pendentes: 0, enviado: false };
  }

  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.warn('[verification-digest] saltado (Integration SDK não configurado)');
    return { pendentes: 0, enviado: false };
  }

  let rows;
  try {
    rows = await collectVerificationRows(sdk);
  } catch (e) {
    console.error('[verification-digest] varredura falhou:', e?.message || e);
    return { pendentes: 0, enviado: false };
  }

  const pendentes = rows.filter(r => r.pendingCount > 0);
  if (pendentes.length === 0) {
    console.log('[verification-digest] nada pendente — nenhum email enviado');
    return { pendentes: 0, enviado: false };
  }

  const { subject, html } = construir(pendentes);

  if (dryRun) {
    console.log(`[verification-digest] (dry-run) enviaria: ${subject}`);
    return { pendentes: pendentes.length, enviado: false, subject, html };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[verification-digest] RESEND_API_KEY não configurada —', subject);
    return { pendentes: pendentes.length, enviado: false };
  }

  try {
    await new Resend(apiKey).emails.send({ from: mailFrom('Verificações'), to, subject, html });
    console.log(`[verification-digest] enviado → ${to.join(', ')} | ${subject}`);
    return { pendentes: pendentes.length, enviado: true };
  } catch (e) {
    console.error('[verification-digest] envio falhou:', e?.message || e);
    return { pendentes: pendentes.length, enviado: false };
  }
};

const start = () => {
  if (process.env.DISABLE_VERIFICATION_DIGEST === 'true') {
    console.log('[verification-digest] desligado por DISABLE_VERIFICATION_DIGEST');
    return null;
  }
  const expr = process.env.VERIFICATION_DIGEST_CRON || '0 8 * * *';
  if (!cron.validate(expr)) {
    console.error(`[verification-digest] expressão cron inválida: ${expr}`);
    return null;
  }
  console.log(`[verification-digest] agendado (${expr})`);
  return cron.schedule(expr, () => {
    runOnce().catch(e => console.error('[verification-digest] tick falhou:', e?.message || e));
  });
};

module.exports = { start, runOnce, construir };
