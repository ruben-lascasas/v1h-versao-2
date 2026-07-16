import React from 'react';
import loadable from '@loadable/component';

const PageBuilder = loadable(() =>
  import(/* webpackChunkName: "PageBuilder" */ '../PageBuilder/PageBuilder')
);

const fallbackTerms = `
## 1. Aceitação dos Termos

Ao aceder e utilizar a plataforma V1H, o utilizador aceita ficar vinculado aos presentes Termos de Serviço. Caso não concorde com algum dos termos, deverá abster-se de utilizar a plataforma.

## 2. Descrição do Serviço

A V1H é uma plataforma de marketplace que permite a particulares e empresas anunciar, descobrir e reservar espaços para diversos fins, incluindo eventos, reuniões, ensaios, produções e outras atividades. A V1H atua como intermediária entre os proprietários de espaços ("Anfitriões") e quem procura espaços ("Hóspedes"), não sendo proprietária de nenhum dos espaços listados.

## 3. Registo e Conta

Para utilizar determinadas funcionalidades da plataforma, é necessário criar uma conta. O utilizador compromete-se a:

- Fornecer informações verdadeiras, precisas e atualizadas;
- Manter a confidencialidade das credenciais de acesso;
- Notificar imediatamente a V1H de qualquer utilização não autorizada da sua conta;
- Ser responsável por todas as atividades realizadas através da sua conta.

## 4. Publicação de Espaços (Anfitriões)

Os Anfitriões podem publicar os seus espaços na plataforma, sendo responsáveis por:

- Garantir que têm legitimidade para arrendar o espaço;
- Fornecer informações precisas e completas sobre o espaço;
- Cumprir todas as obrigações legais aplicáveis, incluindo licenciamentos;
- Manter o espaço nas condições descritas no anúncio;
- Responder atempadamente aos pedidos de reserva.

## 5. Reservas (Hóspedes)

Os Hóspedes que efetuem uma reserva comprometem-se a:

- Utilizar o espaço apenas para os fins indicados na reserva;
- Respeitar as regras do espaço definidas pelo Anfitrião;
- Deixar o espaço nas condições em que o encontraram;
- Pagar a totalidade do valor da reserva conforme acordado.

## 6. Comissões e Pagamentos

A V1H cobra uma comissão sobre as transações realizadas através da plataforma. Os valores das comissões são apresentados de forma transparente antes de cada reserva ser confirmada. Os pagamentos são processados de forma segura através dos métodos disponíveis na plataforma.

## 7. Cancelamentos

As políticas de cancelamento variam consoante cada anúncio e são definidas pelo Anfitrião. O Hóspede deverá consultar a política de cancelamento aplicável antes de efetuar a reserva. A V1H reserva-se o direito de cancelar reservas em casos de violação dos presentes Termos.

## 8. Responsabilidade

A V1H não se responsabiliza por:

- Danos ocorridos durante a utilização dos espaços;
- Incumprimento por parte de Anfitriões ou Hóspedes;
- Informações incorretas fornecidas pelos utilizadores;
- Indisponibilidade temporária da plataforma.

Os utilizadores são responsáveis por contratar os seguros adequados à utilização dos espaços.

## 9. Propriedade Intelectual

Todo o conteúdo da plataforma V1H, incluindo logótipos, textos e design, é propriedade da V1H e está protegido pela legislação aplicável em matéria de propriedade intelectual.

## 10. Alterações aos Termos

A V1H reserva-se o direito de alterar os presentes Termos de Serviço a qualquer momento. As alterações serão comunicadas aos utilizadores com antecedência razoável. A utilização continuada da plataforma após a entrada em vigor das alterações implica a aceitação dos novos termos.

## 11. Lei Aplicável

Os presentes Termos de Serviço são regidos pela lei portuguesa. Qualquer litígio emergente será submetido aos tribunais competentes em Portugal.

## 12. Contacto

Para qualquer questão relacionada com os presentes Termos, contacte-nos através do endereço de email disponível na página de Contacto.

*Última atualização: Abril de 2026*
`;

export const fallbackSections = {
  sections: [
    {
      sectionType: 'article',
      sectionId: 'terms',
      appearance: { fieldType: 'customAppearance', backgroundColor: '#ffffff' },
      title: { fieldType: 'heading1', content: 'Termos de Serviço' },
      blocks: [
        {
          blockType: 'defaultBlock',
          blockId: 'terms-content',
          text: {
            fieldType: 'markdown',
            content: fallbackTerms,
          },
        },
      ],
    },
  ],
  meta: {
    pageTitle: {
      fieldType: 'metaTitle',
      content: 'Termos de Serviço | V1H',
    },
    pageDescription: {
      fieldType: 'metaDescription',
      content: 'Termos de Serviço da plataforma V1H de reserva de espaços.',
    },
  },
};

const FallbackPage = props => {
  return <PageBuilder pageAssetsData={fallbackSections} {...props} />;
};

export default FallbackPage;
