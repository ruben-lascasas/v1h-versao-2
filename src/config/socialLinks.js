/**
 * Perfis da Venue1Hub nas redes sociais.
 *
 * Uma fonte só, pela mesma razão que a campanha de fundador passou a ter uma:
 * estes endereços estavam escritos dentro do rodapé, e quando mudaram não havia
 * onde ir buscar a lista certa. Agora quem os muda mexe aqui e mais nada.
 *
 * Servem dois sítios:
 *   - os ícones do rodapé;
 *   - o `sameAs` do schema.org em Page.js, que é como o Google percebe que
 *     estas contas e o site são da mesma organização.
 *
 * O `icone` é a chave do ficheiro de imagem no rodapé. Uma rede sem ícone
 * continua a contar para o SEO, mas não aparece no rodapé — é o que permite
 * declarar um perfil antes de haver arte para ele.
 */

export const SOCIAL_PROFILES = [
  { nome: 'Facebook', icone: 'fb', url: 'https://www.facebook.com/venue1hub.eu/' },
  { nome: 'Instagram', icone: 'inst', url: 'https://www.instagram.com/venue1hub.eu/' },
  // Sem ícone ainda: só entra no SEO. Assim que houver a arte na linha dos
  // outros cinco, basta trocar o null por 'threads' e registá-la no rodapé.
  { nome: 'Threads', icone: null, url: 'https://www.threads.com/@venue1hub.eu' },
  // O LinkedIn não veio na lista de endereços novos (2026-09-11) e ficou como
  // estava, por indicação do Rúben. Se um dia a conta mudar de nome, é aqui.
  { nome: 'LinkedIn', icone: 'lkin', url: 'https://linkedin.com/company/venue1hub' },
  { nome: 'TikTok', icone: 'tktk', url: 'https://www.tiktok.com/@venue1hub.eu' },
  { nome: 'YouTube', icone: 'yt', url: 'https://www.youtube.com/@Venue1Hub-Partner' },
  { nome: 'Pinterest', icone: null, url: 'https://pt.pinterest.com/venue1hubpartner/' },
];

/** Todos os endereços, para o `sameAs` do schema.org. */
export const socialProfileUrls = () => SOCIAL_PROFILES.map(p => p.url);
