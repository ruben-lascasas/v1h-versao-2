/**
 * Alinha a permissão de publicar com o que o Legal Gate diz.
 *
 * PORQUE É QUE ISTO É PRECISO
 *
 * A permissão só é sincronizada quando a pessoa carrega uma página com sessão
 * iniciada — é o endpoint de verificação que o faz. Quem não entrar desde que o
 * portão passou a exigir a Declaração de Conformidade continua com a permissão
 * antiga, e pode publicar apesar de o portão dizer que não.
 *
 * Para um portão jurídico, "eventualmente cumprido" é fraco: o que protege a
 * plataforma é ter a declaração ANTES de o espaço estar público, não algures
 * depois. Este script fecha essa janela de uma vez.
 *
 * Corre-se quando as regras do portão mudam. No dia-a-dia não é preciso: as
 * contas alinham-se sozinhas ao navegar.
 *
 * Correr:
 *   node scripts/sincronizarPortaoJuridico.js            (só mostra o que faria)
 *   node scripts/sincronizarPortaoJuridico.js --aplicar  (grava)
 */

require('dotenv').config();

const { getIntegrationSdk } = require('../server/api-util/sdk');
const { podePublicar, emFaltaParaPublicar } = require('../server/api-util/hostDeclaration');
const {
  readDocs,
  accountStatusFrom,
  ACCOUNT_STATUS,
  verificationUserTypes,
} = require('../server/api-util/verification');

const aplicar = process.argv.includes('--aplicar');

/** O que a permissão desta conta devia ser. */
const devidaPara = user => {
  const verification = user?.attributes?.profile?.privateData?.verification || {};
  const docs = readDocs(verification);
  const documentosOk = accountStatusFrom(docs) === ACCOUNT_STATUS.APPROVED;
  return documentosOk && podePublicar(user) ? 'permission/allow' : 'permission/deny';
};

(async () => {
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.error('Integration SDK não configurado.');
    process.exit(1);
  }

  console.log(aplicar ? 'MODO: a gravar' : 'MODO: apenas simulação (use --aplicar para gravar)');
  console.log();

  const contas = [];
  for (let page = 1; page <= 20; page++) {
    const res = await sdk.users.query({ page, perPage: 100 });
    const batch = res?.data?.data || [];
    contas.push(...batch);
    if (page >= (res?.data?.meta?.totalPages || 1) || batch.length === 0) break;
  }

  const tipos = verificationUserTypes();
  let alinhadas = 0;
  let corrigidas = 0;

  for (const u of contas) {
    const perfil = u.attributes.profile || {};
    const tipo = perfil.publicData?.userType;
    // Só as contas que o portão governa. As outras têm a permissão gerida
    // noutro sítio e mexer-lhes aqui só faria estragos.
    if (!tipos.includes(tipo)) continue;

    const atual = u.attributes.permissions?.postListings || 'permission/allow';
    const devida = devidaPara(u);
    const nome = perfil.displayName || u.id.uuid;

    if (atual === devida) {
      alinhadas++;
      continue;
    }

    const falta = emFaltaParaPublicar(u);
    const porque =
      devida === 'permission/deny'
        ? `declaração: ${falta.declaracao.length} campos · termos: ${falta.documentos.length}`
        : 'tudo em ordem';
    console.log(`  ${nome.padEnd(20)} ${atual} → ${devida}   (${porque})`);
    corrigidas++;

    if (aplicar) {
      await sdk.users.updatePermissions({ id: u.id.uuid, postListings: devida });
    }
  }

  console.log();
  console.log(
    `  ${alinhadas} já alinhadas, ${corrigidas} ${aplicar ? 'corrigidas' : 'por corrigir'}.`
  );
  if (!aplicar && corrigidas > 0) {
    console.log('  Correr outra vez com --aplicar para gravar.');
  }
})().catch(e => {
  console.error('ERRO:', e?.data || e?.message || e);
  process.exit(1);
});
