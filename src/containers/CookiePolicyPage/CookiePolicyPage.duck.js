import { fetchPageAssets } from '../../ducks/hostedAssets.duck';
export const ASSET_NAME = 'cookie-policy';

export const loadData = (params, search) => dispatch => {
  const pageAsset = { cookiePolicy: `content/pages/${ASSET_NAME}.json` };
  return dispatch(fetchPageAssets(pageAsset, true));
};
