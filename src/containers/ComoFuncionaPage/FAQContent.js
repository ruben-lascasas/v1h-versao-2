import React, { useState } from 'react';

import { useLocale } from '../../context/localeContext';

import css from './FAQContent.module.css';

const FAQ_PT = [
  {
    category: 'Sobre a Venue1Hub',
    items: [
      {
        q: 'O que é a Venue1Hub?',
        a: (
          <>
            <p>
              A Venue1Hub é uma plataforma digital especializada no <strong>arrendamento de curta duração de espaços comerciais</strong> em Portugal: salas de reunião, escritórios, restaurantes, auditórios, estúdios e muito mais.
            </p>
            <p>
              Também ligamos quem reserva um espaço a <strong>Prestadores de Serviços</strong> complementares perto desse espaço — catering, limpeza, fotografia, entre outros — que pode adicionar à sua reserva.
            </p>
            <p>
              Funcionamos como intermediário digital: ligamos quem tem espaços ou serviços disponíveis a quem precisa deles para reuniões, eventos, formações, sessões fotográficas, workshops, entre outros.
            </p>
          </>
        ),
      },
      {
        q: 'Em que mercados a Venue1Hub está disponível?',
        a: (
          <>
            <p>Atualmente operamos em Portugal continental e nas regiões autónomas. Está prevista a expansão para mercados de língua portuguesa (Brasil, Angola, Moçambique).</p>
          </>
        ),
      },
      {
        q: 'A Venue1Hub é gratuita?',
        a: (
          <>
            <p>O registo e a navegação na plataforma são <strong>gratuitos</strong>. A Venue1Hub cobra apenas uma comissão sobre as reservas concluídas com sucesso (ver secção Pagamentos abaixo).</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Para quem procura espaço',
    items: [
      {
        q: 'Como reservo um espaço?',
        a: (
          <>
            <p>Em poucos passos:</p>
            <ul>
              <li>Pesquise por localização, categoria, data ou outras características</li>
              <li>Veja os detalhes, fotos e disponibilidade do espaço</li>
              <li>Selecione as datas/horas pretendidas</li>
              <li>Confirme a reserva e efetue o pagamento online com segurança</li>
              <li>Receba a confirmação e o contrato no seu email</li>
            </ul>
          </>
        ),
      },
      {
        q: 'Tenho de criar conta para reservar?',
        a: (
          <>
            <p>Sim. A criação de conta é rápida e gratuita. Pode usar email + palavra-passe ou continuar com Google. O registo permite gerir as suas reservas, comunicar com os anfitriões e guardar espaços favoritos.</p>
          </>
        ),
      },
      {
        q: 'Posso visitar o espaço antes de reservar?',
        a: (
          <>
            <p>Algumas reservas permitem visita prévia, outras não. Pode contactar o anfitrião através da plataforma para perguntar. Em alternativa, todos os anúncios incluem fotos detalhadas, descrição e regras do espaço.</p>
          </>
        ),
      },
      {
        q: 'Como contacto o anfitrião?',
        a: (
          <>
            <p>Cada anúncio tem um botão para enviar mensagem ao anfitrião. Toda a comunicação fica registada na plataforma para sua segurança. Recomendamos manter as conversas dentro da Venue1Hub.</p>
          </>
        ),
      },
      {
        q: 'Posso adicionar serviços complementares à minha reserva (catering, limpeza, fotografia...)?',
        a: (
          <>
            <p>Sim. Depois de escolher as datas do espaço, é apresentado um carrinho com os Prestadores de Serviços disponíveis perto desse espaço, que pode selecionar por checkbox. O total é atualizado à medida que adiciona ou remove serviços.</p>
            <p>Cada serviço é uma reserva e um pagamento independentes do espaço — paga o espaço primeiro e, de seguida, cada serviço selecionado, um de cada vez.</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Para quem tem espaço para arrendar',
    items: [
      {
        q: 'Posso anunciar o meu espaço gratuitamente?',
        a: (
          <>
            <p>Sim. Publicar anúncios é <strong>gratuito</strong>. A Venue1Hub só cobra uma comissão quando a reserva é concretizada; sem reservas, sem custos.</p>
          </>
        ),
      },
      {
        q: 'Que tipo de espaços posso anunciar?',
        a: (
          <>
            <p>Quase todos os espaços comerciais não residenciais. Por exemplo:</p>
            <ul>
              <li>Salas de reunião e formação</li>
              <li>Escritórios e gabinetes (psicologia, advocacia, terapias)</li>
              <li>Restaurantes, bares e zonas privativas para eventos</li>
              <li>Auditórios, galerias e estúdios</li>
              <li>Espaços ao ar livre, ginásios, espaços alternativos</li>
            </ul>
            <p>Não permitimos arrendamento residencial ou de longa duração.</p>
          </>
        ),
      },
      {
        q: 'Como começo a anunciar?',
        a: (
          <>
            <p>Crie a conta, clique em <strong>"Publicar um novo anúncio"</strong> e siga os passos: fotos, descrição, regras, preço, disponibilidade. A primeira validação é manual para garantir qualidade e costuma demorar 24-48h úteis.</p>
          </>
        ),
      },
      {
        q: 'Sou obrigado a aceitar todas as reservas?',
        a: (
          <>
            <p>Não. O anfitrião controla a sua disponibilidade e pode aceitar ou recusar reservas conforme as suas regras. Pode também configurar reserva instantânea ou apenas mediante aprovação.</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Para Prestadores de Serviços',
    items: [
      {
        q: 'O que é um Prestador de Serviços?',
        a: (
          <>
            <p>É um tipo de conta pensado para quem oferece serviços complementares a eventos — catering, limpeza, fotografia, equipamento técnico, decoração, entre outros. Cria o seu anúncio de serviço da mesma forma que um anfitrião cria o anúncio de um espaço, mas com campos próprios para a sua atividade.</p>
          </>
        ),
      },
      {
        q: 'Como crio um anúncio de serviço?',
        a: (
          <>
            <p>Registe-se como Prestador de Serviços, clique em <strong>"Publicar um novo anúncio"</strong> e escolha o tipo <strong>Serviço</strong>. Preencha a categoria (por exemplo, catering ou fotografia), descrição, preço e disponibilidade. Tal como os anúncios de espaços, a primeira validação é manual e costuma demorar 24-48h úteis.</p>
          </>
        ),
      },
      {
        q: 'Como é que os clientes encontram o meu serviço?',
        a: (
          <>
            <p>O seu serviço aparece automaticamente na secção <strong>"Serviços complementares"</strong> dos espaços perto de si, sempre que alguém está a reservar um desses espaços. Não precisa de fazer nada além de manter o anúncio atualizado — a correspondência é feita por proximidade geográfica, não por categoria.</p>
          </>
        ),
      },
      {
        q: 'Como funciona o pagamento de um serviço complementar?',
        a: (
          <>
            <p>Cada serviço é uma reserva e um pagamento independentes do espaço a que está associado — o cliente paga o espaço e, se quiser, paga o(s) serviço(s) complementar(es) em separado, através do mesmo fluxo de checkout. Recebe o pagamento da mesma forma que um anfitrião, através da Stripe (ver secção Pagamentos e comissões abaixo).</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Pagamentos e comissões',
    items: [
      {
        q: 'Quais são as taxas/comissões?',
        a: (
          <>
            <p>A Venue1Hub cobra uma comissão sobre cada reserva concretizada (tipicamente 15%, podendo variar consoante o plano e categoria). O valor é claramente apresentado antes de confirmar a reserva.</p>
          </>
        ),
      },
      {
        q: 'Como funcionam os pagamentos?',
        a: (
          <>
            <p>Os pagamentos são processados de forma segura pela <strong>Stripe</strong>. Aceitamos cartões de crédito/débito Visa, Mastercard e American Express. O valor é cobrado no momento da reserva, retido pela Venue1Hub, e transferido ao anfitrião após a conclusão da utilização.</p>
          </>
        ),
      },
      {
        q: 'Quando recebo o dinheiro como anfitrião ou prestador de serviços?',
        a: (
          <>
            <p>Após a conclusão da reserva do espaço ou do serviço, o valor (descontada a comissão) é transferido para a sua conta Stripe ligada à plataforma. O Stripe envia normalmente para o IBAN em 2-7 dias úteis.</p>
          </>
        ),
      },
      {
        q: 'É emitida fatura?',
        a: (
          <>
            <p>Sim. A Venue1Hub emite fatura/recibo da comissão cobrada. O anfitrião ou prestador de serviços é responsável por emitir a sua própria fatura ao cliente final pelo valor do arrendamento ou do serviço, conforme as obrigações fiscais aplicáveis (IRS/IRC, IVA quando devido).</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Cancelamentos e reembolsos',
    items: [
      {
        q: 'Posso cancelar uma reserva?',
        a: (
          <>
            <p>Sim. Cada anúncio tem uma política de cancelamento definida pelo anfitrião (flexível, moderada ou estrita). A política e os reembolsos aplicáveis estão claramente indicados antes de confirmar a reserva.</p>
          </>
        ),
      },
      {
        q: 'Como recebo o reembolso?',
        a: (
          <>
            <p>Reembolsos são processados automaticamente pela Stripe para o mesmo método de pagamento usado na reserva. Pode demorar 5-10 dias úteis a aparecer no seu extrato bancário, conforme o banco.</p>
          </>
        ),
      },
      {
        q: 'O anfitrião ou prestador de serviços cancelou a minha reserva. O que acontece?',
        a: (
          <>
            <p>Se a reserva for cancelada pelo anfitrião ou pelo prestador de serviços, é reembolsado a 100%. Em casos de reincidência, quem cancelou pode ser sancionado pela plataforma.</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Segurança e proteção',
    items: [
      {
        q: 'Os meus dados estão seguros?',
        a: (
          <>
            <p>Sim. A Venue1Hub cumpre o <strong>RGPD</strong>, todos os dados são armazenados em servidores na União Europeia, e os pagamentos são processados pela Stripe com encriptação ponta-a-ponta. Pode consultar a nossa <a href="/privacy-policy">Política de Privacidade</a> para mais detalhes.</p>
          </>
        ),
      },
      {
        q: 'O que faço se houver um problema com a reserva?',
        a: (
          <>
            <p>Pode utilizar a função <strong>"Denunciar"</strong> disponível em cada anúncio ou perfil para reportar problemas. Em casos de litígio, recorremos a mediação interna e, em último caso, à arbitragem oficial portuguesa (CACCL, Centro de Arbitragem de Conflitos de Consumo de Lisboa).</p>
          </>
        ),
      },
      {
        q: 'A Venue1Hub é responsável pelo espaço ou serviço reservado?',
        a: (
          <>
            <p>A Venue1Hub atua como intermediário digital. O contrato é sempre entre o cliente e o anfitrião ou prestador de serviços correspondente. Validamos os anúncios, mediamos pagamentos e oferecemos suporte, mas não somos parte do contrato. Saiba mais nos <a href="/terms-of-service">Termos de Serviço</a>.</p>
          </>
        ),
      },
      {
        q: 'Como elimino a minha conta e os meus dados?',
        a: (
          <>
            <p>Pode pedir a eliminação da sua conta a qualquer momento em <strong>Configurações da conta → Eliminar conta</strong>. A eliminação é processada nos termos do Artigo 17.º do RGPD (direito a ser esquecido), salvo quando a conservação seja exigida por lei (por exemplo, dados fiscais associados a reservas concluídas). Para qualquer dúvida sobre o processo, contacte <strong>admin@v1h.net</strong>.</p>
          </>
        ),
      },
      {
        q: 'Posso obter uma cópia dos meus dados?',
        a: (
          <>
            <p>Sim. Tem o direito de pedir uma cópia dos dados pessoais que tratamos sobre si, num formato estruturado e legível por máquina, nos termos do Artigo 20.º do RGPD (direito à portabilidade). Envie o pedido para <strong>admin@v1h.net</strong> a partir do email associado à sua conta. Respondemos no prazo máximo de 30 dias.</p>
          </>
        ),
      },
      {
        q: 'Como mudo as preferências de cookies?',
        a: (
          <>
            <p>Pode rever ou alterar a sua escolha a qualquer momento através do link <strong>"Definições de cookies"</strong> no rodapé do site. Tem mais detalhes na nossa <a href="/cookie-policy">Política de Cookies</a>.</p>
          </>
        ),
      },
      {
        q: 'Como contacto o suporte?',
        a: (
          <>
            <p>Pode contactar-nos pela página de <a href="/contact">Contacto</a> ou directamente para <strong>admin@v1h.net</strong>. Respondemos normalmente em 1-2 dias úteis.</p>
          </>
        ),
      },
    ],
  },
];

const FAQ_EN = [
  {
    category: 'About Venue1Hub',
    items: [
      {
        q: 'What is Venue1Hub?',
        a: (
          <>
            <p>
              Venue1Hub is a digital platform specialised in <strong>short-term rental of commercial spaces</strong> in Portugal: meeting rooms, offices, restaurants, auditoriums, studios and much more.
            </p>
            <p>
              We also connect anyone booking a space with nearby <strong>Service Providers</strong> — catering, cleaning, photography and more — that you can add to your booking.
            </p>
            <p>
              We act as a digital intermediary connecting people with spaces or services available to those who need them for meetings, events, training sessions, photoshoots, workshops, and more.
            </p>
          </>
        ),
      },
      {
        q: 'Where is Venue1Hub available?',
        a: (
          <>
            <p>We currently operate in mainland Portugal and the autonomous regions. Expansion to Portuguese-speaking markets (Brazil, Angola, Mozambique) is planned.</p>
          </>
        ),
      },
      {
        q: 'Is Venue1Hub free?',
        a: (
          <>
            <p>Registration and browsing are <strong>free</strong>. Venue1Hub only charges a commission on successful bookings (see Payments section below).</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'For renters',
    items: [
      {
        q: 'How do I book a space?',
        a: (
          <>
            <p>In a few steps:</p>
            <ul>
              <li>Search by location, category, date or other features</li>
              <li>View details, photos and availability</li>
              <li>Select your dates/times</li>
              <li>Confirm and pay securely online</li>
              <li>Receive confirmation and contract by email</li>
            </ul>
          </>
        ),
      },
      {
        q: 'Do I need an account to book?',
        a: (
          <>
            <p>Yes. Account creation is fast and free. Use email + password or continue with Google. Registration lets you manage bookings, message hosts and save favourite spaces.</p>
          </>
        ),
      },
      {
        q: 'Can I visit the space before booking?',
        a: (
          <>
            <p>Some bookings allow a prior visit, others do not. You can contact the host via the platform to ask. All listings include detailed photos, description and house rules.</p>
          </>
        ),
      },
      {
        q: 'How do I contact the host?',
        a: (
          <>
            <p>Each listing has a button to message the host. All communication is recorded on the platform for your safety. We recommend keeping conversations within Venue1Hub.</p>
          </>
        ),
      },
      {
        q: 'Can I add complementary services to my booking (catering, cleaning, photography...)?',
        a: (
          <>
            <p>Yes. After choosing your space dates, you'll see a cart with the Service Providers available near that space, which you can select via checkbox. The total updates as you add or remove services.</p>
            <p>Each service is its own separate booking and payment — you pay for the space first, then each selected service, one at a time.</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'For hosts',
    items: [
      {
        q: 'Can I list my space for free?',
        a: (
          <>
            <p>Yes. Listing is <strong>free</strong>. Venue1Hub only charges a commission when a booking takes place; no bookings, no costs.</p>
          </>
        ),
      },
      {
        q: 'What types of spaces can I list?',
        a: (
          <>
            <p>Almost any non-residential commercial space. For example:</p>
            <ul>
              <li>Meeting and training rooms</li>
              <li>Offices and consulting rooms (psychology, law, therapy)</li>
              <li>Restaurants, bars and private event areas</li>
              <li>Auditoriums, galleries and studios</li>
              <li>Outdoor spaces, gyms, alternative venues</li>
            </ul>
            <p>We do not allow residential or long-term rentals.</p>
          </>
        ),
      },
      {
        q: 'How do I get started?',
        a: (
          <>
            <p>Create an account, click <strong>"Publish a new listing"</strong> and follow the steps: photos, description, rules, price, availability. The first review is manual to ensure quality and typically takes 24-48 working hours.</p>
          </>
        ),
      },
      {
        q: 'Am I required to accept all bookings?',
        a: (
          <>
            <p>No. The host controls availability and can accept or decline based on their rules. You can also configure instant booking or approval-required mode.</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'For service providers',
    items: [
      {
        q: 'What is a Service Provider?',
        a: (
          <>
            <p>It's an account type for anyone offering complementary services for events — catering, cleaning, photography, technical equipment, decoration, and more. You create your service listing the same way a host creates a space listing, but with fields tailored to your activity.</p>
          </>
        ),
      },
      {
        q: 'How do I create a service listing?',
        a: (
          <>
            <p>Sign up as a Service Provider, click <strong>"Publish a new listing"</strong> and choose the <strong>Service</strong> type. Fill in the category (for example, catering or photography), description, price and availability. As with space listings, the first review is manual and typically takes 24-48 working hours.</p>
          </>
        ),
      },
      {
        q: 'How do customers find my service?',
        a: (
          <>
            <p>Your service automatically appears in the <strong>"Complementary services"</strong> section of nearby spaces, whenever someone is booking one of them. You don't need to do anything besides keeping your listing up to date — the matching is based on geographic proximity, not category.</p>
          </>
        ),
      },
      {
        q: 'How does payment for a complementary service work?',
        a: (
          <>
            <p>Each service is its own booking and payment, separate from the space it's linked to — the customer pays for the space and, if they choose to, pays for each complementary service separately, through the same checkout flow. You receive payment the same way a host does, via Stripe (see the Payments and fees section below).</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Payments and fees',
    items: [
      {
        q: 'What are the fees?',
        a: (
          <>
            <p>Venue1Hub charges a commission on each successful booking (typically 15%, may vary by plan and category). The amount is clearly shown before booking confirmation.</p>
          </>
        ),
      },
      {
        q: 'How do payments work?',
        a: (
          <>
            <p>Payments are processed securely by <strong>Stripe</strong>. We accept Visa, Mastercard and American Express credit/debit cards. Payment is collected at booking time, held by Venue1Hub, and transferred to the host after the booking is completed.</p>
          </>
        ),
      },
      {
        q: 'When do I receive payment as a host or service provider?',
        a: (
          <>
            <p>After completion of the space or service booking, the amount (minus commission) is transferred to your connected Stripe account. Stripe typically pays out to your IBAN within 2-7 business days.</p>
          </>
        ),
      },
      {
        q: 'Are invoices issued?',
        a: (
          <>
            <p>Yes. Venue1Hub issues an invoice/receipt for the commission charged. The host or service provider is responsible for issuing their own invoice to the end customer for the rental or service amount, in line with applicable tax obligations (IRS/IRC, VAT where due).</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Cancellations and refunds',
    items: [
      {
        q: 'Can I cancel a booking?',
        a: (
          <>
            <p>Yes. Each listing has a cancellation policy set by the host (flexible, moderate or strict). The policy and applicable refunds are clearly shown before confirmation.</p>
          </>
        ),
      },
      {
        q: 'How do I get my refund?',
        a: (
          <>
            <p>Refunds are processed automatically by Stripe to the original payment method. They typically take 5-10 business days to appear on your bank statement.</p>
          </>
        ),
      },
      {
        q: 'The host or service provider cancelled my booking. What happens?',
        a: (
          <>
            <p>If the host or service provider cancels, you receive a 100% refund. Repeat cancellations may result in platform sanctions.</p>
          </>
        ),
      },
    ],
  },
  {
    category: 'Safety and protection',
    items: [
      {
        q: 'Is my data safe?',
        a: (
          <>
            <p>Yes. Venue1Hub complies with <strong>GDPR</strong>, all data is stored on EU servers, and payments are processed by Stripe with end-to-end encryption. See our <a href="/privacy-policy">Privacy Policy</a> for details.</p>
          </>
        ),
      },
      {
        q: "What if there's a problem with my booking?",
        a: (
          <>
            <p>You can use the <strong>"Report"</strong> function on any listing or profile. In disputes we use internal mediation and, as a last resort, official Portuguese arbitration (CACCL, Lisbon Consumer Conflicts Arbitration Centre).</p>
          </>
        ),
      },
      {
        q: 'Is Venue1Hub responsible for the rented space or booked service?',
        a: (
          <>
            <p>Venue1Hub acts as a digital intermediary. The contract is always between the customer and the corresponding host or service provider. We validate listings, mediate payments and offer support, but are not party to the contract. Learn more in the <a href="/terms-of-service">Terms of Service</a>.</p>
          </>
        ),
      },
      {
        q: 'How do I delete my account and my data?',
        a: (
          <>
            <p>You can request the deletion of your account at any time in <strong>Account settings → Delete account</strong>. Deletion is processed under Article 17 GDPR (right to be forgotten), except where retention is legally required (for example, tax records linked to completed bookings). For any question about the process, contact <strong>admin@v1h.net</strong>.</p>
          </>
        ),
      },
      {
        q: 'Can I get a copy of my data?',
        a: (
          <>
            <p>Yes. You have the right to request a copy of the personal data we process about you, in a structured, machine-readable format, under Article 20 GDPR (right to data portability). Send the request to <strong>admin@v1h.net</strong> from the email associated with your account. We respond within 30 days at most.</p>
          </>
        ),
      },
      {
        q: 'How do I change my cookie preferences?',
        a: (
          <>
            <p>You can review or change your choice at any time via the <strong>"Cookie settings"</strong> link in the website footer. More details in our <a href="/cookie-policy">Cookie Policy</a>.</p>
          </>
        ),
      },
      {
        q: 'How do I contact support?',
        a: (
          <>
            <p>You can reach us via the <a href="/contact">Contact</a> page or directly at <strong>admin@v1h.net</strong>. We typically respond within 1-2 business days.</p>
          </>
        ),
      },
    ],
  },
];

const FAQItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={css.faqItem}>
      <button
        type="button"
        className={css.faqQuestion}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <svg className={css.faqIcon} width="14" height="14" xmlns="http://www.w3.org/2000/svg" role="none">
          <line className={css.faqIconLine} x1="0" y1="7" x2="13" y2="7" strokeWidth="2" />
          <line
            className={`${css.faqIconLine} ${css.faqIconLineVertical} ${open ? css.faqIconLineOpen : ''}`}
            x1="0"
            y1="7"
            x2="13"
            y2="7"
            strokeWidth="2"
          />
        </svg>
      </button>
      <div className={`${css.faqAnswer} ${open ? css.faqAnswerOpen : ''}`}>
        {a}
      </div>
    </div>
  );
};

const FAQContent = () => {
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const data = isEN ? FAQ_EN : FAQ_PT;

  return (
    <>
      <p className={css.intro}>
        {isEN
          ? 'Everything you need to know, all in one place.'
          : 'Tudo o que precisa de saber, num só lugar.'}
      </p>

      {data.map((category, catIdx) => (
        <div key={category.category}>
          <h2
            className={`${css.categoryTitle} ${catIdx === 0 ? css.categoryTitleFirst : ''}`}
          >
            {category.category}
          </h2>
          {category.items.map((item, idx) => (
            <FAQItem key={idx} q={item.q} a={item.a} />
          ))}
        </div>
      ))}

      <div className={css.contactBox}>
        <h3>{isEN ? 'Still have questions?' : 'Ainda tem dúvidas?'}</h3>
        {isEN ? (
          <p>
            Reach our support team at <strong>admin@v1h.net</strong> or via the{' '}
            <a href="/contact" className={css.noWrap}>Contact page</a>.
          </p>
        ) : (
          <p>
            Contacte o nosso suporte em <strong>admin@v1h.net</strong> ou através da página de{' '}
            <a href="/contact" className={css.noWrap}>Contacto</a>.
          </p>
        )}
      </div>
    </>
  );
};

export default FAQContent;
