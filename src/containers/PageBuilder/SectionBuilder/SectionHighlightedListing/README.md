# SectionHighlightedListing

Um componente de seção para exibir um espaço em destaque com imagem grande e informações ao lado na página inicial.

## Características

- 📸 Exibe uma imagem grande em destaque
- 📝 Mostra informações do espaço ao lado (título, descrição, preço)
- 🎨 Design responsivo e chamativo
- 📱 Adapta-se a dispositivos móveis (imagem no topo, texto embaixo)
- ✨ Efeitos de hover para melhor interatividade
- 🌐 Suporta múltiplos idiomas (EN, DE, FR, ES)

## Estrutura do Componente

```
.contentWrapper
├── .imageWrapper (50% width em desktop, 100% em mobile)
│   └── ListingCard (imagem destacada com efeito hover)
└── .infoWrapper (50% width em desktop, 100% em mobile)
    └── Título, descrição, preço, autor e botão
```

## Como Usar

### 1. Adicionar na Configuração da Página (Sharetribe Console)

No Sharetribe Console, ao configurar a página inicial (landing-page), você precisa adicionar uma nova seção com:

```json
{
  "sectionId": "highlighted-space",
  "sectionType": "highlightedListing",
  "title": {
    "fieldType": "heading",
    "content": "Espaço em Destaque"
  },
  "description": {
    "fieldType": "paragraph",
    "content": "Conheça nosso espaço mais procurado"
  },
  "callToAction": {
    "fieldType": "primaryButton",
    "label": "Explorar Mais",
    "url": "/s"
  },
  "appearance": {
    "backgroundColor": "#ffffff",
    "textColor": "dark"
  }
}
```

### 2. Configurar Listagens em Destaque

O componente busca automaticamente a primeira listagem configurada para a seção através das `featuredListings`.

Certifique-se de que a seção está configurada em:
- [src/ducks/featuredListings.duck.js](../../ducks/featuredListings.duck.js)
- [src/containers/LandingPage/LandingPage.duck.js](../../LandingPage/LandingPage.duck.js)

Exemplo de configuração de listagens em destaque:

```javascript
// No arquivo de configuração de featuredListings
'landing-page': {
  'highlighted-space': {
    numListings: 1, // Carrega apenas 1 listagem
  }
}
```

## Estilos Disponíveis

### Variáveis CSS Utilizadas

O componente usa as seguintes variáveis CSS do projeto:

- `--backgroundLight` - Cor de fundo da seção de informações
- `--borderColor` - Cor da borda
- `--colorText` - Cor do texto principal
- `--colorTextSecondary` - Cor do texto secundário
- `--colorCompoundPrimary` - Cor do botão principal
- `--colorError` - Cor de erro

### Breakpoints Responsivos

- Desktop (1024px+): Imagem e texto lado a lado (50/50)
- Tablet (768px - 1023px): Imagem e texto lado a lado, gaps menores
- Mobile (<768px): Imagem em cima, texto embaixo (100% de largura)

## Estados do Componente

### Carregando
Mostra um spinner enquanto carrega a listagem.

### Erro
Exibe uma mensagem de erro caso a API falhe.

### Sucesso
Exibe a imagem e informações da listagem em destaque.

### Sem Listagens
Mostra um botão CTA para "Buscar em todos os anuncios" quando nenhuma listagem é encontrada.

## Personalizações

### Modificar Aparência

Edite o arquivo [SectionHighlightedListing.module.css](./SectionHighlightedListing.module.css):

```css
.listingTitle {
  font-size: 28px;  /* Altere o tamanho do título */
  font-weight: 600; /* Altere o peso da fonte */
}

.price {
  color: #006699;   /* Altere a cor do preço */
}
```

### Adicionar Mais Informações

Para exibir mais campos da listagem, edite [SectionHighlightedListing.js](./SectionHighlightedListing.js):

```javascript
// Exemplo: Adicionar avaliação
{listing.attributes.rating && (
  <div className={css.rating}>
    Rating: {listing.attributes.rating}
  </div>
)}
```

## Limitações Conhecidas

1. Exibe apenas a primeiro espaço/listagem configurado
2. As informações do autor mostram apenas o displayName
3. A descrição é truncada a 4 linhas em desktop e 3 linhas em mobile

## Dependências

- React
- Redux (para acessar dados de listagens em destaque)
- Componentes compartilhados: `ListingCard`, `NamedLink`, `IconSpinner`

## Próximos Passos

Para usar este componente:

1. ✅ Componente já está registrado na aplicação
2. Configure a seção no Sharetribe Console (landing-page asset)
3. Configure as listagens em destaque para a seção 'highlighted-space'
4. A seção aparecerá automaticamente na página inicial
