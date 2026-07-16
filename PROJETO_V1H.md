# V1H (Venue1Hub) — Estado do Projeto

**Última atualização**: 2026-05-15
**Estado**: desenvolvimento avançado em ambiente de teste Sharetribe (`v1h4-test`). Ainda **não foi para produção**.

---

## 1. O que é a V1H

V1H (Venue1Hub) é um marketplace português que liga **anfitriões** (donos de espaços) a **clientes** (organizadores de eventos, profissionais, particulares) para arrendamento de espaços por hora, dia ou longo-prazo.

**Categorias de espaços**: Trabalho & Reuniões, Educação & Cultura, Gastronomia & Convívio, Eventos & Festas, Criatividade & Produção, Saúde & Bem-estar, Desporto & Atividade Física, Espaços ao Ar Livre, Espaços Inusitados & Alternativos.

**Modelo de negócio**: comissão por reserva (via Stripe Connect).

---

## 2. Tecnologia

Construído sobre o **Sharetribe Web Template** (open-source). Stack:

- **Frontend**: React 18 + Redux Toolkit + CSS Modules
- **Backend**: Node.js + Express (renderização server-side + endpoints customizados + cron jobs)
- **Base de dados**: Sharetribe Marketplace API (gerida pela Sharetribe — não temos BD própria)
- **Pagamentos**: Stripe Connect (atualmente em modo teste)
- **Mapas**: Mapbox
- **Emails transacionais**: Resend
- **Análise**: Google Analytics 4 (test env configurado, pendente para produção)
- **Cron jobs**: `node-cron` dentro do mesmo processo Express

---

## 3. Funcionalidades implementadas

### 3.1 Anúncios (Listings)

- Criação/edição de anúncios com fotos, descrição, preço, categoria, comodidades, disponibilidade
- **Drag-to-reorder das fotos** no Edit Listing (mouse + touch)
- **URL do YouTube** como último slide da galeria (host pode adicionar vídeo do espaço)
- **Badge da categoria** sobre a imagem (clicável, abre pesquisa filtrada)
- **Botão de favorito (coração)** sobre cada card
- **Tradução automática** da descrição (botão "Traduzir" via MyMemory API)

### 3.2 Pesquisa

- Pesquisa por localização, categoria, keyword, preço, capacidade, comodidades
- **Pesquisas guardadas** (sincronizadas com Sharetribe `privateData.savedSearches`)
- **Dedup por chave canónica** — não duplica entradas mesmo que os params voláteis (mapSearch, bounds, page) mudem
- **Auto-cleanup de duplicados** ao abrir a página de pesquisas guardadas
- **Email automático** quando há novos resultados (cron 5min)
- **Toast in-app** quando há novos resultados

### 3.3 Reservas

- **Reserva única** (single booking) — flow padrão Sharetribe
- **Múltiplas reservas** (multi-booking) — várias datas/horas no mesmo pedido, com auto-aceitação (process v10 no `v1h4-test`)
- **Reserva longo-prazo** (long-term booking) — meses/anos
- **Botão "Adicionar ao calendário"** após confirmação (Google ativado; Apple+Outlook ocultos via flag `SHOW_APPLE_OUTLOOK`)
- **Lista de espera** se o espaço não estiver disponível (`/api/waitlist` + email ao admin)
- **Partilhar orçamento** (botão Share)
- **Aviso de indisponibilidade do anfitrião**
- **Dashboard do anfitrião** com stats (`/api/host-stats`)

### 3.4 Perfis de utilizador

- Edição de perfil (avatar, nome, bio, localização, redes sociais)
- **Línguas que fala** (campo com bandeiras flag-icons)
- **Tempo de resposta** (frontend auto-tracking + backfill via Integration SDK)
- **Avaliação do utilizador** — média **apenas de reviews recebidas como cliente** (decisão das chefes em 2026-05; antes era combinado host+cliente mas foi rejeitado)
- **Sistema de seguidores** (follow/unfollow + lista de seguidores no perfil)
- **Último online** ("Esteve online há Xd")
- **Sidebar do perfil** com avatar grande, estrelas, seguidores, botões de mensagem/seguir/denunciar

### 3.5 Avaliações (Reviews)

- Sistema nativo Sharetribe (após reserva concluída, ambas as partes podem rever)
- **Rating médio por listing**
- **Rating médio por utilizador** (só lado cliente — ver acima)
- **Botão "Traduzir"** em cada review

### 3.6 Notificações

#### In-app (toasts no canto inferior direito):
- **Favoritou o teu anúncio** ❤️ (poll 60s + throttle 24h por fã)
- **Começou a seguir-te** 👤+ (poll 60s + throttle 24h)
- **Nova pesquisa guardada com resultados** (check 5min)
- **Anúncio novo de quem segues** (check 5min)
- **Anúncio que segues foi editado** (cron 5min, throttle 1h) ⚡ novo
- **Anúncio que favoritaste foi editado** (cron 5min, throttle 1h) ⚡ novo
- **Recebeste avaliação** ⭐ (cron 5min) ⚡ novo
- **Anúncio que segues recebeu avaliação** (cron 5min, excluindo se a review for tua) ⚡ novo

Todos com cap de 6 visíveis em simultâneo, dismissal per-entry sincronizado entre dispositivos via `user.metadata.unseen*Alerts`.

#### Badge no topbar:
- Contagem nativa Sharetribe (sales + orders + DM novos)

#### Emails (via Resend):
- **Resumo diário de favoritos** (cron 08:00)
- **Pesquisa guardada com novos resultados** (cron 5min)
- **Recebeste avaliação** (imediato após cron tick) ⚡ novo
- **Começaram a seguir-te** (imediato após follow + throttle 24h)
- Emails nativos Sharetribe (transações, reviews) — configurados no Console deles

### 3.7 Internacionalização (i18n)

- **PT/EN toggle no topbar** — afeta todas as strings da UI
- Strings via `react-intl` (`src/translations/pt.json`, `en.json`)
- **Tradução de conteúdo gerado pelo utilizador** (descrições + reviews) via `/api/translate` (MyMemory, gratuito)
- Emails: PT/EN baseado em `user.publicData.locale` (parcialmente — ver pendências)

### 3.8 UI/UX

- **Modo escuro** (toggle topbar — `body[data-dark-mode]` global)
- **Cookie consent** (banner + modal com 4 categorias — essential/preferences/analytics/marketing)
- **PWA** (manifest + service worker; ícone "Instalar App" no footer)
- **Recently viewed** (carrossel de últimos vistos)
- **Highlighted listings** (destaques na landing)
- **Similar listings** (carrossel no fundo da página do listing)
- **Map listings** (vista mapa na pesquisa)
- **Mobile category ticker** (carrossel de categorias na topbar mobile)

### 3.9 Segurança/Denúncias

- **Reportar anúncio** (modal com razões, descrição, attachments até 5 imagens, rate limiting)
- **Reportar utilizador** (idem, com cooldowns 60s/5dia/30dias)
- **Limited Access Banner** quando admin entra como operador num user

### 3.10 Admin/Operador

- **Login-as user** (acesso operator via Integration SDK)
- **Host stats endpoint** (`/api/host-stats`)
- **Recompute listing rating** endpoint (manual reset se necessário)

---

## 4. Endpoints customizados (`server/api/`)

| Endpoint | Função |
|---|---|
| `POST /api/contact` | Formulário de contacto → email |
| `POST /api/newsletter` | Subscrever newsletter |
| `POST /api/report-listing` | Reportar anúncio |
| `POST /api/report-user` | Reportar utilizador |
| `POST /api/feedback` | NPS pós-review |
| `POST /api/recompute-listing-rating` | Admin manual |
| `GET /api/pwa-counter` + `POST /api/pwa-counter/increment` | Contador instalações PWA |
| `POST /api/waitlist` | Lista de espera de reserva |
| `GET /api/host-stats` | Stats do dashboard de anfitrião |
| `POST /api/listing-like` | Registar favorito + throttle |
| `POST /api/dismiss-favorite-alerts` | Fechar alerta de favorito |
| `POST /api/user-follow` | Registar follow + throttle + email |
| `POST /api/dismiss-follow-alerts` | Fechar alerta de seguidor |
| `POST /api/dismiss-extra-alert` | Fechar alerta extra (4 novos tipos) |
| `POST /api/translate` | Tradução via MyMemory |

---

## 5. Cron jobs (`server/jobs/`)

| Job | Frequência | Função |
|---|---|---|
| `notifySavedSearchesJob` | `*/5 * * * *` | Email "novos resultados na pesquisa" |
| `notifyFavoritesJob` | `0 8 * * *` | Resumo diário de favoritos |
| `notifyExtraAlertsJob` | `*/5 * * * *` | Detecta edits + reviews → 4 alertas |

Todos podem ser desativados via env var (`DISABLE_*`) e re-agendados com `*_CRON`.

---

## 6. Variáveis de ambiente (`.env`)

**Configuradas em teste**:
- `REACT_APP_SHARETRIBE_SDK_CLIENT_ID` / `SHARETRIBE_SDK_CLIENT_SECRET`
- `SHARETRIBE_INTEGRATION_CLIENT_ID` / `SHARETRIBE_INTEGRATION_CLIENT_SECRET`
- `REACT_APP_STRIPE_PUBLISHABLE_KEY` (test mode)
- `REACT_APP_MAPBOX_ACCESS_TOKEN`
- `REACT_APP_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `REPORTS_TO_EMAIL` / `CONTACT_RECIPIENT`
- `REACT_APP_MARKETPLACE_ROOT_URL`

**Pendentes para produção**:
- Stripe keys live
- Integration SDK creds production
- `REACT_APP_GOOGLE_ANALYTICS_ID` (GA4 `G-CE4QX3X8RV` configurado, pendente "Copy to live")

---

## 7. Pendentes para go-live

### 7.1 Legal (bloqueante — DL 7/2004 implica multa)
- Atualizar **Termos** e **Privacidade** com:
  - NIF da empresa
  - Capital social
  - Número de registo na conservatória
  - % comissão V1H
  - DPO nomeado e morada/contacto
- Verificar morada da empresa
- Atualizar tabela de cookies se adicionarem novos trackers

### 7.2 Pagamentos
- Trocar Stripe test keys por **live keys**
- Trocar Integration SDK creds para o **ambiente Live** da Sharetribe

### 7.3 Marketing
- **GA4**: clicar "Copy changes to live" no Sharetribe Console quando o site for ao ar
- **Pixels Meta/Google Ads**: bloqueado por falta de conta business com telemóvel+cartão das chefes
- **Newsletter Substack** (`venue1hub.substack.com`): adicionar link no footer

### 7.4 Suporte/Comunicação
- **Chatbot AI + handoff humano**: chefes a avaliar **AnyChat** (`app.anychat.one`) — precisa só do snippet `<script>` deles para integrar
- **Documentation.AI**: criar site de FAQ público se chefes confirmarem
- Email i18n completo: deferido até upgrade Sharetribe Plus (locale topbar não é persistido fiavelmente)

### 7.5 Mobile
- Decisão pendente: **PWA** (€0) vs **Capacitor** (€124 + Apple Developer + Google Play stores)

### 7.6 Footer
- Secção "EMPRESA" pendente — chefes precisam decidir que páginas (Imprensa / Trust & Safety / Carreiras / etc.)

---

## 8. Problemas conhecidos / workarounds

- **Sharetribe 429 (rate limit)**: conta da V1H tropeça facilmente em rate limits. Polling de notificações usa cache + throttle.
- **PWA counter file**: `server/data/pwa-counter.json` está trackeado pelo git → reseta a cada `git pull`. Solução proposta: pôr no `.gitignore` ou migrar para Sharetribe metadata.
- **Email i18n incompleto**: locale do topbar nem sempre persistido no servidor (a aguardar plano Sharetribe Plus).

---

## 9. Estrutura de pastas (highlights)

```
src/
├── ducks/                    # Redux state (favorites, follow, ratings, alerts...)
├── containers/               # Pages (ListingPage, ProfilePage, SearchPage...)
├── components/               # Reusable (Avatar, Reviews, OrderPanel...)
├── translations/             # pt.json, en.json
├── styles/                   # globais + landingDark.css (modo escuro)
├── config/                   # appConfig
├── routing/                  # routeConfiguration
└── util/                     # helpers (data, dates, currency...)

server/
├── api/                      # endpoints customizados
├── jobs/                     # cron jobs
├── api-util/                 # SDK + auth helpers
└── index.js                  # entry point Express
```

---

## 10. Decisões importantes registadas em memória (Claude Code)

- **User rating só cliente** (não combina com reviews como host) — decisão V1H 2026-05
- **Multi-booking auto-accept** (process v10)
- **Long-term booking** pronto incl. testes
- **Cookie consent** GDPR-ready (4 categorias)
- **Email i18n** deferido (Sharetribe Plus)
- **Mobile app** PWA vs Capacitor pendente
- **PWA counter** git issue pendente

---

## 11. Próximas tarefas sugeridas

1. **Decidir e integrar chatbot** (AnyChat snippet)
2. **Link Substack no footer**
3. **Documentation.AI** — criar `help.venue1hub.com` (artigos FAQ públicos)
4. **Limpar pendências legais** (Termos + Privacidade com dados completos)
5. **Decisão mobile app** (PWA vs Capacitor)
6. **Switch produção** (Stripe live + Integration SDK live + GA copy + DNS)

---

*Documento gerado a partir do código atual + memórias do projeto. Para detalhes técnicos de uma funcionalidade específica, ver os ficheiros indicados.*
