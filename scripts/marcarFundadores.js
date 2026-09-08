/**
 * Marca a condição comercial das contas que já existem.
 *
 * As contas novas ficam marcadas sozinhas — o endpoint de verificação corre em
 * todas as páginas para quem tem sessão, e grava a marca no primeiro
 * carregamento a seguir ao registo. Este script é para as que se registaram
 * antes de isto existir.
 *
 * Nunca sobrepõe um modelo já gravado: quem tenha condições negociadas
 * mantém-nas, e um fundador nunca é despromovido.
 *
 * Correr:
 *   node scripts/marcarFundadores.js            (só mostra o que faria)
 *   node scripts/marcarFundadores.js --aplicar  (grava)
 */

require('dotenv').config();

const { getIntegrationSdk } = require('../server/api-util/sdk');
const {
  ensureCommissionModel,
  modeloParaConta,
  limiteFundador,
  MODELS,
} = require('../server/api-util/hostCommission');

const aplicar = process.argv.includes('--aplicar');

(async () => {
  const limite = limiteFundador();
  if (limite == null) {
    console.error('FOUNDER_COMMISSION_UNTIL não está definido — nada a fazer.');
    console.error('Sem data limite não se marca ninguém: dar 5% por engano é dinheiro perdido.');
    process.exit(1);
  }
  console.log(`data limite da condição de fundador: ${new Date(limite).toISOString()}`);
  console.log(aplicar ? 'MODO: a gravar' : 'MODO: apenas simulação (use --aplicar para gravar)');
  console.log();

  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.error('Integration SDK não configurado.');
    process.exit(1);
  }

  const todos = [];
  for (let page = 1; page <= 20; page++) {
    const res = await sdk.users.query({ page, perPage: 100 });
    const batch = res?.data?.data || [];
    todos.push(...batch);
    const totalPages = res?.data?.meta?.totalPages || 1;
    if (page >= totalPages || batch.length === 0) break;
  }

  const contagem = {};
  for (const u of todos) {
    const perfil = u.attributes.profile || {};
    const jaTem = perfil.metadata?.commissionModel;
    const proposto = modeloParaConta(u);
    const tipo = perfil.publicData?.userType || '(sem tipo)';
    const criado = String(u.attributes.createdAt).slice(0, 10);

    let resultado;
    if (jaTem) {
      resultado = `mantém ${jaTem}`;
    } else if (!proposto) {
      resultado = 'não ganha comissão';
    } else if (aplicar) {
      await ensureCommissionModel(sdk, u);
      resultado = `GRAVADO ${proposto}`;
    } else {
      resultado = `seria ${proposto}`;
    }

    contagem[resultado.split(' ')[0]] = (contagem[resultado.split(' ')[0]] || 0) + 1;
    console.log(
      `  ${(u.attributes.email || '?').padEnd(34)} ${tipo.padEnd(22)} registo ${criado}  ->  ${resultado}`
    );
  }

  console.log();
  console.log('resumo:', JSON.stringify(contagem));
  console.log();
  console.log('percentagens em vigor:');
  Object.entries(MODELS).forEach(([k, m]) =>
    console.log(`  ${k.padEnd(12)} anfitrião ${String(m.provider).padStart(2)}%  cliente ${m.customer}%`)
  );
})().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
