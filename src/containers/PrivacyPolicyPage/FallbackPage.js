import React from 'react';
import loadable from '@loadable/component';

const PageBuilder = loadable(() =>
  import(/* webpackChunkName: "PageBuilder" */ '../PageBuilder/PageBuilder')
);

const fallbackPrivacyPolicy = `
## 1. Responsável pelo Tratamento

A V1H é a entidade responsável pelo tratamento dos dados pessoais recolhidos através desta plataforma, em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD) e a legislação portuguesa aplicável.

## 2. Dados Recolhidos

A V1H recolhe os seguintes tipos de dados pessoais:

**Dados de registo:**
- Nome completo
- Endereço de email
- Password (armazenada de forma encriptada)

**Dados de utilização:**
- Histórico de reservas e anúncios
- Comunicações entre utilizadores na plataforma
- Avaliações e comentários

**Dados técnicos:**
- Endereço IP
- Tipo de browser e dispositivo
- Páginas visitadas e duração das visitas

## 3. Finalidade do Tratamento

Os dados pessoais recolhidos são utilizados para:

- Gerir o registo e autenticação na plataforma;
- Processar e gerir reservas entre Anfitriões e Hóspedes;
- Processar pagamentos e cobranças de comissões;
- Enviar comunicações relacionadas com a conta e reservas;
- Melhorar os serviços e a experiência do utilizador;
- Cumprir obrigações legais.

## 4. Base Legal do Tratamento

O tratamento dos dados pessoais é realizado com base em:

- **Execução contratual:** necessário para a prestação dos serviços da plataforma;
- **Consentimento:** para comunicações de marketing (quando aplicável);
- **Interesse legítimo:** para prevenção de fraude e melhoria dos serviços;
- **Obrigação legal:** para cumprimento de requisitos fiscais e legais.

## 5. Partilha de Dados

A V1H não vende dados pessoais a terceiros. Os dados podem ser partilhados com:

- **Outros utilizadores:** informações necessárias para a concretização de reservas (nome, avaliações);
- **Prestadores de serviços:** processadores de pagamento e serviços de infraestrutura tecnológica;
- **Autoridades competentes:** quando exigido por lei.

## 6. Retenção de Dados

Os dados pessoais são conservados pelo período necessário à prestação dos serviços e ao cumprimento de obrigações legais. Após o encerramento da conta, os dados são eliminados ou anonimizados, salvo quando a sua conservação seja legalmente exigida.

## 7. Direitos dos Titulares

O utilizador tem os seguintes direitos relativamente aos seus dados pessoais:

- **Acesso:** solicitar uma cópia dos dados que detemos;
- **Retificação:** corrigir dados incorretos ou incompletos;
- **Eliminação:** solicitar a eliminação dos dados ("direito a ser esquecido");
- **Portabilidade:** receber os dados em formato estruturado;
- **Oposição:** opor-se ao tratamento para determinadas finalidades;
- **Limitação:** solicitar a limitação do tratamento em determinadas circunstâncias.

Para exercer qualquer um destes direitos, contacte-nos através dos meios indicados na secção de Contacto.

## 8. Cookies

A plataforma V1H utiliza cookies para melhorar a experiência de navegação. Os cookies essenciais são necessários para o funcionamento da plataforma. O utilizador pode gerir as suas preferências de cookies nas definições do seu browser.

## 9. Segurança

A V1H adota medidas técnicas e organizacionais adequadas para proteger os dados pessoais contra acesso não autorizado, perda ou divulgação indevida, incluindo encriptação de dados e controlos de acesso.

## 10. Transferências Internacionais

Os dados pessoais são tratados dentro do Espaço Económico Europeu (EEE). Caso sejam necessárias transferências para fora do EEE, serão adotadas as salvaguardas adequadas exigidas pelo RGPD.

## 11. Autoridade de Controlo

O utilizador tem o direito de apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD), a autoridade de controlo portuguesa, caso considere que o tratamento dos seus dados viola o RGPD.

## 12. Alterações à Política

A presente Política de Privacidade pode ser atualizada periodicamente. As alterações significativas serão comunicadas por email ou através de aviso na plataforma.

## 13. Contacto

Para questões relacionadas com a proteção de dados, contacte-nos através do endereço de email disponível na página de Contacto.

*Última atualização: Abril de 2026*
`;

export const fallbackSections = {
  sections: [
    {
      sectionType: 'article',
      sectionId: 'privacy',
      appearance: { fieldType: 'customAppearance', backgroundColor: '#ffffff' },
      title: { fieldType: 'heading1', content: 'Política de Privacidade' },
      blocks: [
        {
          blockType: 'defaultBlock',
          blockId: 'privacy-content',
          text: {
            fieldType: 'markdown',
            content: fallbackPrivacyPolicy,
          },
        },
      ],
    },
  ],
  meta: {
    pageTitle: {
      fieldType: 'metaTitle',
      content: 'Política de Privacidade | V1H',
    },
    pageDescription: {
      fieldType: 'metaDescription',
      content: 'Política de Privacidade da plataforma V1H de reserva de espaços.',
    },
  },
};

const FallbackPage = props => {
  return <PageBuilder pageAssetsData={fallbackSections} {...props} />;
};

export default FallbackPage;
