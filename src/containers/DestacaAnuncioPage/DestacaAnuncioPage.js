import React, { useEffect, useRef, useState } from 'react';
import { compose } from 'redux';
import { connect, useDispatch, useSelector } from 'react-redux';
import { useLocation, useHistory } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { useLocale } from '../../context/localeContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { ensureOwnListing } from '../../util/data';
import {
  LISTING_STATE_CLOSED,
  LISTING_STATE_DRAFT,
  LISTING_STATE_PENDING_APPROVAL,
} from '../../util/types';
import {
  createSlug,
  LISTING_PAGE_PARAM_TYPE_DRAFT,
  LISTING_PAGE_DRAFT_VARIANT,
  LISTING_PAGE_PENDING_APPROVAL_VARIANT,
  LISTING_PAGE_PARAM_TYPE_EDIT,
} from '../../util/urlHelpers';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { showCreateListingLinkForUser } from '../../util/userHelpers';
import {
  selectListingRating,
  selectListingReviewCount,
  fetchListingRating,
} from '../../ducks/ratings.duck';

import {
  H3,
  Page,
  LayoutSingleColumn,
  UserNav,
  PrimaryButton,
  AspectRatioWrapper,
  ResponsiveImage,
  NamedLink,
} from '../../components';
import FavoriteButton from '../../components/FavoriteButton/FavoriteButton';
import IconReviewStar from '../../components/IconReviewStar/IconReviewStar';
import IconEdit from '../../components/IconEdit/IconEdit';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import { getOwnListingsById } from '../ManageListingsPage/ManageListingsPage.duck';
import { addHighlightedListing, featureListing, selectHighlightedListings } from '../../ducks/highlightedListings.duck';
import css from './DestacaAnuncioPage.module.css';

// ─── Card preview igual ao da landing page ────────────────────────────────────
const HighlightedPreviewCard = ({
  listing,
  currentUser,
  extraImages = [],
  editedTitle,
  setEditedTitle,
  editedDescription,
  setEditedDescription,
}) => {
  const config = useConfiguration();
  const intl = useIntl();
  const dispatch = useDispatch();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const [imgIdx, setImgIdx] = useState(0);

  const currentListing = ensureOwnListing(listing);
  const { title = '', description, price, publicData, metadata, state } =
    currentListing.attributes;

  // ── Edição inline ──
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const id = currentListing.id.uuid;
  const slug = createSlug(title);

  const averageRating = useSelector(s => selectListingRating(s, id));
  const reviewCount = useSelector(s => selectListingReviewCount(s, id));

  useEffect(() => {
    if (id && averageRating === undefined) dispatch(fetchListingRating(id));
  }, [id]);

  // ── Imagens: originais do listing + locais adicionadas pelo utilizador ──
  const listingImages = currentListing.images || [];
  const allImages = [
    ...listingImages.map(img => ({ type: 'listing', data: img })),
    ...extraImages.map(url => ({ type: 'local', data: url })),
  ];
  const totalImages = allImages.length > 0 ? allImages.length : 1;
  const currentImageEntry = allImages[imgIdx] || null;

  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } =
    config.layout.listingImage;
  const variants =
    currentImageEntry?.type === 'listing'
      ? Object.keys(currentImageEntry.data?.attributes?.variants || {}).filter(k =>
          k.startsWith(variantPrefix)
        )
      : [];

  const formattedPrice = price ? formatMoney(intl, price) : null;
  const location = publicData?.location?.address || null;

  const isDraft = state === LISTING_STATE_DRAFT;
  const isPendingApproval = state === LISTING_STATE_PENDING_APPROVAL;

  const detailLinkProps = isDraft
    ? { name: 'EditListingPage', params: { id, slug, type: LISTING_PAGE_PARAM_TYPE_DRAFT, tab: 'photos' } }
    : isPendingApproval
    ? { name: 'ListingPageVariant', params: { id, slug, variant: LISTING_PAGE_PENDING_APPROVAL_VARIANT } }
    : { name: 'ListingPage', params: { id, slug } };

  // Nome do anfitrião — vem do currentUser (é sempre o próprio utilizador)
  const hostName =
    currentUser?.attributes?.profile?.displayName ||
    currentUser?.attributes?.profile?.firstName ||
    null;
  const hostInitial = hostName ? hostName.charAt(0).toUpperCase() : '?';

  const ratingEl = (
    <div className={css.previewRatingRow}>
      <IconReviewStar
        className={averageRating != null ? css.previewRatingStar : css.previewRatingStarEmpty}
        isFilled={averageRating != null}
      />
      <span className={css.previewRatingValue}>
        {averageRating != null
          ? `${averageRating.toFixed(1)} (${reviewCount} ${
              reviewCount === 1
                ? intl.formatMessage({ id: 'ListingCard.review' })
                : intl.formatMessage({ id: 'ListingCard.reviews' })
            })`
          : intl.formatMessage({ id: 'ListingCard.noReviews' })}
      </span>
    </div>
  );

  return (
    <div className={css.previewCard}>
      {/* ─── Lado esquerdo: imagem ─── */}
      <div className={css.previewImageWrapper}>
        {currentImageEntry?.type === 'listing' ? (
          <ResponsiveImage
            rootClassName={css.previewImage}
            alt={title}
            image={currentImageEntry.data}
            variants={variants}
          />
        ) : currentImageEntry?.type === 'local' ? (
          <img
            className={css.previewImage}
            src={currentImageEntry.data}
            alt={title}
          />
        ) : (
          <div className={css.previewNoImage} />
        )}
        {/* Botão de favorito */}
        <div className={css.previewFavoriteButton}>
          <FavoriteButton listingId={id} />
        </div>
        <div className={css.previewImageOverlay}>
          {isEN ? 'Featured' : 'Em Destaque'}
        </div>
        <div className={css.previewImageNavigation}>
          <button
            className={css.previewNavArrow}
            onClick={() => setImgIdx(i => Math.max(0, i - 1))}
            disabled={imgIdx === 0}
            aria-label="Imagem anterior"
          >
            ‹
          </button>
          <span className={css.previewImageCounter}>
            {imgIdx + 1} {isEN ? 'of' : 'de'} {totalImages}
          </span>
          <button
            className={css.previewNavArrow}
            onClick={() => setImgIdx(i => Math.min(totalImages - 1, i + 1))}
            disabled={imgIdx === totalImages - 1}
            aria-label="Próxima imagem"
          >
            ›
          </button>
        </div>
      </div>

      {/* ─── Lado direito: informação ─── */}
      <div className={css.previewInfoWrapper}>
        {/* Rating + localização */}
        <div className={css.previewHeaderInfo}>
          {ratingEl}
          {location && (
            <div className={css.previewLocationBadge}>📍 {location}</div>
          )}
        </div>

        {/* Título — editável */}
        <div className={css.editableField}>
          {editingTitle ? (
            <input
              className={css.editableInput}
              value={editedTitle}
              autoFocus
              onChange={e => setEditedTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingTitle(false); }}
            />
          ) : (
            <>
              <h3 className={css.previewListingTitle}>{editedTitle || title}</h3>
              <button
                type="button"
                className={css.editIconButton}
                onClick={() => setEditingTitle(true)}
                aria-label="Editar título"
              >
                <IconEdit />
              </button>
            </>
          )}
        </div>

        {/* Comodidades (multi-enum) — antes da descrição */}
        {(() => {
          const amenityChips = (config.listing.listingFields || [])
            .filter(
              f =>
                f.schemaType === 'multi-enum' &&
                publicData &&
                publicData[f.key] &&
                publicData[f.key].length > 0
            )
            .flatMap(f =>
              (publicData[f.key] || []).map(val => {
                const opt = f.enumOptions?.find(o => o.option === val);
                return opt ? opt.label : val;
              })
            );
          return amenityChips.length > 0 ? (
            <div className={css.previewAmenityChips}>
              {amenityChips.map(chip => (
                <span key={chip} className={css.previewAmenityChip}>
                  {chip}
                </span>
              ))}
            </div>
          ) : null;
        })()}

        {/* Descrição — editável */}
        <div className={css.editableField}>
          {editingDescription ? (
            <textarea
              className={css.editableTextarea}
              value={editedDescription}
              autoFocus
              rows={4}
              onChange={e => setEditedDescription(e.target.value)}
              onBlur={() => setEditingDescription(false)}
            />
          ) : (
            <>
              {(editedDescription || description) && (
                <p className={css.previewListingDescription}>
                  {editedDescription || description}
                </p>
              )}
              <button
                type="button"
                className={css.editIconButton}
                onClick={() => setEditingDescription(true)}
                aria-label="Editar descrição"
              >
                <IconEdit />
              </button>
            </>
          )}
        </div>

        {/* Preço */}
        {formattedPrice && (
          <div className={css.previewPriceContainer}>
            <span className={css.previewPrice}>{formattedPrice}</span>
            <span className={css.previewPerUnit}>
              {(() => {
                const unitLabels = isEN
                  ? { hour: '/ hour', day: '/ day', night: '/ night' }
                  : { hour: '/ hora', day: '/ dia', night: '/ noite' };
                return unitLabels[publicData?.unitType] || (isEN ? '/ hour' : '/ hora');
              })()}
            </span>
          </div>
        )}

        {/* Anfitrião */}
        {hostName && (
          <div className={css.previewHostInfo}>
            <div className={css.previewHostAvatar}>{hostInitial}</div>
            <div className={css.previewHostDetails}>
              <span className={css.previewHostName}>{hostName}</span>
              <span className={css.previewHostVerified}>
                ✓ {isEN ? 'Verified host' : 'Anfitrião verificado'}
              </span>
            </div>
          </div>
        )}

        {/* Botões — hover igual à landing page, clique sem efeito */}
        <div className={css.previewButtonsContainer}>
          <button
            type="button"
            className={css.previewButtonPrimary}
            onClick={e => e.preventDefault()}
          >
            {isEN ? 'BOOK NOW' : 'RESERVAR AGORA'}
          </button>
          <button
            type="button"
            className={css.previewButtonSecondary}
            onClick={e => e.preventDefault()}
          >
            {isEN ? 'VIEW DETAILS' : 'VER DETALHES'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ListingSelectCard = ({ listing, onSelect }) => {
  const config = useConfiguration();
  const intl = useIntl();
  const dispatch = useDispatch();
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const currentListing = ensureOwnListing(listing);
  const { title = '', price, state, publicData } = currentListing.attributes;
  const id = currentListing.id.uuid;

  const highlightedListings = useSelector(selectHighlightedListings);
  const isHighlighted = highlightedListings.some(h => h.id === id);

  const [showAlreadyMsg, setShowAlreadyMsg] = useState(false);

  const averageRating = useSelector(s => selectListingRating(s, id));
  const reviewCount = useSelector(s => selectListingReviewCount(s, id));
  useEffect(() => {
    if (id && averageRating === undefined) dispatch(fetchListingRating(id));
  }, [id]);

  const firstImage =
    currentListing.images && currentListing.images.length > 0
      ? currentListing.images[0]
      : null;

  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } =
    config.layout.listingImage;

  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants || {}).filter(k =>
        k.startsWith(variantPrefix)
      )
    : [];

  const formattedPrice = price ? formatMoney(intl, price) : null;

  // Extract a short city label from the listing's stored address.
  const rawAddress = publicData?.location?.address || publicData?.city || null;
  const extractCity = addr => {
    if (!addr) return null;
    const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const candidate = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return candidate.replace(/^\d{4}-\d{3}\s+/, '').replace(/^\d+\s+/, '').trim();
  };
  const cityLabel = extractCity(rawAddress);

  const handleCardClick = () => {
    if (isHighlighted) {
      setShowAlreadyMsg(true);
      setTimeout(() => setShowAlreadyMsg(false), 3000);
    } else {
      onSelect(listing);
    }
  };

  return (
    <div
      className={isHighlighted ? css.selectCardHighlighted : css.selectCard}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') handleCardClick();
      }}
    >
      <div className={css.selectCardImageWrapper}>
        {firstImage ? (
          <AspectRatioWrapper className={css.selectCardAspectRatio} width={aspectWidth} height={aspectHeight}>
            <ResponsiveImage
              rootClassName={css.selectCardImage}
              alt={title}
              image={firstImage}
              variants={variants}
            />
          </AspectRatioWrapper>
        ) : (
          <AspectRatioWrapper className={css.selectCardAspectRatio} width={aspectWidth} height={aspectHeight}>
            <div className={css.noImage} />
          </AspectRatioWrapper>
        )}
        {showAlreadyMsg && (
          <div className={css.alreadyHighlightedMsg}>
            {isEN ? 'This listing is already featured' : 'Este anúncio já está em destaque'}
          </div>
        )}
      </div>
      <div className={css.selectCardInfo}>
        <div className={css.selectCardPriceRow}>
          {formattedPrice && (
            <span className={css.selectCardPrice}>{formattedPrice}</span>
          )}
        </div>
        <div className={css.selectCardTitle}>{title}</div>
        <div className={css.selectCardLocationRow}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            className={css.selectCardLocationIcon}
          >
            <path
              fill={cityLabel ? '#e53935' : '#bbb'}
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
            />
          </svg>
          <span className={cityLabel ? css.selectCardLocationCity : css.selectCardLocationCityMissing}>
            {cityLabel || intl.formatMessage({ id: 'ManageListingCard.noCity' })}
          </span>
        </div>
        <div className={css.selectCardRatingRow}>
          <IconReviewStar
            className={averageRating != null ? css.selectCardRatingStar : css.selectCardRatingStarEmpty}
            isFilled={averageRating != null}
          />
          <span className={css.selectCardRatingValue}>
            {averageRating != null
              ? `${averageRating.toFixed(1)} (${reviewCount} ${
                  reviewCount === 1
                    ? intl.formatMessage({ id: 'ListingCard.review' })
                    : intl.formatMessage({ id: 'ListingCard.reviews' })
                })`
              : intl.formatMessage({ id: 'ListingCard.noReviews' })}
          </span>
        </div>
        {isHighlighted ? (
          <span
            className={css.selectCardEditarDestaque}
            onClick={e => { e.stopPropagation(); onSelect(listing); }}
          >
            <IconEdit className={css.selectCardEditarIcon} />
            <FormattedMessage id="ManageListingCard.editarDestaque" />
          </span>
        ) : null}
      </div>
    </div>
  );
};

// ── Payment section ───────────────────────────────────────────────────────────

const FEATURING_PRICE = '9,99 €';

const cardStyles = {
  base: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", Helvetica, Arial, sans-serif',
    fontSize: typeof window !== 'undefined' && window.innerWidth < 768 ? '14px' : '16px',
    fontSmoothing: 'antialiased',
    lineHeight: '24px',
    color: '#111',
    '::placeholder': { color: '#aab7c4' },
  },
  invalid: { color: '#e53935' },
};

const PaymentSection = ({ cardRef, cardError, setCardError, setCardComplete, isEN }) => {
  const cardContainerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Stripe || !cardContainerRef.current) return;
    const publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) return;

    const stripe = window.Stripe(publishableKey);
    const elements = stripe.elements({
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css?family=Inter' }],
    });
    const card = elements.create('card', { style: cardStyles });
    card.mount(cardContainerRef.current);
    card.addEventListener('change', e => {
      setCardError(e.error ? e.error.message : null);
      setCardComplete(!!e.complete);
    });
    cardRef.current = { card, stripe };

    return () => {
      card.unmount();
      cardRef.current = null;
    };
  }, []);

  return (
    <div className={css.paymentSection}>
      <h4 className={css.paymentSectionTitle}>
        {isEN ? 'Payment method' : 'Método de pagamento'}
      </h4>
      <div className={css.paymentPriceRow}>
        <span className={css.paymentPriceLabel}>
          {isEN ? 'Featuring fee' : 'Taxa de destaque'}
        </span>
        <span className={css.paymentPriceValue}>
          {FEATURING_PRICE}
          <span className={css.paymentPricePeriod}> {isEN ? '/ month' : '/ mês'}</span>
        </span>
      </div>
      <div className={css.paymentCardWrapper}>
        <label className={css.paymentLabel}>
          {isEN ? 'Payment card details' : 'Dados do cartão'}
        </label>
        <div className={css.stripeCardElement} ref={cardContainerRef} />
        {cardError && <p className={css.paymentError}>{cardError}</p>}
      </div>
    </div>
  );
};

const HIGHLIGHTED_SECTION_ID = 'highlighted-space';

// Scroll suave e lento com easing personalizado
const smoothScrollToElement = (elementId, duration = 2400) => {
  // Começa sempre do topo
  window.scrollTo(0, 0);

  // Aguarda um frame para garantir que o topo foi aplicado
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(elementId);
      if (!el) return;

      const targetY = el.getBoundingClientRect().top + window.scrollY;
      const startY = 0;
      const distance = targetY - startY;
      let startTime = null;

      // Easing ease-in-out cúbico — começa devagar, acelera a meio, termina devagar
      const easeInOutCubic = t =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const step = timestamp => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        window.scrollTo(0, startY + distance * easeInOutCubic(progress));
        if (progress < 1) requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    });
  });
};

const ListingDetail = ({ listing, currentUser, onBack }) => {
  const config = useConfiguration();
  const intl = useIntl();
  const dispatch = useDispatch();
  const history = useHistory();
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const [highlighted, setHighlighted] = useState(false);
  const [extraImages, setExtraImages] = useState([]);
  const cardRef = useRef(null);
  const [cardError, setCardError] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  // Estado editável levantado do HighlightedPreviewCard
  const currentListing = ensureOwnListing(listing);
  const { title = '', description, price, publicData, state } = currentListing.attributes;
  const listingId = currentListing.id?.uuid;

  // Ratings para incluir no dispatch
  const averageRating = useSelector(s => selectListingRating(s, listingId));
  const reviewCount = useSelector(s => selectListingReviewCount(s, listingId));
  useEffect(() => {
    if (listingId && averageRating === undefined) dispatch(fetchListingRating(listingId));
  }, [listingId]);
  const [editedTitle, setEditedTitle] = useState(title);
  const [editedDescription, setEditedDescription] = useState(description || '');

  const handleAddImage = e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setExtraImages(prev => [...prev, url]);
    e.target.value = '';
  };

  const handleDestacar = () => {
    const id = currentListing.id.uuid;
    const slug = createSlug(editedTitle || title);

    // Obter URL da primeira imagem a partir dos variants
    const images = currentListing.images || [];
    const firstImg = images[0] || null;
    const imgVariants = firstImg?.attributes?.variants || {};
    const imageUrl =
      imgVariants['listing-card-2x']?.url ||
      imgVariants['listing-card']?.url ||
      Object.values(imgVariants)[0]?.url ||
      null;

    // Comodidades (multi-enum) — guarda os option keys brutos para tradução on-the-fly
    const amenityKeys = (config.listing.listingFields || [])
      .filter(f => f.schemaType === 'multi-enum' && publicData?.[f.key]?.length > 0)
      .flatMap(f => publicData[f.key] || []);

    // Labels para a pré-visualização local (usa o config já traduzido)
    const amenityChips = amenityKeys.map(val => {
      for (const f of config.listing.listingFields || []) {
        if (f.schemaType === 'multi-enum') {
          const opt = f.enumOptions?.find(o => o.option === val);
          if (opt) return opt.label;
        }
      }
      return val;
    });

    const hostName =
      currentUser?.attributes?.profile?.displayName ||
      currentUser?.attributes?.profile?.firstName ||
      null;

    // Grava publicData.featured=true no Sharetribe — torna o anúncio visível
    // para todos os dispositivos via query pub_featured=true na landing page.
    // Também persiste descrição e amenidades para ficarem disponíveis cross-browser via API.
    dispatch(featureListing(id, { description: editedDescription || description || null, amenityKeys }));

    // Atualiza o estado local para feedback imediato na sessão atual.
    dispatch(
      addHighlightedListing({
        id,
        slug,
        title: editedTitle || title,
        description: editedDescription || description || '',
        priceFormatted: price ? formatMoney(intl, price) : null,
        location: publicData?.location?.address || null,
        imageUrl,
        extraImageUrls: extraImages,
        hostName,
        hostInitial: hostName ? hostName.charAt(0).toUpperCase() : '?',
        amenityChips,
        amenityKeys,
        rating: averageRating ?? null,
        reviewCount: reviewCount ?? 0,
        category: publicData?.categoryLevel1 || null,
      })
    );
    setHighlighted(true);
    setShowSuccessPopup(true);
  };

  const firstImage =
    currentListing.images && currentListing.images.length > 0
      ? currentListing.images[0]
      : null;

  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } =
    config.layout.listingImage;

  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants || {}).filter(k =>
        k.startsWith(variantPrefix)
      )
    : [];

  const formattedPrice = price ? formatMoney(intl, price) : null;

  const isDraft = state === LISTING_STATE_DRAFT;
  const isClosed = state === LISTING_STATE_CLOSED;
  const isPending = state === LISTING_STATE_PENDING_APPROVAL;

  const stateKey = isDraft
    ? 'DestacaAnuncioPage.stateDraft'
    : isClosed
    ? 'DestacaAnuncioPage.stateClosed'
    : isPending
    ? 'DestacaAnuncioPage.statePending'
    : 'DestacaAnuncioPage.statePublished';

  const location = publicData?.location?.address || null;

  return (
    <div className={css.detailPanel}>
      <button className={css.backButton} onClick={onBack}>
        ← <FormattedMessage id="DestacaAnuncioPage.back" />
      </button>

      <div className={css.detailContent}>
        <div className={css.detailImageWrapper}>
          {firstImage ? (
            <AspectRatioWrapper width={aspectWidth} height={aspectHeight}>
              <ResponsiveImage
                rootClassName={css.detailImage}
                alt={title}
                image={firstImage}
                variants={variants}
              />
            </AspectRatioWrapper>
          ) : (
            <div className={css.detailNoImage} />
          )}
        </div>

        <div className={css.detailInfo}>
          <h2 className={css.detailTitle}>{title}</h2>

          <div className={css.detailMeta}>
            <div className={css.detailRow}>
              <span className={css.detailLabel}>
                <FormattedMessage id="DestacaAnuncioPage.price" />
              </span>
              <span className={css.detailValue}>{formattedPrice || '—'}</span>
            </div>
            <div className={css.detailRow}>
              <span className={css.detailLabel}>
                <FormattedMessage id="DestacaAnuncioPage.status" />
              </span>
              <span className={css.detailValue}>
                <FormattedMessage id={stateKey} />
              </span>
            </div>
            <div className={css.detailRow}>
              <span className={css.detailLabel}>
                <FormattedMessage id="DestacaAnuncioPage.location" />
              </span>
              <span className={css.detailValue}>{location || '—'}</span>
            </div>
          </div>

          <div className={css.detailDescription}>
            <span className={css.detailLabel}>
              <FormattedMessage id="DestacaAnuncioPage.description" />
            </span>
            <p className={css.descriptionText}>{description || '—'}</p>
          </div>
        </div>
      </div>

      <div className={css.previewSection}>
        <p className={css.previewInfoText}>
          <FormattedMessage id="DestacaAnuncioPage.highlightInfoText" />
        </p>
        <h3 className={css.previewSectionTitle}>
          <FormattedMessage id="DestacaAnuncioPage.previewTitle" />
        </h3>
        <HighlightedPreviewCard
          listing={listing}
          currentUser={currentUser}
          extraImages={extraImages}
          editedTitle={editedTitle}
          setEditedTitle={setEditedTitle}
          editedDescription={editedDescription}
          setEditedDescription={setEditedDescription}
        />
        <p className={css.editableHintText}>
          <FormattedMessage id="DestacaAnuncioPage.editableHintText" />
        </p>
        <label className={css.addImageButton}>
          <input
            type="file"
            accept="image/*"
            className={css.addImageInput}
            onChange={handleAddImage}
          />
          <span className={css.addImageIcon}>+</span>
          {isEN ? 'Add image' : 'Adicionar imagem'}
        </label>
      </div>

      <PaymentSection
        cardRef={cardRef}
        cardError={cardError}
        setCardError={setCardError}
        setCardComplete={setCardComplete}
        isEN={isEN}
      />

      <div className={css.destacarSection}>
        <PrimaryButton
          onClick={handleDestacar}
          disabled={!cardComplete || !!cardError || highlighted}
        >
          <FormattedMessage id="DestacaAnuncioPage.destacarButton" />
        </PrimaryButton>
      </div>

      {/* ── Popup de sucesso ── */}
      {showSuccessPopup && (
        <div className={css.popupOverlay} onClick={() => setShowSuccessPopup(false)}>
          <div className={css.popupCard} onClick={e => e.stopPropagation()}>
            <div className={css.popupIconWrapper}>
              <span className={css.popupIcon}>✓</span>
            </div>
            <h3 className={css.popupTitle}>
              {isEN ? 'Listing featured successfully!' : 'Anúncio destacado com sucesso!'}
            </h3>
            <p className={css.popupMessage}>
              {isEN
                ? 'Your listing will appear shortly at the top of the main page.'
                : 'O seu anúncio irá aparecer brevemente no início da página principal.'}
            </p>
            <button
              className={css.popupButton}
              onClick={() => {
                setShowSuccessPopup(false);
                history.push({ pathname: '/' });
                // Aguarda o render da landing page, depois scroll suave do topo até à secção
                setTimeout(() => smoothScrollToElement(HIGHLIGHTED_SECTION_ID, 2400), 400);
              }}
            >
              {isEN ? 'View my listing' : 'Ver o meu anúncio'}
            </button>
            <button
              className={css.popupClose}
              onClick={() => setShowSuccessPopup(false)}
              aria-label={isEN ? 'Close' : 'Fechar'}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const DestacaAnuncioPageComponent = props => {
  const {
    currentUser,
    listings = [],
    pagination,
    queryInProgress,
    queryListingsError,
    scrollingDisabled,
  } = props;

  const config = useConfiguration();
  const intl = useIntl();
  const location = useLocation();
  const [selectedListing, setSelectedListing] = useState(null);

  // Auto-select listing if listingId query param is present
  useEffect(() => {
    if (!listings.length) return;
    const params = new URLSearchParams(location.search);
    const listingId = params.get('listingId');
    if (listingId && !selectedListing) {
      const match = listings.find(l => l.id.uuid === listingId);
      if (match) setSelectedListing(match);
    }
  }, [listings, location.search]);

  const showManageListingsLink = showCreateListingLinkForUser(config, currentUser);
  const listingsAreLoaded = !queryInProgress && !!pagination;

  const loadingEl = (
    <div className={css.messagePanel}>
      <H3 as="h2" className={css.heading}>
        <FormattedMessage id="DestacaAnuncioPage.loading" />
      </H3>
    </div>
  );

  const errorEl = (
    <div className={css.messagePanel}>
      <H3 as="h2" className={css.heading}>
        <FormattedMessage id="DestacaAnuncioPage.queryError" />
      </H3>
    </div>
  );

  const noListingsEl = (
    <div className={css.messagePanel}>
      <H3 as="h2" className={css.heading}>
        <FormattedMessage id="DestacaAnuncioPage.noListings" />
      </H3>
      <p>
        <NamedLink name="NewListingPage">
          <FormattedMessage id="DestacaAnuncioPage.createListing" />
        </NamedLink>
      </p>
    </div>
  );

  const selectionEl = (
    <div className={css.listingPanel}>
      <H3 as="h1" className={css.heading}>
        <FormattedMessage id="DestacaAnuncioPage.selectHeading" />
      </H3>
      <p className={css.subtitle}>
        <FormattedMessage id="DestacaAnuncioPage.selectSubtitle" />
      </p>
      <div className={css.listingGrid}>
        {listings.map(listing => (
          <ListingSelectCard
            key={listing.id.uuid}
            listing={listing}
            onSelect={setSelectedListing}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Page
      title={intl.formatMessage({ id: 'DestacaAnuncioPage.title' })}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        topbar={
          <>
            <TopbarContainer />
            <UserNav
              currentPage="DestacaAnuncioPage"
              showManageListingsLink={showManageListingsLink}
            />
          </>
        }
        footer={<FooterContainer />}
      >
        {queryInProgress ? loadingEl : null}
        {queryListingsError ? errorEl : null}
        {!queryInProgress && !queryListingsError
          ? selectedListing ? (
              <ListingDetail
                listing={selectedListing}
                currentUser={currentUser}
                onBack={() => setSelectedListing(null)}
              />
            ) : listingsAreLoaded && listings.length === 0 ? (
              noListingsEl
            ) : (
              selectionEl
            )
          : null}
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  const { currentUser } = state.user;
  const {
    currentPageResultIds,
    pagination,
    queryInProgress,
    queryListingsError,
  } = state.ManageListingsPage;
  const listings = getOwnListingsById(state, currentPageResultIds);
  return {
    currentUser,
    listings,
    pagination,
    queryInProgress,
    queryListingsError,
    scrollingDisabled: isScrollingDisabled(state),
  };
};

const DestacaAnuncioPage = compose(connect(mapStateToProps))(DestacaAnuncioPageComponent);

export default DestacaAnuncioPage;
