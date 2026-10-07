/**
 * Submeter sem becos sem saída.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * O padrão do template é desactivar o botão enquanto o formulário for
 * inválido. Parece prudente e é uma armadilha: a mensagem de erro de um campo
 * só aparece depois de lhe tocarem ou de haver uma tentativa de submissão. Se
 * o campo que falta não for óbvio — porque não tem marca de obrigatório, ou
 * porque ficou fora do ecrã — o único gesto que revelaria o problema é
 * precisamente o que está bloqueado. Carrega-se, não acontece nada, e nada diz
 * porquê.
 *
 * Aconteceu em produção, na primeira etapa de criar um anúncio: dois campos
 * marcados como obrigatórios na Console, nenhum deles com marca visual, e o
 * anúncio nunca mais saía dali.
 *
 * O QUE SE FAZ EM VEZ DISSO
 *
 * O botão fica clicável. O clique corre a validação — que marca os campos como
 * tocados e põe cada erro ao lado do seu campo — e a seguir leva o cursor ao
 * primeiro que falta. Focar também faz o browser deslocar-se até lá, porque um
 * erro fora do ecrã não resolve nada.
 *
 * O botão continua desactivado quando carregar não serviria de nada: enquanto
 * grava, ou quando há um impedimento com explicação própria no ecrã (moeda
 * incompatível, por exemplo).
 */

/** Leva o cursor ao primeiro campo com erro. */
export const focarPrimeiroCampoComErro = formApi => {
  if (!formApi?.getState) return;
  const { errors } = formApi.getState();
  const primeiro = Object.keys(errors || {})[0];
  if (!primeiro || typeof document === 'undefined') return;

  // O campo pode ser um input directo, ou um grupo (caixas, selector de datas)
  // cujo nome está no contentor.
  const el =
    document.querySelector(`[name="${primeiro}"]`) ||
    document.querySelector(`[name="${primeiro}"] input`) ||
    document.getElementById(primeiro);

  if (el && typeof el.focus === 'function') {
    el.focus({ preventScroll: false });
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
};

/**
 * Embrulha o `handleSubmit` do react-final-form.
 *
 * Usar assim:  <Form onSubmit={submeterRevelandoErros(handleSubmit, formApi)}>
 */
export const submeterRevelandoErros = (handleSubmit, formApi) => e => {
  const resultado = handleSubmit(e);
  if (formApi?.getState && formApi.getState().invalid) {
    focarPrimeiroCampoComErro(formApi);
  }
  return resultado;
};
