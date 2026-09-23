/////////////////////////////////////////////////////////////////
// Botão flutuante de conversa (AnyChat)                       //
/////////////////////////////////////////////////////////////////

/**
 * O widget do AnyChat que põe o botão de contacto no canto do ecrã.
 *
 * O identificador não é segredo — vai no endereço do script que qualquer
 * visitante vê no código da página — e pode ser trocado por ambiente com
 * REACT_APP_ANYCHAT_WIDGET_ID. Fica aqui com valor por omissão para não
 * depender de uma variável na Render, que é onde o site é construído.
 */
export const anychatWidgetId =
  process.env.REACT_APP_ANYCHAT_WIDGET_ID || '61f29447-d37d-300c-88e7-b7c20cf12161';

/**
 * Exigir consentimento de "preferências" antes de carregar o widget.
 *
 * O AnyChat é um terceiro: recebe o endereço da página onde o visitante está
 * (vai no parâmetro `r` do script) e guarda estado no browser dele. Não é
 * essencial ao funcionamento do site — é uma comodidade — e por isso entra na
 * categoria de preferências, tal como a analítica entra na dela.
 *
 * Quem recusar cookies de preferências não vê o botão de conversa. Se a
 * decisão for outra — tratar o apoio ao cliente como essencial e mostrá-lo
 * sempre — muda-se isto para false e acrescenta-se a linha correspondente à
 * Política de Cookies, porque aí passa a carregar sem ser perguntado.
 */
export const anychatRequiresConsent = true;

/**
 * O endereço do script, como o AnyChat o pede.
 *
 * O parâmetro `r` leva a página onde o visitante está, que é o que permite ao
 * widget saber de onde vem a conversa. Numa aplicação de página única isso é
 * lido uma vez, no arranque: o widget não é recarregado a cada navegação.
 *
 * @param {string} widgetId
 * @param {string} href endereço actual
 * @returns {string}
 */
export const anychatScriptSrc = (widgetId, href) =>
  `https://api.anychat.one/widget/${widgetId}?r=${encodeURIComponent(href || '')}`;
