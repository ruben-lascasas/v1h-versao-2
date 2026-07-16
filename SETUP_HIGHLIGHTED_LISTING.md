# Setup Guide - SectionHighlightedListing

Este guia explica como configurar o componente `SectionHighlightedListing` (espaço destacado) na página inicial.

## 📋 Pré-requisitos

- ✅ Componente já está instalado no projeto
- ✅ Sistema de featured listings está configurado
- ✅ Você tem acesso ao Sharetribe Console da sua marketplace

## 🚀 Como Configurar

### Opção 1: Configuração no Sharetribe Console (Recomendado - Produção)

#### Passo 1: Acesse o Console
1. Abra [Sharetribe Console](https://flex-console.sharetribe.com)
2. Vá até: **Content → Pages → Landing Page**
3. Clique em **"Edit"** para editar a página inicial

#### Passo 2: Adicione uma Nova Seção
1. Clique em **"Add section"** ou **"+ Add"**
2. Escolha **"Highlighted Listing"** como tipo de seção
3. Configure a seção com os seguintes campos:

#### Passo 3: Configure os Campos

**Informações Básicas:**
- **Section Name:** `Highlighted Space` (ou seu nome preferido)
- **Section ID:** `highlighted-space` (identificador único)

**Estratégia de Listagens:**
Escolha um dos dois métodos:

**Método A: Mostrar Listagem Mais Recente (Recomendado para Começar)**
- **Listing Selection:** `Newest`
- A seção vai exibir o espaço/listagem mais recente

**Método B: Mostrar Listagens Filtradas**
- **Listing Selection:** `Query String`
- **Listing Search Query:** Use um dos exemplos abaixo:
  ```
  pub_categoryLevel1=camping-and-outdoors
  price=0,50000
  pub_categoryLevel1=camping-and-outdoors&price=0,5000
  keywords=premium%20space
  ```

**Campos Opcionais (Títulos e Descrição):**
- **Title:** "Espaço em Destaque" (ou seu texto)
- **Description:** "Conheça nosso espaço mais popular"
- **Call to Action Button:** Pode ser deixado em branco

**Aparência:**
- **Background Color:** Branco `#ffffff` ou sua cor preferida
- **Text Color:** Escuro (`dark`) ou Claro (`white`)

#### Passo 4: Salve e Publique
1. Clique em **"Save"**
2. Clique em **"Publish"** para ativar as mudanças
3. Aguarde alguns segundos e atualize sua página inicial

---

### Opção 2: Teste Local (Desenvolvimento/Testing)

Se você quer testar antes de publicar no Console, você pode usar um arquivo de configuração local.

#### Passo 1: Use o Arquivo de Exemplo
Abra o arquivo: `src/config/landingPageConfigExamples.js`

Este arquivo contém exemplos prontos que você pode copiar.

#### Passo 2: Ative a Configuração Local (Temporário para Testes)

1. Abra: `src/containers/LandingPage/FallbackPage.js`

2. Localize a função `fallbackSections`:

```javascript
export const fallbackSections = error => ({
  sections: [
    // ... seções existentes
  ],
  meta: { ... }
});
```

3. Adicione uma nova seção de teste (APENAS para testes locais):

```javascript
import { highlightedListingExampleConfig } from '../../config/landingPageConfigExamples';

export const fallbackSections = error => ({
  sections: [
    highlightedListingExampleConfig,  // Adicione esta linha
    {
      sectionType: 'customMaintenance',
      sectionId: 'maintenance-mode',
      error,
    },
  ],
  meta: {
    pageTitle: {
      fieldType: 'metaTitle',
      content: 'Home page',
    },
    pageDescription: {
      fieldType: 'metaDescription',
      content: 'Home page fetch failed',
    },
  },
});
```

4. Execute o servidor:
```bash
yarn run dev
```

5. Acesse `http://localhost:3000` e verá o espaço destacado na página inicial

#### Passo 3: Remova Após Testes

Quando terminar os testes, remova a seção `highlightedListingExampleConfig` do `FallbackPage.js` antes de fazer deploy.

---

## 📝 Exemplos de Configuração

### Exemplo 1: Espaço Mais Recente
```json
{
  "sectionId": "highlighted-space",
  "sectionType": "highlightedListing",
  "title": { "fieldType": "heading", "content": "Espaço em Destaque" },
  "listingSelection": "newest"
}
```

### Exemplo 2: Espaços por Categoria
```json
{
  "sectionId": "highlighted-camping",
  "sectionType": "highlightedListing",
  "title": { "fieldType": "heading", "content": "Camping Gear Destacado" },
  "listingSelection": "queryString",
  "listingSearchQuery": "pub_categoryLevel1=camping-and-outdoors"
}
```

### Exemplo 3: Espaços Premium (Faixa de Preço)
```json
{
  "sectionId": "highlighted-premium",
  "sectionType": "highlightedListing",
  "title": { "fieldType": "heading", "content": "Premium Spaces" },
  "description": { "fieldType": "paragraph", "content": "Our most luxurious spaces" },
  "listingSelection": "queryString",
  "listingSearchQuery": "price=50000,1000000"
}
```

---

## 🎨 Personalização Avançada

### Modificar Estilos

Se você quer customizar a aparência do componente:

1. Abra: `src/containers/PageBuilder/SectionBuilder/SectionHighlightedListing/SectionHighlightedListing.module.css`

2. Modifique os valores conforme necessário:
   - `font-size`: Tamanho do título
   - `gap: 48px`: Espaçamento entre imagem e texto
   - `box-shadow`: Efeito de sombra da imagem
   - Cores, fontes, etc.

### Adicionar Mais Informações

Para mostrar mais campos (como avaliação, número de quartos, etc.):

1. Abra: `src/containers/PageBuilder/SectionBuilder/SectionHighlightedListing/SectionHighlightedListing.js`

2. Localize a seção de renderização de informações (por volta da linha 120)

3. Adicione novos campos conforme necessário

---

## ✅ Verificação

Depois de configurar, verifique se:

- ✅ A seção aparece na página inicial
- ✅ A imagem do espaço é exibida corretamente
- ✅ Título, descrição, preço e nome do autor aparecem
- ✅ O botão "View Listing" funciona e leva para a página do espaço
- ✅ O responsive design funciona em mobile
- ✅ A seção carrega rapidamente (com indicador de carregamento se necessário)

---

## 🐛 Troubleshooting

### A seção não aparece na página
- Verifique se a seção foi salva e publicada no Console
- Verifique o navegador console para erros (F12 → Console)
- Tente fazer refresh da página (Ctrl+F5)

### O espaço destacado não mostra a imagem
- Verifique se o espaço/listing tem uma imagem configurada
- Verifique se a listagem está com status "Open" (não futurada ou cancelada)

### Mostra mensagem "We couldn't find any listings"
- Nenhuma listagem corresponde aos critérios configurados
- Se usar `queryString`, verifique se há espaços/listings com essa categoria ou preço
- Tente usar `listingSelection: "newest"` para começar

### Erro no Console do Navegador
- Abra o DevTools (F12) e veja o erro específico
- Procure por avisos sobre tipos de campos inválidos
- Verifique se o `sectionId` é único na página

---

## 📚 Referências

- [Dokumentação SectionHighlightedListing](./src/containers/PageBuilder/SectionBuilder/SectionHighlightedListing/README.md)
- [Exemplos de Configuração](./src/config/landingPageConfigExamples.js)
- [Sharetribe Console Documentation](https://www.sharetribe.com/docs/how-to/pages/)
- [Marketplace API - Query Listings](https://www.sharetribe.com/api-reference/marketplace.html#query-listings)

---

## ❓ Precisa de Ajuda?

Se tiver dúvidas sobre a configuração:

1. Verifique os arquivos de exemplo fornecidos
2. Consulte a documentação oficial do Sharetribe
3. Revise o Console e verifique os nomes de campos
4. Teste localmente antes de publicar

Boa sorte! 🎉
