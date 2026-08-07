/**
 * O que cada plano desbloqueia.
 *
 * Fonte única, no servidor. O frontend nunca decide o que um plano dá: recebe a
 * lista de funcionalidades já resolvida, tal como recebe o catálogo e os
 * preços. Assim não há duas versões da regra a divergirem, e ninguém desbloqueia
 * nada mexendo no que o browser envia.
 *
 * ── Princípio de desenho ──────────────────────────────────────────────────
 * Só se põe atrás de um plano aquilo que é *novo*. Nada do que hoje está
 * disponível a todos passa a ser pago: tirar uma funcionalidade a quem já a
 * usa é uma forma segura de perder anfitriões, e nenhum plano se vende assim.
 * Por isso não constam desta lista a gestão multi-espaço nem a personalização
 * do perfil, apesar de o §8.3 os listar como benefícios do Pro e do Business —
 * existem desde sempre e são de toda a gente.
 */

const { FREE, PRO, BUSINESS, ENTERPRISE, normalisePlan } = require('./plans');

/** Ordem dos planos. Um plano dá acesso a tudo o que os abaixo dele dão. */
const RANK = {
  [FREE]: 0,
  [PRO]: 1,
  [BUSINESS]: 2,
  [ENTERPRISE]: 3,
};

/**
 * Funcionalidade → plano mínimo que a inclui.
 *
 * Acrescentar uma funcionalidade é acrescentar uma linha aqui e consultá-la
 * com `allows()`. Não há listas de planos espalhadas pelo código.
 */
const MINIMUM_PLAN = {
  // Métricas além do que o painel já mostrava a todos: ticket médio, taxa de
  // cancelamento, receita por espaço e comparação com o período anterior.
  detailedStats: PRO,
  // Resumo mensal por email.
  monthlyReports: PRO,
  // Relatórios com o detalhe por espaço e a série completa.
  advancedReports: BUSINESS,
};

const FEATURE_KEYS = Object.keys(MINIMUM_PLAN);

const rankOf = plan => RANK[normalisePlan(plan)] ?? 0;

/**
 * O plano dá acesso a esta funcionalidade?
 *
 * Uma funcionalidade desconhecida devolve false. É deliberado: um erro de
 * escrita no nome falha fechado, em vez de abrir o que não devia.
 */
const allows = (plan, feature) => {
  const required = MINIMUM_PLAN[feature];
  if (!required) return false;
  return rankOf(plan) >= rankOf(required);
};

/** Mapa completo para enviar ao frontend. */
const featuresFor = plan =>
  FEATURE_KEYS.reduce((acc, key) => ({ ...acc, [key]: allows(plan, key) }), {});

module.exports = { RANK, MINIMUM_PLAN, FEATURE_KEYS, rankOf, allows, featuresFor };
