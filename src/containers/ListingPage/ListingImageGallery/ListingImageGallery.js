import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import classNames from 'classnames';
import ReactImageGallery from 'react-image-gallery';

import { propTypes } from '../../../util/types';
import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import {
  AspectRatioWrapper,
  Button,
  IconClose,
  IconArrowHead,
  ResponsiveImage,
} from '../../../components';
import { extractYouTubeVideoId } from '../../../util/youtube';

// Copied directly from
// `node_modules/react-image-gallery/styles/css/image-gallery.css`. The
// copied file is left unedited, and all the overrides are defined in
// the component CSS file below.
import './image-gallery.css';

import css from './ListingImageGallery.module.css';

const IMAGE_GALLERY_OPTIONS = {
  showPlayButton: false,
  disableThumbnailScroll: true,
  showFullscreenButton: false,
};
const MAX_LANDSCAPE_ASPECT_RATIO = 2; // 2:1
const MAX_PORTRAIT_ASPECT_RATIO = 4 / 3;

const getFirstImageAspectRatio = (firstImage, scaledVariant) => {
  if (!firstImage) {
    return { aspectWidth: 4, aspectHeight: 3 };
  }

  const variants = firstImage?.attributes?.variants || {};
  // Use the requested variant if available, otherwise fall back to any variant
  const v = variants[scaledVariant] || Object.values(variants)[0];
  const w = v?.width;
  const h = v?.height;
  const hasDimensions = !!w && !!h;
  const aspectRatio = w / h;

  // We keep the fractions separated as these are given to AspectRatioWrapper
  // which expects separate width and height
  return hasDimensions && aspectRatio >= MAX_LANDSCAPE_ASPECT_RATIO
    ? { aspectWidth: 2, aspectHeight: 1 }
    : hasDimensions && aspectRatio <= MAX_PORTRAIT_ASPECT_RATIO
    ? { aspectWidth: 4, aspectHeight: 3 }
    : hasDimensions
    ? { aspectWidth: w, aspectHeight: h }
    : { aspectWidth: 1, aspectHeight: 1 };
};

/**
 * The ListingImageGallery component.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {Array<propTypes.image>} props.images - The images
 * @param {Array<string>} props.imageVariants - The image variants
 * @param {Array<string>} props.thumbnailVariants - The thumbnail variants
 * @returns {JSX.Element} listing image gallery component
 */
const ListingImageGallery = props => {
  // Custom-built modal (eBay-style) replaces the library's native fullscreen
  // so we get: a modal title, circular side nav arrows, and a thumbnail grid
  // docked on the right — while still reusing the inline gallery below.
  const [modalIndex, setModalIndex] = useState(-1);
  const modalOpen = modalIndex >= 0;
  // Track which slide the inline gallery is showing so we can unmount the
  // YouTube iframe when the user navigates away — otherwise the video keeps
  // playing in the background.
  const [activeIndex, setActiveIndex] = useState(0);
  const intl = useIntl();
  const { rootClassName, className, images, imageVariants, thumbnailVariants, youtubeUrl, onSlideChange } = props;
  const thumbVariants = thumbnailVariants || imageVariants;
  const youtubeId = extractYouTubeVideoId(youtubeUrl);
  // Calculate aspect ratio only once to prevent layout shifts when image variants update in the store.
  // If the listing has a YouTube video, force a 16:9 slot so the embed plays
  // without letterboxing — photos get small side bars but the gallery height
  // stays consistent across all slides.
  const [{ aspectWidth, aspectHeight }] = useState(() =>
    youtubeId
      ? { aspectWidth: 16, aspectHeight: 9 }
      : getFirstImageAspectRatio(images?.[0], imageVariants[0])
  );
  // Build a stable identity key from the image ids + youtube id so the
  // memoisation below only re-fires when the actual content changes — not on
  // every parent render that hands us a fresh `images` array reference.
  const imagesKey = useMemo(
    () => (images || []).map(i => i?.id?.uuid || '').join('|') + ':' + (youtubeId || ''),
    [images, youtubeId]
  );

  // Memoise the items array so the reference stays stable across renders.
  // Without this, every parent state change (e.g., the isVideoSlide toggle
  // in ListingPageCarousel) recreates the array, which makes react-image-
  // gallery reset its internal slide index back to 0. `imagesKey` is a
  // string fingerprint of the actual content, so the closures below pick up
  // fresh `intl`/`thumbVariants` references when needed.
  const items = useMemo(() => {
    const list = images.map((img, i) => ({
      original: '',
      alt: intl.formatMessage(
        { id: 'ListingImageGallery.imageAltText' },
        { index: i + 1, count: images.length }
      ),
      thumbAlt: intl.formatMessage(
        { id: 'ListingImageGallery.imageThumbnailAltText' },
        { index: i + 1, count: images.length }
      ),
      thumbnail: img.attributes?.variants?.[thumbVariants[0]],
      image: img,
    }));

    if (youtubeId) {
      // `mqdefault.jpg` is YouTube's 320×180 thumbnail — natively 16:9 with
      // no letterboxing, unlike `hqdefault.jpg` (480×360, 4:3 with bars).
      const ytThumb = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
      list.push({
        original: '',
        thumbnail: ytThumb,
        type: 'video',
        youtubeId,
        thumbnailUrl: ytThumb,
        alt: intl.formatMessage({ id: 'ListingImageGallery.videoAltText' }),
        thumbAlt: intl.formatMessage({ id: 'ListingImageGallery.videoAltText' }),
      });
    }
    return list;
  }, [imagesKey]);

  const openModalAt = i => setModalIndex(i);
  const closeModal = () => setModalIndex(-1);
  const nextImage = useCallback(
    () => setModalIndex(i => (i + 1) % items.length),
    [items.length]
  );
  const prevImage = useCallback(
    () => setModalIndex(i => (i - 1 + items.length) % items.length),
    [items.length]
  );

  // Close on Esc, navigate with ←/→ while the modal is open.
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = e => {
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowRight') nextImage();
      else if (e.key === 'ArrowLeft') prevImage();
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen, nextImage, prevImage]);

  // Measured gallery widths: 900px viewport -> 809px, 1100 -> 457, 1280 -> 637,
  // 1900 -> 872. The previous fixed `708px` under-declared on wide screens, so
  // the browser picked the 750w variant for an 872px box and the main listing
  // image rendered soft. 50vw covers the real width at every measured size
  // without ever under-declaring (over-declaring only costs a sharper pick).
  const imageSizesMaybe = {
    sizes: `(max-width: 1024px) 100vw, 50vw`,
  };
  const renderItem = item => {
    const i = item.__index;
    if (item.type === 'video' && item.youtubeId) {
      // Only mount the iframe while the user is actually viewing this slide.
      // When they swipe away, swap to the static poster so the audio stops —
      // react-image-gallery doesn't unmount inactive items by itself.
      const isActive = activeIndex === i;
      return (
        <AspectRatioWrapper
          width={aspectWidth || 1}
          height={aspectHeight || 1}
          className={css.itemWrapper}
        >
          <div className={css.itemCentering}>
            {isActive ? (
              <iframe
                className={css.itemVideo}
                src={`https://www.youtube.com/embed/${item.youtubeId}?rel=0&modestbranding=1`}
                title={item.alt}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <img className={css.item} src={item.thumbnailUrl} alt={item.alt} />
            )}
          </div>
        </AspectRatioWrapper>
      );
    }
    return (
      <AspectRatioWrapper
        width={aspectWidth || 1}
        height={aspectHeight || 1}
        className={css.itemWrapper}
        onClick={() => openModalAt(i)}
      >
        <div className={css.itemCentering}>
          <ResponsiveImage
            rootClassName={css.item}
            image={item.image}
            alt={item.alt}
            variants={imageVariants}
            {...imageSizesMaybe}
          />
        </div>
      </AspectRatioWrapper>
    );
  };

  const renderThumbInner = item => {
    if (item.type === 'video' && item.youtubeId) {
      return (
        <div className={css.videoThumbWrapper}>
          <img className={css.thumb} src={item.thumbnailUrl} alt={item.thumbAlt} />
          <span className={css.videoThumbBadge} aria-hidden>▶</span>
        </div>
      );
    }
    return (
      <div>
        <ResponsiveImage
          rootClassName={css.thumb}
          image={item.image}
          alt={item.thumbAlt}
          variants={thumbVariants}
          sizes="88px"
        />
      </div>
    );
  };

  const renderLeftNav = (onClick, disabled) => {
    return (
      <button className={css.navLeft} disabled={disabled} onClick={onClick}>
        <span>‹</span>
      </button>
    );
  };
  const renderRightNav = (onClick, disabled) => {
    return (
      <button className={css.navRight} disabled={disabled} onClick={onClick}>
        <span>›</span>
      </button>
    );
  };

  if (items.length === 0) {
    return <ResponsiveImage className={css.noImage} image={null} variants={[]} alt="" />;
  }

  const classes = classNames(rootClassName || css.root, className);

  // `items` is the stable, memoised array. We hand it to the gallery as-is
  // (no per-item renderItem) and rely on the top-level `renderItem` prop so
  // the closure always sees current state (`activeIndex` etc.).
  const itemsForRender = useMemo(
    () => items.map((it, i) => ({ ...it, __index: i })),
    [items]
  );

  return (
    <>
      <ReactImageGallery
        additionalClass={classes}
        items={itemsForRender}
        renderItem={renderItem}
        renderThumbInner={renderThumbInner}
        renderLeftNav={renderLeftNav}
        renderRightNav={renderRightNav}
        onSlide={idx => {
          setActiveIndex(idx);
          if (typeof onSlideChange === 'function') {
            const isVideo = items[idx]?.type === 'video';
            onSlideChange(idx, isVideo);
          }
        }}
        {...IMAGE_GALLERY_OPTIONS}
      />
      {modalOpen ? (
        <div
          className={css.modalOverlay}
          role="dialog"
          aria-modal="true"
          onClick={e => {
            // Close on backdrop click only (not when clicking inside the
            // centered content column).
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className={css.modalHeader}>
            <span className={css.modalTitle}>
              <FormattedMessage
                id="ListingImageGallery.modalTitleSimple"
                defaultMessage="Galeria"
              />
              {items.length > 0 ? (
                <span className={css.modalCounter}>
                  {' '}
                  {modalIndex + 1}/{items.length}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className={css.modalClose}
              onClick={closeModal}
              aria-label={intl.formatMessage({ id: 'ListingImageGallery.closeModalTitle' })}
            >
              <IconClose />
            </button>
          </div>

          <div className={css.modalBody}>
            <div
              className={css.modalImageStage}
              onTouchStart={e => {
                if (items.length < 2) return;
                const t = e.changedTouches[0];
                e.currentTarget.dataset.tStartX = String(t.clientX);
                e.currentTarget.dataset.tStartY = String(t.clientY);
              }}
              onTouchEnd={e => {
                if (items.length < 2) return;
                const startX = Number(e.currentTarget.dataset.tStartX);
                const startY = Number(e.currentTarget.dataset.tStartY);
                if (Number.isNaN(startX)) return;
                const t = e.changedTouches[0];
                const dx = t.clientX - startX;
                const dy = t.clientY - startY;
                if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
                  if (dx < 0) nextImage();
                  else prevImage();
                }
              }}
            >
              <div className={css.modalImageFrame}>
                {items[modalIndex].type === 'video' && items[modalIndex].youtubeId ? (
                  <iframe
                    className={css.modalVideo}
                    src={`https://www.youtube.com/embed/${items[modalIndex].youtubeId}?autoplay=1&rel=0&modestbranding=1`}
                    title={items[modalIndex].alt}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <ResponsiveImage
                    rootClassName={css.modalImage}
                    image={items[modalIndex].image}
                    alt={items[modalIndex].alt}
                    variants={imageVariants}
                    sizes="90vw"
                  />
                )}
              </div>
            </div>

            <div className={css.modalThumbs}>
              {items.map((it, i) => (
                <button
                  key={i}
                  type="button"
                  className={classNames(css.modalThumb, {
                    [css.modalThumbActive]: i === modalIndex,
                  })}
                  onClick={() => setModalIndex(i)}
                  aria-label={it.thumbAlt}
                >
                  <span className={css.modalThumbInner}>
                    {it.type === 'video' && it.youtubeId ? (
                      <>
                        <img className={css.modalThumbImg} src={it.thumbnailUrl} alt={it.thumbAlt} />
                        <span className={css.videoThumbBadge} aria-hidden>▶</span>
                      </>
                    ) : (
                      <ResponsiveImage
                        rootClassName={css.modalThumbImg}
                        image={it.image}
                        alt={it.thumbAlt}
                        variants={thumbVariants}
                        sizes="160px"
                      />
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ListingImageGallery;
