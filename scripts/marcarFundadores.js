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
  vagasFundador,
  contarFundadores,
  MODELS,
} = require('../server/api-util/hostCommission');

const aplicar = process.argv.includes('--aplicar');

(async () => {
  const limite = limiteFundador();
  if (limite == null) {
    console.error('A data limite em src/config/founderCampaign.json não é válida — nada a fazer.');
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

  // Do mais antigo para o mais recente: com vagas limitadas, quem chegou
  // primeiro fica com elas. Processar por outra ordem daria a condição a quem
  // se registou depois, só por acaso da paginação.
  //
  // Comparado como instante, não como texto: o SDK devolve `createdAt` já como
  // Date, e "Mon Aug 24" ordenado alfabeticamente vem antes de "Thu Aug 13".
  const instante = u => new Date(u.attributes.createdAt).getTime() || 0;
  todos.sort((a, b) => instante(a) - instante(b));

  const vagas = vagasFundador();
  let ocupadas = await contarFundadores(sdk);
  console.log(`vagas de fundador: ${ocupadas} de ${vagas} ocupadas`);
  console.log();

  const contagem = {};
  for (const u of todos) {
    const perfil = u.attributes.profile || {};
    const jaTem = perfil.metadata?.commissionModel;
    let proposto = modeloParaConta(u);
    const tipo = perfil.publicData?.userType || '(sem tipo)';
    const criado = String(u.attributes.createdAt).slice(0, 10);

    if (proposto === 'fundador' && ocupadas >= vagas) proposto = 'standard';

    let resultado;
    if (jaTem) {
      resultado = `mantém ${jaTem}`;
    } else if (!proposto) {
      resultado = 'não ganha comissão';
    } else if (aplicar) {
      // A contagem é passada adiante para não varrer os utilizadores todos a
      // cada conta — em série, quem manda é este contador.
      const gravado = await ensureCommissionModel(sdk, u, { jaMarcados: ocupadas });
      if (gravado === 'fundador') ocupadas += 1;
      resultado = `GRAVADO ${gravado}`;
    } else {
      if (proposto === 'fundador') ocupadas += 1;
      resultado = `seria ${proposto}`;
    }

    contagem[resultado.split(' ')[0]] = (contagem[resultado.split(' ')[0]] || 0) + 1;
    console.log(
      `  ${(u.attributes.email || '?').padEnd(34)} ${tipo.padEnd(22)} registo ${criado}  ->  ${resultado}`
    );
  }

  console.log();
  console.log(`vagas no fim: ${ocupadas} de ${vagas}`);

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
