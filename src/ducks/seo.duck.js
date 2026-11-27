/**
 * O que foi gravado no painel SEO, por endereço.
 *
 * O servidor preenche-o antes de renderizar (server/dataLoader.js), por isso
 * chega ao browser no estado inicial e o Google vê os mesmos títulos que um
 * visitante. O painel atualiza-o depois de gravar.
 */

export const SET_SEO_PAGINAS = 'app/seo/SET_PAGINAS';

const initialState = { paginas: {} };

export default function reducer(state = initialState, action = {}) {
  switch (action.type) {
    case SET_SEO_PAGINAS:
      return { ...state, paginas: action.payload || {} };
    default:
      return state;
  }
}

export const setSeoPaginas = paginas => ({ type: SET_SEO_PAGINAS, payload: paginas });
