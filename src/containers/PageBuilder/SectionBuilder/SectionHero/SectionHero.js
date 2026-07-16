import React, { useState, useEffect, useCallback } from 'react';
import classNames from 'classnames';

import { useLocale } from '../../../../context/localeContext';
import Field from '../../Field';
import { H1 } from '../../Primitives/Heading/Heading';
import HeroSearchBar from './HeroSearchBar';

import slide1Image from '../../../../assets/images/1.png';
import slide2Image from '../../../../assets/images/12.png';
import slide3Image from '../../../../assets/images/3.jpg';
import slide4Image from '../../../../assets/images/4.jpg';
import slide5Image from '../../../../assets/images/5.jpg';
import heroDecoration from '../../../../assets/images/Carrosel.png';

import css from './SectionHero.module.css';

const BLOCK_BACKGROUNDS = ['#3F3131', '#7C6350'];

const getImageUrl = imageAsset => {
  if (!imageAsset) return null;
  const variants = imageAsset?.attributes?.variants || {};
  const preferred = ['scaled-xlarge', 'scaled-large', 'scaled-2400', 'scaled-1200', 'scaled-800'];
  for (const key of preferred) {
    if (variants[key]?.url) return variants[key].url;
  }
  const keys = Object.keys(variants);
  return keys.length > 0 ? variants[keys[0]]?.url || null : null;
};

const SectionHero = props => {
  const {
    sectionId,
    className,
    rootClassName,
    defaultClasses,
    title,
    description,
    appearance,
    callToAction,
    blocks = [],
    options,
  } = props;

  const fieldComponents = options?.fieldComponents;
  const fieldOptions = { fieldComponents };

  // Replace " — " (em dash with spaces) with the given separator in
  // CMS-driven slide text so the PT copy reads more naturally.
  const fixDashes = (data, replacement = ', ') => {
    if (!data) return data;
    if (typeof data?.content === 'string') {
      return { ...data, content: data.content.replace(/\s+—\s+/g, replacement) };
    }
    return data;
  };

  // Normalize pre-1990 PT spellings ("protecção" → "proteção" etc.) coming
  // from the CMS. Preserves the first-letter case.
  const OLD_SPELLINGS = [
    // -cção / -cções (silent c)
    ['protecções', 'proteções'],
    ['protecção', 'proteção'],
    ['transacções', 'transações'],
    ['transacção', 'transação'],
    ['acções', 'ações'],
    ['acção', 'ação'],
    ['direcções', 'direções'],
    ['direcção', 'direção'],
    ['selecções', 'seleções'],
    ['selecção', 'seleção'],
    ['secções', 'seções'],
    ['secção', 'seção'],
    ['objecções', 'objeções'],
    ['objecção', 'objeção'],
    ['correcções', 'correções'],
    ['correcção', 'correção'],
    ['afecções', 'afeções'],
    ['afecção', 'afeção'],
    ['redacções', 'redações'],
    ['redacção', 'redação'],
    ['recepções', 'receções'],
    ['recepção', 'receção'],
    ['excepções', 'exceções'],
    ['excepção', 'exceção'],
    ['decepções', 'deceções'],
    ['decepção', 'deceção'],
    // -ct- (silent c)
    ['exactamente', 'exatamente'],
    ['exactos', 'exatos'],
    ['exacto', 'exato'],
    ['exacta', 'exata'],
    ['exactas', 'exatas'],
    ['exactidão', 'exatidão'],
    ['aspectos', 'aspetos'],
    ['aspecto', 'aspeto'],
    ['adopção', 'adoção'],
    // -pt- (silent p)
    ['óptimo', 'ótimo'],
    ['óptima', 'ótima'],
    ['óptimos', 'ótimos'],
    ['óptimas', 'ótimas'],
    ['óptico', 'ótico'],
    ['óptica', 'ótica'],
  ];
  const fixOldSpelling = data => {
    if (!data || typeof data?.content !== 'string') return data;
    let content = data.content;
    OLD_SPELLINGS.forEach(([oldWord, newWord]) => {
      const re = new RegExp(`\\b${oldWord}\\b`, 'gi');
      content = content.replace(re, match => {
        const isUpper = match[0] === match[0].toUpperCase();
        return isUpper ? newWord.charAt(0).toUpperCase() + newWord.slice(1) : newWord;
      });
    });
    return { ...data, content };
  };

  // Strip the trailing "Sem custos fixos / Rentabilize / Torne-se" closing
  // sentences from the hero description on the first slide.
  const stripHeroTail = data => {
    if (!data) return data;
    if (typeof data?.content === 'string') {
      const cleaned = data.content
        .replace(/\s*Sem custos fixos[^]*?Venue1Host\.?/gi, '')
        .replace(/\s*No fixed costs[^]*?Venue1Host\.?/gi, '')
        .trim();
      return { ...data, content: cleaned };
    }
    return data;
  };

  // Per-slide list of words to colorize in the description. Each entry is
  // a string (matches first occurrence) or { word, occurrence } where
  // occurrence is 1-based. Both PT and EN variants are listed and are
  // matched case-insensitively with word boundaries.
  const HIGHLIGHT_COLOR = '#BAA38A';
  const SLIDE_HIGHLIGHTS = [
    // Slide 1 (intro): no description highlights
    [],
    // Slide 2 (hero): Venue1Hub + potencial + Portugal (PT/EN)
    ['Venue1Hub', 'potencial', 'potential', 'Portugal'],
    // Slide 3 (block 0): anúncio + disponível
    ['anúncio', 'listing', 'disponível', 'available'],
    // Slide 4 (block 1): pesquisam + oferece
    ['pesquisam', 'search', 'oferece', 'offers'],
    // Slide 5 (block 2): match feminine and masculine PT forms + EN
    ['transferida', 'transferido', 'transferência', 'transferred'],
    // Slide 6 (block 3)
    ['confiança', 'trust'],
  ];

  // Title highlights — same shape as SLIDE_HIGHLIGHTS but applied to the title.
  const SLIDE_TITLE_HIGHLIGHTS = [
    [],                       // Slide 1 (intro) — uses rotating word
    ['Espaços', 'Spaces'],    // Slide 2 — colorize "Espaços" / "Spaces"
    ['Publique', 'Post'],     // Slide 3 — colorize "Publique" / "Post"
    ['Conhecer', 'Known'],    // Slide 4 — colorize "Conhecer" / "Known"
    ['Reservas', 'Pagamentos', 'Bookings', 'Payments'], // Slide 5
    ['Proteção', 'Protection'], // Slide 6
  ];

  const renderHighlighted = (content, specs) => {
    if (!content) return content;
    if (!specs || specs.length === 0) return content;

    const matches = [];
    specs.forEach(spec => {
      const word = typeof spec === 'string' ? spec : spec.word;
      const targetOccurrence = (typeof spec === 'string' ? 1 : spec.occurrence || 1);
      // Escape regex special characters in the word
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      let m;
      let count = 0;
      while ((m = re.exec(content)) !== null) {
        count++;
        if (count === targetOccurrence) {
          matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
          break;
        }
      }
    });

    if (matches.length === 0) return content;
    matches.sort((a, b) => a.start - b.start);

    const parts = [];
    let cursor = 0;
    matches.forEach((m, i) => {
      if (m.start > cursor) parts.push(content.substring(cursor, m.start));
      parts.push(
        <span
          key={`hl-${i}-${m.start}`}
          style={{
            color: HIGHLIGHT_COLOR,
            filter: 'brightness(1.35) saturate(1.25)',
          }}
        >
          {m.text}
        </span>
      );
      cursor = m.end;
    });
    if (cursor < content.length) parts.push(content.substring(cursor));
    return parts;
  };

  // Slide 0 = new intro slide (placeholder, black bg)
  // Slide 1 = hero's own content; slides 2..n = blocks from merged slideshow
  const heroBgUrl = getImageUrl(appearance?.backgroundImage);
  const slides = [
    {
      bgUrl: slide1Image,
      bgColor: appearance?.backgroundColor,
      title: null, // rendered inline below with the rotating word
      description: null,
      callToAction: null,
    },
    {
      bgUrl: slide2Image,
      bgColor: appearance?.backgroundColor,
      title: fixOldSpelling(title),
      description: fixOldSpelling(stripHeroTail(fixDashes(description))),
      callToAction,
    },
    ...blocks.map((b, i) => ({
      bgUrl:
        getImageUrl(b?.media?.image) ||
        (i === 0 ? heroBgUrl : i === 1 ? slide3Image : i === 2 ? slide4Image : i === 3 ? slide5Image : null),
      bgColor: BLOCK_BACKGROUNDS[i % BLOCK_BACKGROUNDS.length],
      title: b?.title ? fixOldSpelling({ ...b.title, fieldType: 'heading1' }) : null,
      description: fixOldSpelling(fixDashes(b?.text, i === 0 ? ': ' : ', ')),
      callToAction: b?.callToAction,
    })),
  ];

  const total = slides.length;
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState(null);

  // Rotating word for the intro slide (slide 0) — one per filter category.
  // PT entries carry gender so we can pick "o teu" vs "a tua" for the article.
  const { locale } = useLocale();
  const isPt = !locale || String(locale).toLowerCase().startsWith('pt');
  // Each PT entry has gender ('m'/'f') and number ('s'/'p') so the article
  // before the word can be "o", "a", "os" or "as". EN doesn't need this.
  const ROTATING_BY_LOCALE = {
    pt: [
      { word: 'Reunião', gender: 'f', number: 's' },            // Trabalho & Reuniões
      { word: 'Workshop', gender: 'm', number: 's' },           // Educação & Cultura
      { word: 'Jantar', gender: 'm', number: 's' },             // Gastronomia & Convívio
      { word: 'Casamento', gender: 'm', number: 's' },          // Eventos & Festas
      { word: 'Sessão Fotográfica', gender: 'f', number: 's' }, // Criatividade & Produção
      { word: 'Retiro', gender: 'm', number: 's' },             // Saúde, Bem-estar & Corpo
      { word: 'Treino', gender: 'm', number: 's' },             // Desporto & Actividade Física
      { word: 'Piquenique', gender: 'm', number: 's' },         // Espaços ao Ar Livre
      { word: 'Lançamento', gender: 'm', number: 's' },         // Espaços Inusitados & Alternativos
    ],
    en: [
      { word: 'Meeting' },
      { word: 'Workshop' },
      { word: 'Dinner' },
      { word: 'Wedding' },
      { word: 'Photoshoot' },
      { word: 'Retreat' },
      { word: 'Workout' },
      { word: 'Picnic' },
      { word: 'Launch' },
    ],
  };
  const ROTATING_WORDS = isPt ? ROTATING_BY_LOCALE.pt : ROTATING_BY_LOCALE.en;
  const ROTATING_WORD_MS = 7000;
  const [rotatingIdx, setRotatingIdx] = useState(0);
  useEffect(() => {
    if (current !== 0) return;
    const id = setInterval(
      () => setRotatingIdx(i => (i + 1) % ROTATING_WORDS.length),
      ROTATING_WORD_MS
    );
    return () => clearInterval(id);
  }, [current, ROTATING_WORDS.length]);

  const changeTo = useCallback(
    next => {
      setCurrent(c => {
        if (next === c) return c;
        setPrev(c);
        return next;
      });
    },
    []
  );

  const goPrev = useCallback(
    () => changeTo((current - 1 + total) % total),
    [changeTo, current, total]
  );
  const goNext = useCallback(
    () => changeTo((current + 1) % total),
    [changeTo, current, total]
  );

  // Bumped whenever the user interacts with the search bar on slide 0.
  // Including this in the auto-advance effect's deps restarts the countdown.
  const [interactionTick, setInteractionTick] = useState(0);
  const resetSlideTimer = useCallback(() => {
    setInteractionTick(t => t + 1);
  }, []);

  useEffect(() => {
    if (total <= 1) return;
    // Slide 0 is static — user must click to advance. Slides 1-5 auto-advance every 40s.
    if (current === 0) return;
    const id = setTimeout(() => changeTo((current + 1) % total), 40000);
    return () => clearTimeout(id);
  }, [current, total, changeTo, interactionTick]);

  // Clear the previous-slide layer once the crossfade animation is done.
  useEffect(() => {
    if (prev === null) return;
    const id = setTimeout(() => setPrev(null), 600);
    return () => clearTimeout(id);
  }, [prev, current]);

  const slide = slides[current];
  const bgStyle = slide.bgUrl
    ? { backgroundImage: `url(${slide.bgUrl})` }
    : { backgroundColor: slide.bgColor || '#BAA38A' };
  const prevSlide = prev !== null ? slides[prev] : null;
  const prevBgStyle = prevSlide
    ? prevSlide.bgUrl
      ? { backgroundImage: `url(${prevSlide.bgUrl})` }
      : { backgroundColor: prevSlide.bgColor || '#BAA38A' }
    : null;

  const showNav = total > 1;

  return (
    <section
      id={sectionId}
      className={classNames(rootClassName || css.root, className)}
    >
      {/* Clipping wrapper so the Ken Burns zoom stays within the hero bounds */}
      <div className={css.slideBgClip}>
        {/* Previous-slide layer (stays visible during crossfade) */}
        {prevSlide && (
          <div key={`bg-prev-${prev}`} className={css.slideBgPrev} style={prevBgStyle} />
        )}
        {/* Active background — fades in on top of the previous slide */}
        <div key={`bg-${current}`} className={css.slideBg} style={bgStyle} />
        {slide.bgUrl && <div className={css.slideOverlay} />}
      </div>

      <div key={`content-${current}`} className={css.slideContent}>
        <header className={defaultClasses.sectionDetails}>
          {current === 0 ? (
            (() => {
              const entry = ROTATING_WORDS[rotatingIdx];
              const word = typeof entry === 'string' ? entry : entry.word;
              // Pick the right possessive in PT based on gender + number:
              //   o seu (m,s) | a sua (f,s) | os seus (m,p) | as suas (f,p)
              const ptPossessive =
                entry?.gender === 'f'
                  ? (entry?.number === 'p' ? 'as suas' : 'a sua')
                  : (entry?.number === 'p' ? 'os seus' : 'o seu');
              const prefix = isPt
                ? `Encontre e reserve o espaço ideal para ${ptPossessive} `
                : 'Find and book the ideal space for your ';
              return (
                <H1 className={classNames(defaultClasses.title, css.introTitle)}>
                  {prefix}
                  <span
                    key={`rot-${rotatingIdx}`}
                    className={css.rotatingWord}
                    style={{
                      color: HIGHLIGHT_COLOR,
                      filter: 'brightness(1.35) saturate(1.25)',
                    }}
                  >
                    {word.split('').map((char, i) => (
                      <span
                        key={i}
                        className={css.rotatingLetter}
                        style={{ animationDelay: `${i * 0.04}s` }}
                      >
                        {char === ' ' ? ' ' : char}
                      </span>
                    ))}
                  </span>
                </H1>
              );
            })()
          ) : (() => {
            const titleSpecs = SLIDE_TITLE_HIGHLIGHTS[current];
            const titleText = typeof slide.title?.content === 'string' ? slide.title.content : null;
            if (titleText && titleSpecs && titleSpecs.length > 0) {
              return (
                <H1 className={defaultClasses.title}>
                  {renderHighlighted(titleText, titleSpecs)}
                </H1>
              );
            }
            return slide.title ? (
              <Field data={slide.title} className={defaultClasses.title} options={fieldOptions} />
            ) : null;
          })()}
          {slide.description && (
            (() => {
              const specs = SLIDE_HIGHLIGHTS[current];
              const text = typeof slide.description?.content === 'string' ? slide.description.content : null;
              if (text && specs) {
                return <p className={defaultClasses.description}>{renderHighlighted(text, specs)}</p>;
              }
              return <Field data={slide.description} className={defaultClasses.description} options={fieldOptions} />;
            })()
          )}
          {slide.callToAction && (
            <Field data={slide.callToAction} className={defaultClasses.ctaButton} options={fieldOptions} />
          )}
        </header>
        {current === 0 && <HeroSearchBar onInteract={resetSlideTimer} />}
      </div>

      <button
        className={css.arrowLeft}
        onClick={goPrev}
        disabled={!showNav}
        aria-label="Anterior"
      >
        <span>&#8249;</span>
      </button>
      <button
        className={css.arrowRight}
        onClick={goNext}
        disabled={!showNav}
        aria-label="Próximo"
      >
        <span>&#8250;</span>
      </button>

      <div className={css.dots}>
        {slides.map((_, i) => (
          <button
            key={i}
            className={classNames(css.dot, { [css.dotActive]: i === current })}
            onClick={() => setCurrent(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      <img
        src={heroDecoration}
        alt=""
        aria-hidden="true"
        className={css.heroDecoration}
      />
    </section>
  );
};

export default SectionHero;
