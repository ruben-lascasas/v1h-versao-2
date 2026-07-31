import React, { useEffect } from 'react';
import loadable from '@loadable/component';

import { bool, object } from 'prop-types';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { camelize } from '../../util/string';
import { propTypes } from '../../util/types';

import FallbackPage from './FallbackPage';
import FeedbackPromptModal from '../../components/FeedbackPromptModal/FeedbackPromptModal';
import { ASSET_NAME } from './LandingPage.duck';
import { fetchFeaturedListings } from '../../ducks/featuredListings.duck';
import { getListingsById } from '../../ducks/marketplaceData.duck';
import { getFeaturedListingsProps } from '../../util/data';
// NOTE: `highlightedListingExampleConfig` powers the "Anúncios em Destaque"
// section, currently disabled on the home page. To bring it back, add it to
// this import and uncomment its entry in `injectedSections` below.
// The build runs with CI=true on Render, where an unused import is treated as
// an error — hence it is commented out here rather than left dangling.
import { whyUsConfig, landingMapConfig } from '../../config/landingPageConfigExamples';
import { useLocale } from '../../context/localeContext';
import { useDarkMode } from '../../context/darkModeContext';
import landingPageContentEN from '../../translations/landingPageContentEN';

// Apply English content overrides to a section based on match rules.
const applyOverride = (section, override) => {
  const updated = { ...section };
  if (override.title) {
    updated.title = { ...(section.title || {}), content: override.title };
  }
  if (override.description) {
    updated.description = { ...(section.description || {}), content: override.description };
  }
  if (override.callToAction) {
    updated.callToAction = { ...(section.callToAction || {}), ...override.callToAction };
  }
  if (override.staticHighlight && section.staticHighlight) {
    updated.staticHighlight = { ...section.staticHighlight, ...override.staticHighlight };
  }
  if (override.blocks && Array.isArray(section.blocks)) {
    updated.blocks = section.blocks.map((block, i) => {
      const blockOverride = override.blocks[i];
      if (!blockOverride) return block;
      const updatedBlock = { ...block };
      if (blockOverride.title) updatedBlock.title = { ...(block.title || {}), content: blockOverride.title };
      if (blockOverride.text) updatedBlock.text = { ...(block.text || {}), content: blockOverride.text };
      if (blockOverride.callToAction) updatedBlock.callToAction = { ...(block.callToAction || {}), ...blockOverride.callToAction };
      return updatedBlock;
    });
  }
  return updated;
};

const matchesOverride = (section, match) => {
  if (match.sectionType && section.sectionType !== match.sectionType) return false;
  if (match.sectionNameIncludes) {
    const name = (section.sectionName || section.sectionId || '').toLowerCase();
    if (!name.includes(match.sectionNameIncludes.toLowerCase())) return false;
  }
  return true;
};

const applyENOverrides = sections =>
  sections.map(section => {
    const override = landingPageContentEN.find(o => matchesOverride(section, o.match));
    return override ? applyOverride(section, override) : section;
  });

// Replace " — " (em dash with surrounding spaces) with ", " in CMS-driven copy.
// The same cleanup is applied to hero slides inside SectionHero; this version
// walks every section's title/description/blocks so the category cards and
// other Page Builder sections are covered too.
const stripEmDashesInField = field => {
  if (!field || typeof field?.content !== 'string') return field;
  return { ...field, content: field.content.replace(/\s+—\s+/g, ', ') };
};
const stripEmDashesInSection = section => {
  const updated = {
    ...section,
    title: stripEmDashesInField(section.title),
    description: stripEmDashesInField(section.description),
  };
  if (Array.isArray(section.blocks)) {
    updated.blocks = section.blocks.map(block => ({
      ...block,
      title: stripEmDashesInField(block.title),
      text: stripEmDashesInField(block.text),
    }));
  }
  return updated;
};

const PageBuilder = loadable(() =>
  import(/* webpackChunkName: "PageBuilder" */ '../PageBuilder/PageBuilder')
);

export const LandingPageComponent = props => {
  const { pageAssetsData, inProgress, error } = props;
  const featuredListingsProps = getFeaturedListingsProps(camelize(ASSET_NAME), props);
  const { locale } = useLocale();
  // Body attributes are now managed globally in app.js — no longer needed here.

  // Get the page asset from Console
  let consoleAsset = pageAssetsData?.[camelize(ASSET_NAME)]?.data;

  // If we have a Console asset, inject our own sections just after the Marketplace intro
  let finalPageAsset = consoleAsset;
  if (consoleAsset && Array.isArray(consoleAsset.sections)) {
    // Filter out console sections that are replaced by programmatic injections
    let sections = consoleAsset.sections.filter(section => {
      const name = String(section.sectionName || '').toLowerCase();
      const titleContent = String(section.title?.content || '').toLowerCase();
      const isWhyUsPlaceholder =
        name.includes('porquê') ||
        name.includes('porque') ||
        name.includes('why') ||
        titleContent.includes('porquê') ||
        titleContent.includes('porque');
      return !isWhyUsPlaceholder;
    });

    // Merge slideshow/carousel-1col blocks into hero so they share one carousel
    const heroIdx = sections.findIndex(s => s.sectionType === 'hero');
    const slideshowIdx = sections.findIndex(s =>
      s.sectionType === 'slideshow' ||
      (s.sectionType === 'carousel' && (!s.numColumns || s.numColumns === 1))
    );
    if (heroIdx >= 0 && slideshowIdx >= 0) {
      const slideBlocks = sections[slideshowIdx].blocks || [];
      const mergedBlocks = slideBlocks.map((block, i) => {
        if (i === 1 && block.callToAction) {
          // "Seja Descoberto" → scroll to listings section
          return { ...block, callToAction: { ...block.callToAction, href: '#espacos-disponiveis' } };
        }
        if (i === 2 && block.callToAction) {
          // "Receba Reservas" → inbox
          return { ...block, callToAction: { ...block.callToAction, href: '/inbox' } };
        }
        if (i === slideBlocks.length - 1 && block.callToAction) {
          // "Sobre a nossa proteção" → terms of service
          return { ...block, callToAction: { ...block.callToAction, href: '/terms-of-service' } };
        }
        return block;
      });
      sections[heroIdx] = { ...sections[heroIdx], blocks: mergedBlocks };
      sections = sections.filter((_, i) => i !== slideshowIdx);
    }

    // Stamp stable IDs so CSS dark-mode selectors always match
    sections = sections.map(s => {
      if (s.sectionType === 'hero') {
        return { ...s, sectionId: 'hero-banner' };
      }
      if (
        s.sectionType === 'carousel' &&
        s.numColumns > 1 &&
        (String(s.sectionName || '').toLowerCase().includes('localiza') ||
          String(s.title?.content || '').toLowerCase().includes('espa'))
      ) {
        return { ...s, sectionId: 'espacos-disponiveis' };
      }
      return s;
    });

    const introIndex = sections.findIndex(section => {
      const name = String(section.sectionName || '').toLowerCase();
      const title = String(section.title?.content || '').toLowerCase();
      return (
        section.sectionType === 'hero' ||
        name.includes('marketplace') ||
        title.includes('marketplace') ||
        name.includes('introduction') ||
        title.includes('introduction')
      );
    });

    const insertionIndex = introIndex >= 0 ? introIndex + 1 : 0;

    // Sections injected right after the Marketplace intro, in this order.
    // Kept as a list (instead of separate splices with +1/+2/+3 offsets) so a
    // section can be switched off by commenting one line, without the ones
    // below it landing in the wrong place.
    const injectedSections = [
      // "Anúncios em Destaque" — temporarily disabled. Uncomment this line and
      // restore the import at the top of the file to bring it back.
      // highlightedListingExampleConfig,

      // "Para si" / "For you" recommendations. The component returns null for
      // logged-out users, so anonymous visitors don't see an empty slot.
      {
        sectionId: 'section-recommendations',
        sectionName: 'Para si',
        sectionType: 'recommendations',
      },
      landingMapConfig,
      whyUsConfig,
    ];
    sections.splice(insertionIndex, 0, ...injectedSections);

    // Apply English content overrides after all sections (including highlighted) are assembled
    const overriddenSections = locale === 'en' ? applyENOverrides(sections) : sections;
    // Strip em dashes from titles/descriptions/blocks so cards and other CMS
    // content read naturally without " — " in the middle of sentences.
    const finalSections = overriddenSections.map(stripEmDashesInSection);

    finalPageAsset = {
      ...consoleAsset,
      sections: finalSections,
    };
  }

  return (
    <>
      <PageBuilder
        pageAssetsData={finalPageAsset}
        inProgress={inProgress}
        error={error}
        fallbackPage={<FallbackPage error={error} featuredListings={featuredListingsProps} />}
        featuredListings={featuredListingsProps}
      />
      <FeedbackPromptModal />
    </>
  );
};

LandingPageComponent.propTypes = {
  pageAssetsData: object,
  inProgress: bool,
  error: propTypes.error,
};

const mapStateToProps = state => {
  const { pageAssetsData, inProgress, error } = state.hostedAssets || {};
  const featuredListingData = state.featuredListings || {};

  const getListingEntitiesById = listingIds => getListingsById(state, listingIds);

  return { pageAssetsData, featuredListingData, getListingEntitiesById, inProgress, error };
};

const mapDispatchToProps = dispatch => ({
  onFetchFeaturedListings: (sectionId, parentPage, listingImageConfig, allSections, listingFieldKeys) =>
    dispatch(fetchFeaturedListings({ sectionId, parentPage, listingImageConfig, allSections, listingFieldKeys })),
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const LandingPage = compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(LandingPageComponent);

export default LandingPage;
