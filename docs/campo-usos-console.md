# Campo `usos` — configuração na Console

O que um anúncio pode servir, além da categoria principal. É este campo, e só este,
que a pesquisa usa para filtrar por categoria — a árvore de categorias continua a
servir para navegação, carrosséis e apresentação do anúncio.

## Definição

| campo | valor |
|---|---|
| Field ID / key | `usos` |
| Field type | Multiple select (multi-enum) |
| Label | Usos do espaço |
| Incluir na pesquisa | sim — filtro com "has any" |
| Obrigatório | não (a categoria principal é acrescentada automaticamente ao gravar) |

## As 60 opções

O `option` tem de ser **exactamente** o id da subcategoria — é o que liga este campo à árvore.

| option | label |
|---|---|
| `salas-reuniao` | Salas de Reunião |
| `escritorios-privados` | Escritórios Privados |
| `escritorios-partilhados-coworking` | Escritórios Partilhados / Coworking |
| `consultorios-medicos-psicologia` | Consultórios Médicos e de Psicologia |
| `gab-terapias-coaching` | Gabinetes de Terapias e Coaching |
| `sala-formacao` | Salas de Formação |
| `sala-entrevista-avaliacoes` | Salas de Entrevistas ou Avaliações |
| `auditorios` | Auditórios |
| `bibliotecas` | Bibliotecas |
| `centro-estudos` | Centros de Estudos |
| `salas-aula` | Salas de Aula / Universitárias |
| `lab-salas-tecnicas` | Laboratórios / Salas Técnicas |
| `ateliers` | Ateliers de Artes Plásticas |
| `salas-musicas` | Salas de Música |
| `restaurantes-privados` | Restaurantes Privados |
| `cafes-espaco-reservavel` | Cafés com Espaço Reservável |
| `salas-showcooking` | Salas para Showcooking |
| `cozinhasprof-partilhadas` | Cozinhas Profissionais Partilhadas |
| `espaco-degustacoes` | Espaços para Degustações |
| `bares-reservaveis` | Bares Reserváveis |
| `quintas-eventos` | Quintas para Eventos |
| `saloes-festas` | Salões de Festas |
| `pavilhoes-multiusos` | Pavilhões Multiusos |
| `venues-casamentos` | Venues para Casamentos |
| `casascampo-espacorurais` | Casas de Campo / Espaços Rurais |
| `palacios-solarioshistoricos` | Palácios e Solares Históricos |
| `discotecas` | Discotecas |
| `rooftops` | Rooftops |
| `salasprivadashoteis` | Salas Privadas em Hotéis |
| `estudios-foto` | Estúdios Fotográficos |
| `estudios-video-cinema` | Estúdios de Vídeo e Cinema |
| `estudios-gravacao-musical` | Estúdios de Gravação Musical |
| `salas-ensaio` | Salas de Ensaio (Teatro, Dança, Música) |
| `espaco-exposicao-galeriasarte` | Espaços de Exposição e Galerias de Arte |
| `blackbox-estudiotecnicos` | Blackbox / Estúdios Técnicos |
| `salasyoga-pilates-medit` | Salas para Yoga, Pilates e Meditação |
| `estudio-movimento-danca` | Estúdios de Movimento e Dança |
| `ginasio-privados-boutiques` | Ginásios Privados ou Boutiques |
| `spa-salamassagem` | SPAs e Salas de Massagem |
| `sala-acunpuctura-terapidaholistica` | Salas de Acupunctura e Terapias Holísticas |
| `pav-desportivos` | Pavilhões Desportivos |
| `campofutebol-futsal` | Campos de Futebol / Futsal |
| `campos-padel-tenis` | Campos de Padel / Ténis |
| `ringue-boxe-artesmarcias` | Ringues de Boxe ou Artes Marciais |
| `piscina-cobertas-ar-livre` | Piscinas Cobertas ou ao Ar Livre |
| `centro-treinos` | Centros de Treino Funcional |
| `estadios` | Estádios |
| `jardins_quintais` | Jardins e Quintais Reserváveis |
| `terrenos_glamping_eventos` | Terrenos para Glamping ou Eventos |
| `parques_privados` | Parques Privados |
| `espacos_rurais_agricolas` | Espaços Rurais ou Agrícolas |
| `praias_privadas_rio` | Praias Privadas ou Áreas Junto ao Rio |
| `team_building_ar_livre` | Espaços para Team Building ao Ar Livre |
| `garagens_armazens` | Garagens e Armazéns |
| `estudios_contentores` | Estúdios em Contentores |
| `carros_casa_caravanas_autocarros` | Carros-casa, Caravanas ou Autocarros Estáticos |
| `capelas_igrejas_desativadas` | Capelas / Igrejas Desativadas |
| `fabricas_desativadas` | Fábricas Desativadas |
| `quarteis_edificios_historicos` | Antigos Quartéis ou Edifícios Históricos |
| `estacoes_comboio_carruagens` | Estações de Comboio ou Carruagens |

## Porquê o id e não um nome novo

Se os ids divergirem da árvore, um anúncio marcado com "Salas de Formação" nos usos
deixa de ser encontrado por quem filtra essa subcategoria — e ninguém dá por isso,
porque a pesquisa não dá erro: devolve menos resultados, e pronto.
