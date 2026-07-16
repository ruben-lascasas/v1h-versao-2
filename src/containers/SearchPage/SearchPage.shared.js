import { SCHEMA_TYPE_ENUM, SCHEMA_TYPE_MULTI_ENUM } from '../../util/types';
import { createResourceLocatorString, matchPathname } from '../../util/routes';
import {
  isAnyFilterActive,
  parseSelectFilterOptions,
  constructQueryParamName,
} from '../../util/search';
import { createSlug, parse, stringify } from '../../util/urlHelpers';
import {
  getStartOf,
  parseDateFromISO8601,
  subtractTime,
  addTime,
  stringifyDateToISO8601,
} from '../../util/dates';
import { isFieldForCategory, isFieldForListingType } from '../../util/fieldHelpers';

// Collect every node at a given depth from the top-level tree so cross-branch
// L2 picks (subs whose parent isn't currently in L1) are still recognised as
// valid. Supports the per-branch CategoryMultiFilter where L1 (full branches)
// and L2 (specific subs of other branches) coexist as disjoint sets.
const collectCategoriesAtLevel = (topLevelCats, level) => {
  if (level <= 1) return topLevelCats;
  let nodes = topLevelCats;
  for (let i = 1; i < level; i += 1) {
    nodes = nodes.flatMap(c => c.subcategories || []);
  }
  return nodes;
};

// Iterative validation: each level is validated independently against the
// flattened nodes at that depth, so L2 can be present without L1 (sub-only
// picks) and vice versa.
const validURLParamForCategoryData = (prefix, categories, level, params) => {
  const result = {};
  for (let lvl = level; lvl <= 5; lvl += 1) {
    const levelKey = constructQueryParamName(`${prefix}${lvl}`, 'public');
    const rawValue = params?.[levelKey];
    if (rawValue == null || rawValue === '') continue;
    const validationPool = lvl === 1 ? categories : collectCategoriesAtLevel(categories, lvl);
    if (validationPool.length === 0) break;
    const values = String(rawValue).split(',').map(v => v.trim()).filter(Boolean);
    const validValues = values.filter(v => validationPool.some(cat => cat.id === v));
    if (validValues.length > 0) {
      result[levelKey] = validValues.join(',');
    }
  }
  return result;
};

const validURLParamForListingTypeData = (listingTypes, param) => {
  const listingTypeValue = param?.pub_listingType;
  const foundListingType = listingTypes.find(lt => lt === listingTypeValue);
  return foundListingType && listingTypeValue ? { pub_listingType: listingTypeValue } : {};
};

/**
 * Omit those listing field parameters, that are not allowed with current category selection
 *
 * @param {Object} searchParams current search params
 * @param {Object} filterConfigs contains listingFieldsConfig and defaultFiltersConfig.
 * @returns search parameters without currently restricted listing fields
 */
export const omitLimitedListingFieldParams = (searchParams, filterConfigs) => {
  const {
    listingFieldsConfig,
    defaultFiltersConfig,
    listingCategories,
    activeListingTypes,
    currentPathParams = {},
  } = filterConfigs;

  const { listingType: listingTypePathParam } = currentPathParams;
  const categorySearchConfig = defaultFiltersConfig.find(f => f.schemaType === 'category');
  const listingTypeSearchConfig = defaultFiltersConfig.find(f => f.schemaType === 'listingType');
  const validNestedCategoryParamNames = categorySearchConfig
    ? validURLParamForCategoryData(categorySearchConfig.key, listingCategories, 1, searchParams)
    : {};

  const validListingTypeParamNames =
    activeListingTypes && listingTypeSearchConfig
      ? validURLParamForListingTypeData(activeListingTypes, searchParams)
      : {};

  return Object.entries(searchParams).reduce((picked, searchParam) => {
    const [searchParamKey, searchParamValue] = searchParam;
    const foundConfig = listingFieldsConfig.find(
      f => constructQueryParamName(f.key, f.scope) === searchParamKey
    );
    const currentCategories = Object.values(validNestedCategoryParamNames);
    const isForCategory = isFieldForCategory(currentCategories, foundConfig);
    const currentListingType = listingTypePathParam
      ? [listingTypePathParam]
      : Object.values(validListingTypeParamNames);
    const isForListingType = isFieldForListingType(currentListingType, foundConfig);
    const searchParamMaybe =
      !foundConfig || (foundConfig && isForCategory && isForListingType)
        ? { [searchParamKey]: searchParamValue }
        : {};
    return { ...picked, ...searchParamMaybe };
  }, {});
};

/**
 * Validates a filter search param against the default and extended data configuration of listings.
 *
 * All invalid param names and values are dropped
 *
 * @param {String} queryParamName Search parameter name
 * @param {Object} paramValue Search parameter value
 * @param {Object} listingFieldFilters extended data configuration with indexForSearch === true
 * @param {Object} defaultFilters configuration for default built-in filters.
 */
export const validURLParamForExtendedData = (
  queryParamName,
  paramValueRaw,
  listingFieldFilters,
  defaultFilters
) => {
  const paramValue = paramValueRaw.toString();

  // Price is built-in filter for listing entities
  if (queryParamName === 'price') {
    // Restrict price range to correct min & max
    const { min, max } = defaultFilters.find(conf => conf.schemaType === 'price') || {};
    const valueArray = paramValue ? paramValue.split(',') : [];
    const validValues = valueArray.map(v => {
      return v < min ? min : v > max ? max : v;
    });
    return validValues.length === 2 ? { [queryParamName]: validValues.join(',') } : {};
  } else if (queryParamName === 'keywords') {
    return paramValue.length > 0 ? { [queryParamName]: paramValue } : {};
  } else if (queryParamName === 'dates') {
    const searchTZ = 'Etc/UTC';
    const today = getStartOf(new Date(), 'day', searchTZ);
    const possibleStartDate = subtractTime(today, 14, 'hours', searchTZ);
    const dates = paramValue ? paramValue.split(',') : [];
    const hasValues = dates.length > 0;
    const startDate = hasValues ? parseDateFromISO8601(dates[0], searchTZ) : null;
    const endDate = hasValues ? parseDateFromISO8601(dates[1], searchTZ) : null;
    const hasValidDates =
      hasValues &&
      startDate.getTime() >= possibleStartDate.getTime() &&
      startDate.getTime() <= endDate.getTime();

    return hasValidDates ? { [queryParamName]: paramValue } : {};
  } else if (queryParamName === 'seats') {
    return paramValue ? { [queryParamName]: paramValue } : {};
  } else if (queryParamName === 'pub_listingType') {
    return paramValue.length > 0 ? { [queryParamName]: paramValue } : {};
  }

  // Resolve configurations for extended data filters
  const listingFieldFilterConfig = listingFieldFilters.find(
    f => queryParamName === constructQueryParamName(f.key, f.scope)
  );

  if (listingFieldFilterConfig) {
    const { schemaType, enumOptions = [], filterConfig } = listingFieldFilterConfig;
    if ([SCHEMA_TYPE_ENUM, SCHEMA_TYPE_MULTI_ENUM].includes(schemaType)) {
      const isSchemaTypeMultiEnum = schemaType === SCHEMA_TYPE_MULTI_ENUM;
      const searchMode = filterConfig?.searchMode;

      // Pick valid select options only
      const valueArray = parseSelectFilterOptions(paramValue);
      const allowedValues = enumOptions.map(o => `${o.option}`);
      const validValues = valueArray.filter(v => allowedValues.includes(v)).join(',');

      return validValues.length > 0
        ? {
            [queryParamName]:
              isSchemaTypeMultiEnum && searchMode ? `${searchMode}:${validValues}` : validValues,
          }
        : {};
    } else {
      // Generic filter - remove empty params
      return paramValue.length > 0 ? { [queryParamName]: paramValue } : {};
    }
  }

  // Fallback: custom built-in default filters (e.g. rating filter using pub_ params)
  const defaultFilterConfig = defaultFilters.find(f => f.key === queryParamName);
  if (defaultFilterConfig) {
    return paramValue.length > 0 ? { [queryParamName]: paramValue } : {};
  }

  return {};
};

/**
 * Checks filter param value validity.
 *
 * The URL params that are not part of listing.query filters are dropped by default.
 *
 * @param {Object} params Search query params
 * @param {Object} filterConfigs contains listingFieldsConfig and defaultFiltersConfig.
 * @param {boolean} dropNonFilterParams if false, extra params are passed through.
 */
export const validFilterParams = (params, filterConfigs, dropNonFilterParams = true) => {
  const { listingFieldsConfig, defaultFiltersConfig, listingCategories } = filterConfigs;

  const listingFieldFiltersConfig = listingFieldsConfig.filter(
    config => config.filterConfig?.indexForSearch
  );
  const listingFieldParamNames = listingFieldFiltersConfig.map(f =>
    constructQueryParamName(f.key, f.scope)
  );
  // Note: builtInFilterParamNames might include categoryLevel,
  //       even though it isn't a paramname that's used with nested category tree.
  //       (pub_categoryLevel1, pub_categoryLevel2, and pub_categoryLevel3 are used instead.)
  const builtInFilterParamNames = defaultFiltersConfig.map(f => {
    return ['category', 'listingType'].includes(f.schemaType) ? `pub_${f.key}` : f.key;
  });
  const filterParamNames = [...listingFieldParamNames, ...builtInFilterParamNames];

  // Note: currently, we only support nested enums with a single default filter
  //       that has schema type: "category"
  const categorySearchConfig = defaultFiltersConfig.find(f => f.schemaType === 'category');
  const validNestedCategoryParamNames = categorySearchConfig
    ? validURLParamForCategoryData(categorySearchConfig.key, listingCategories, 1, params)
    : {};
  const isParamNameNestedEnumRelated = (paramName, key, isNestedEnum) => {
    return isNestedEnum && key ? paramName.indexOf(key) > -1 : false;
  };

  // search params without category-restricted params
  const unlimitedSearchParams = omitLimitedListingFieldParams(params, filterConfigs);
  const paramEntries = Object.entries(unlimitedSearchParams);

  const listingFieldsAndBuiltInFilterParamNames = paramEntries.reduce((validParams, entry) => {
    const [paramName, paramValue] = entry;
    const isIndependentParam = filterParamNames.includes(paramName);
    const isNestedEnum = isIndependentParam
      ? false
      : isParamNameNestedEnumRelated(
          paramName,
          categorySearchConfig?.key,
          categorySearchConfig?.isNestedEnum
        );
    return isIndependentParam
      ? {
          ...validParams,
          ...validURLParamForExtendedData(
            paramName,
            paramValue,
            listingFieldFiltersConfig,
            defaultFiltersConfig
          ),
        }
      : dropNonFilterParams || isNestedEnum
      ? { ...validParams }
      : { ...validParams, [paramName]: paramValue };
  }, {});

  // TODO: Currently this only supports categoryLevel with nested param names.
  //       This needs more work to make other enum fields to understand nested keys.
  return { ...listingFieldsAndBuiltInFilterParamNames, ...validNestedCategoryParamNames };
};

/**
 * Helper to pick only valid values of search params from URL (location)
 * Note: location.search might look like: '?pub_category=men&pub_amenities=towels,bathroom'
 *
 * @param {Object} props object containing: location and (app) config
 * @returns picked search params against extended data config and default filter config
 */
export const validUrlQueryParamsFromProps = props => {
  const { location, config, params: currentPathParams = {} } = props;
  const { listingFields: listingFieldsConfig } = config?.listing || {};
  const { defaultFilters: defaultFiltersConfig } = config?.search || {};
  const activeListingTypes = config?.listing?.listingTypes.map(config => config.listingType);
  const listingCategories = config.categoryConfiguration.categories;
  const filterConfigs = {
    listingFieldsConfig,
    defaultFiltersConfig,
    listingCategories,
    activeListingTypes,
    currentPathParams,
  };

  // eslint-disable-next-line no-unused-vars
  const { mapSearch, page, ...searchInURL } = parse(location.search, {
    latlng: ['origin'],
    latlngBounds: ['bounds'],
  });
  // urlQueryParams doesn't contain page specific url params
  // like mapSearch, page or origin (origin depends on config.maps.search.sortSearchByDistance)
  return validFilterParams(searchInURL, filterConfigs, false);
};

/**
 * Helper to figure out initialValues for Final Form that handles search filters
 *
 * @param {Object} props object containing: location, listingFieldsConfig, defaultFiltersConfig
 * @param {Object} currentQueryParams object containing current state of queryParams (used only when isLiveEdit is false)
 * @returns a function with params queryParamNames, and isLiveEdit.
 *          It's called from FilterComponent and it returns initial values for the filter.
 */
export const initialValues = (props, currentQueryParams) => (queryParamNames, isLiveEdit) => {
  const urlQueryParams = validUrlQueryParamsFromProps(props);

  // Get initial value for a given parameter from state if its there.
  const getInitialValue = paramName => {
    // Query parameters that are in state (user might have not yet clicked "Apply")
    const currentQueryParam = currentQueryParams[paramName];
    const hasQueryParamInState = typeof currentQueryParam !== 'undefined';
    return hasQueryParamInState && !isLiveEdit ? currentQueryParam : urlQueryParams[paramName];
  };

  // Return all the initial values related to given queryParamNames
  // InitialValues for "amenities" filter could be
  // { amenities: "has_any:towel,jacuzzi" }
  const isArray = Array.isArray(queryParamNames);
  return isArray
    ? queryParamNames.reduce((acc, paramName) => {
        const initValue = getInitialValue(paramName);
        const addInitialValueMaybe = initValue ? { [paramName]: initValue } : {};
        return { ...acc, ...addInitialValueMaybe };
      }, {})
    : {};
};

/**
 * Some parameters could conflict with sort. If sortConfig defines conflictingFilters,
 * This function checks if they are active and returns "sort" param as null
 *
 * @param {*} searchParams
 * @param {*} filterConfigs contains config like listingFieldsConfig and defaultFiltersConfig
 * @param {*} sortConfig
 * @returns sort parameter as null if sortConfig defines conflictingFilters
 */
export const cleanSearchFromConflictingParams = (searchParams, filterConfigs, sortConfig) => {
  // Single out filters that should disable SortBy when an active
  // keyword search sorts the listings according to relevance.
  // In those cases, sort parameter should be removed.
  const sortingFiltersActive = isAnyFilterActive(
    sortConfig.conflictingFilters,
    searchParams,
    filterConfigs
  );

  // search params without category-restricted params
  const unlimitedSearchParams = omitLimitedListingFieldParams(searchParams, filterConfigs);

  return sortingFiltersActive
    ? { ...unlimitedSearchParams, [sortConfig.queryParamName]: null }
    : unlimitedSearchParams;
};

/**
 * Extract search parameters, including a custom URL params,
 * which are validated by mapping the values to marketplace custom config.
 *
 * @param {Object} params Search query params
 * @param {Object} listingFieldsConfig extended data configuration with indexForSearch === true
 * @param {Object} defaultFiltersConfig configuration for default built-in filters.
 * @param {Object} sortConfig config for sort search results feature
 * @param {boolean} isOriginInUse if origin is in use, return it too.
 */
export const pickSearchParamsOnly = (
  params,
  filterConfigs,
  sortConfig,
  mainSearch,
  isOriginInUse
) => {
  const { address, origin, bounds, ...rest } = params || {};
  const boundsMaybe = bounds ? { bounds } : {};
  // Pick keywords separately if the main search type is keywords
  const keywordsMaybe =
    mainSearch.searchType === 'keywords' && params?.keywords ? { keywords: params?.keywords } : {};
  const originMaybe = isOriginInUse && origin ? { origin } : {};
  const filterParams = validFilterParams(rest, filterConfigs);
  const sort = rest[sortConfig.queryParamName];
  const sortMaybe = sort ? { sort } : {};

  return {
    ...boundsMaybe,
    ...originMaybe,
    ...keywordsMaybe,
    ...filterParams,
    ...sortMaybe,
  };
};

/**
 * This helper has 2 functions:
 * - It picks search params from Location instance (location.search)
 * - It verifies that those search params are the same as search params in state.
 *   In some cases, search params are referencing previous params
 *   and listings should not be considered loaded.
 *
 * @param {Object} searchFromLocation searchParams from URL (location.search)
 * @param {Object} searchParamsInProps searchParams from store
 * @param {Object} listingFieldsConfig config for listing's extended data
 * @param {Object} defaultFiltersConfig config for default filters
 * @param {Object} sortConfig config for SortBy feature
 * @returns object containing
 *   1. searchParamsInURL (omit pagination 'page' or 'mapSearch'),
 *   2. urlQueryParams (picked valid search params for listing query), and
 *   3. searchParamsAreInSync is true if searchFromLocation and searchParamsInProps match.
 */
export const searchParamsPicker = (
  searchFromLocation,
  searchParamsInProps,
  filterConfigs,
  sortConfig,
  mainSearch,
  isOriginInUse
) => {
  const { mapSearch, page, ...searchParamsInURL } = parse(searchFromLocation, {
    latlng: ['origin'],
    latlngBounds: ['bounds'],
  });

  // Pick only search params that are part of current search configuration
  const queryParamsFromSearchParams = pickSearchParamsOnly(
    searchParamsInProps,
    filterConfigs,
    sortConfig,
    mainSearch,
    isOriginInUse
  );
  // Pick only search params that are part of current search configuration
  const queryParamsFromURL = pickSearchParamsOnly(
    searchParamsInURL,
    filterConfigs,
    sortConfig,
    mainSearch,
    isOriginInUse
  );

  // Page transition might initially use values from previous search
  const searchParamsAreInSync =
    stringify(queryParamsFromURL) === stringify(queryParamsFromSearchParams);

  return {
    urlQueryParams: queryParamsFromURL,
    searchParamsInURL,
    searchParamsAreInSync,
  };
};

// Listing fields that are indexed for search (so the API can filter on them) but
// must NOT render as standalone filters in the search sidebar — they're driven
// by other UI (e.g. averageRating powers the StarRatingFilter component).
const HIDDEN_LISTING_FIELD_FILTERS = ['averageRating', 'reviewCount'];

export const pickListingFieldFilters = params => {
  const {
    listingFields,
    locationSearch,
    categoryConfiguration,
    activeListingTypes,
    currentPathParams = {},
  } = params;
  const searchParams = parse(locationSearch);
  const categories = categoryConfiguration.categories;
  const validNestedCategoryParamNames = categories
    ? validURLParamForCategoryData(categoryConfiguration.key, categories, 1, searchParams)
    : {};

  const { listingType: listingTypeParam } = currentPathParams;
  const listingTypeParamMaybe = listingTypeParam ? { pub_listingType: listingTypeParam } : {};
  const validListingTypeParamNames = activeListingTypes
    ? validURLParamForListingTypeData(activeListingTypes, {
        ...searchParams,
        ...listingTypeParamMaybe,
      })
    : {};

  const currentCategories = Object.values(validNestedCategoryParamNames);
  const currentListingType = Object.values(validListingTypeParamNames);
  const pickedFields = listingFields.reduce((picked, fieldConfig) => {
    if (HIDDEN_LISTING_FIELD_FILTERS.includes(fieldConfig.key)) return picked;
    const isTargetCategory = isFieldForCategory(currentCategories, fieldConfig);
    const isTargetListingField = isFieldForListingType(currentListingType, fieldConfig);
    return isTargetCategory && isTargetListingField ? [...picked, fieldConfig] : picked;
  }, []);
  return pickedFields;
};
/**
 * Returns listing fields (extended data configs) grouped into arrays. [primaryConfigArray, secondaryConfigArray]
 * @param {Object} configs listing extended data config
 * @param {Array<String>} activeListingTypes select configs that are marked only for these active listing types
 * @returns Array of grouped arrays. First subarray contains primary configs and the second contains secondary configs.
 */
// Internal-only listing fields that the V1H site uses for its own logic
// (Em destaque badge, badge counters, etc.) but that should NOT appear as
// user-facing filters on the search page even if they're marked as
// `indexForSearch` in the Sharetribe Console.
const HIDDEN_FILTER_KEYS = ['featured', 'featuredAt', 'averageRating', 'reviewCount'];

export const groupListingFieldConfigs = (configs, activeListingTypes) =>
  configs.reduce(
    (grouped, config) => {
      const [primary, secondary] = grouped;
      const { listingTypeConfig = {}, filterConfig } = config;
      const isIndexed = filterConfig?.indexForSearch === true;
      const isActiveListingTypes =
        !listingTypeConfig.limitToListingTypeIds ||
        listingTypeConfig.listingTypeIds.some(lt => activeListingTypes.includes(lt));
      const isPrimary = filterConfig?.group === 'primary';
      const isHidden = HIDDEN_FILTER_KEYS.includes(config.key);
      return isActiveListingTypes && isIndexed && isPrimary && !isHidden
        ? [[...primary, config], secondary]
        : isActiveListingTypes && isIndexed && !isHidden
        ? [primary, [...secondary, config]]
        : grouped;
    },
    [[], []]
  );

export const createSearchResultSchema = (
  listings,
  mainSearchData,
  intl,
  routeConfiguration,
  config,
  pageHeading
) => {
  // Schema for search engines (helps them to understand what this page is about)
  // http://schema.org
  // We are using JSON-LD format
  const marketplaceName = config.marketplaceName;
  const { address, keywords } = mainSearchData;
  const keywordsMaybe = keywords ? `"${keywords}"` : null;
  const searchTitle =
    address || keywordsMaybe || intl.formatMessage({ id: 'SearchPage.schemaForSearch' });
  const schemaDescription = intl.formatMessage({ id: 'SearchPage.schemaDescription' });
  const schemaTitle = intl.formatMessage(
    { id: 'SearchPage.schemaTitle' },
    { searchTitle, marketplaceName, h1: pageHeading }
  );

  const schemaListings = listings.map((l, i) => {
    const title = l.attributes.title;
    const pathToItem = createResourceLocatorString('ListingPage', routeConfiguration, {
      id: l.id.uuid,
      slug: createSlug(title),
    });
    return {
      '@type': 'ListItem',
      position: i,
      url: `${config.marketplaceRootURL}${pathToItem}`,
      name: title,
    };
  });

  const schemaMainEntity = JSON.stringify({
    '@type': 'ItemList',
    name: searchTitle,
    itemListOrder: 'http://schema.org/ItemListOrderAscending',
    itemListElement: schemaListings,
  });
  return {
    title: schemaTitle,
    description: schemaDescription,
    schema: {
      '@context': 'http://schema.org',
      '@type': 'SearchResultsPage',
      description: schemaDescription,
      name: schemaTitle,
      mainEntity: [schemaMainEntity],
    },
  };
};

export const getDatesAndSeatsMaybe = (currentParams, newParams) => {
  const { seats, dates: newDates } = newParams;
  const { dates: currentDates } = currentParams;

  // Determine which dates and seats to use:
  // - if newDates has a value, it was just selected
  // - if newDates is null, it was just cleared
  // - if newDates is undefined, it was not modified, and we use currentDates
  const dates = !!newDates || newDates === null ? newDates : currentDates;

  const today = stringifyDateToISO8601(new Date());
  const aWeekFromNow = stringifyDateToISO8601(addTime(today, 7, 'day'));
  // Get parameters for dates and seats:
  // - If both dates and seats are included, pass both
  // - Dates can be queried without seats
  // - Seats cannot be queried without dates – pass a default date range
  //   of one week with the provided seats value
  // - If neither dates nor seats exist, set them to null to clear them from search
  const datesAndSeatsMaybe =
    dates && seats
      ? { dates, seats }
      : dates
      ? { dates }
      : seats
      ? { seats, dates: `${today},${aWeekFromNow}` }
      : { seats: null, dates: null };
  return datesAndSeatsMaybe;
};

/**
 * Returns params for createResourceLocatorString function based on the current
 * location and route configuration
 * @param {*} routes current route configuration
 * @param {*} location current ReactRouter location
 * @returns an object with the attributes routeName and pathParams, which can then be passed
 * as the corresponding parameters to createResourceLocatorString
 */
export const getSearchPageResourceLocatorStringParams = (routes, location) => {
  const matchedRoutes = matchPathname(location.pathname, routes);
  const searchPageRoute = 'SearchPage';
  const searchPageListingTypeRoute = 'SearchPageWithListingType';

  if (matchedRoutes.length > 0) {
    const matched = matchedRoutes[0];
    const { params: pathParams, route } = matched;
    const routeName =
      route.name === searchPageListingTypeRoute ? searchPageListingTypeRoute : searchPageRoute;

    return {
      routeName,
      pathParams,
    };
  } else {
    console.error(`Route not found for pathname ${location.pathname}, redirecting to SearchPage`);
    return {
      routeName: searchPageRoute,
      pathParams: {},
    };
  }
};

export const getActiveListingTypes = (config, listingTypePathParam) => {
  const availableListingTypes = config?.listing?.listingTypes.map(config => config.listingType);
  const activeListingTypes = listingTypePathParam
    ? availableListingTypes.filter(lt => lt === listingTypePathParam)
    : availableListingTypes;
  return { activeListingTypes };
};
