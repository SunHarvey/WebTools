'use strict';

(function initLocaleRedirect(globalScope) {
  function chooseChineseUrl(languages, search, chineseUrl) {
    const params = new URLSearchParams(search || '');
    if (params.get('lang') === 'en') return null;
    const preferred = Array.isArray(languages) ? languages : [];
    for (const language of preferred) {
      const normalized = String(language).toLowerCase();
      if (normalized.startsWith('zh')) return chineseUrl;
      if (normalized.startsWith('en')) return null;
    }
    return null;
  }

  function sameHostPath(url) {
    const parsed = new URL(url, 'https://www.utilcover.com');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  function preserveEnglishLinks(documentObject, origin) {
    for (const anchor of documentObject.querySelectorAll('a[href^="/"]')) {
      const url = new URL(anchor.getAttribute('href'), origin);
      if (url.pathname.startsWith('/zh/')) continue;
      url.searchParams.set('lang', 'en');
      anchor.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function applyEnglishPreference(documentObject, locationObject) {
    if (new URLSearchParams(locationObject.search).get('lang') !== 'en') return false;
    const apply = () => preserveEnglishLinks(documentObject, locationObject.origin);
    if (documentObject.readyState === 'loading') documentObject.addEventListener('DOMContentLoaded', apply, { once: true });
    else apply();
    return true;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { chooseChineseUrl, preserveEnglishLinks, sameHostPath, applyEnglishPreference };
  }

  if (!globalScope || !globalScope.document || !globalScope.location || !globalScope.navigator) return;
  const alternate = globalScope.document.querySelector('link[rel="alternate"][hreflang="zh-CN"]');
  if (!alternate) return;
  const languages = globalScope.navigator.languages || [globalScope.navigator.language];
  applyEnglishPreference(globalScope.document, globalScope.location);
  const destination = chooseChineseUrl(languages, globalScope.location.search, sameHostPath(alternate.href));
  if (destination) globalScope.location.replace(destination);
})(typeof window !== 'undefined' ? window : null);
