/* App Store campaign attribution only. No analytics requests, cookies or IDs.
   Recognized referrals last for this tab's session, for at most 30 minutes.
   Unknown external arrivals clear prior attribution. Google != Gemini/AI Mode. */
(function () {
  'use strict';
  var key = 'stephaven.website.source.v1';
  var allowed = ['ai_chatgpt', 'ai_gemini', 'web_google', 'web_bing', 'producthunt'];
  var generic = ['website', 'guide_cozy', 'guide_friends', 'guide_compare', 'guide_movement'];
  var q = new URLSearchParams(location.search);
  var ref = null;
  try { ref = new URL(document.referrer); } catch (e) {}
  function hostIs(host, domain) { return host === domain || host.endsWith('.' + domain); }
  var source = null;
  var tagged = (q.get('utm_source') || '').toLowerCase();
  if (tagged === 'chatgpt.com' || tagged === 'chatgpt') source = 'ai_chatgpt';
  else if (tagged === 'gemini.google.com' || tagged === 'gemini') source = 'ai_gemini';
  else if (q.get('ref') === 'producthunt' || tagged === 'producthunt') source = 'producthunt';
  if (!source && ref) {
    if (hostIs(ref.hostname, 'chatgpt.com') || ref.hostname === 'chat.openai.com') source = 'ai_chatgpt';
    else if (ref.hostname === 'gemini.google.com') source = 'ai_gemini';
    else if (hostIs(ref.hostname, 'google.com')) source = 'web_google';
    else if (hostIs(ref.hostname, 'bing.com')) source = 'web_bing';
    else if (hostIs(ref.hostname, 'producthunt.com')) source = 'producthunt';
  }
  var external = ref && ref.origin !== location.origin;
  var otherCampaign = q.has('utm_source') || q.has('ref');
  try {
    if (source) sessionStorage.setItem(key, JSON.stringify({source: source, at: Date.now()}));
    else if (external || otherCampaign) sessionStorage.removeItem(key);
    else {
      var saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved && allowed.indexOf(saved.source) !== -1 && Date.now() - saved.at >= 0 && Date.now() - saved.at < 1800000) source = saved.source;
      else sessionStorage.removeItem(key);
    }
  } catch (e) { /* Campaign links still work when storage is unavailable. */ }
  if (!source) return;
  document.querySelectorAll('a[href]').forEach(function (link) {
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return; }
    if (url.hostname !== 'apps.apple.com' || !url.pathname.endsWith('/id6817135263')) return;
    if (generic.indexOf(url.searchParams.get('ct')) === -1) return;
    url.searchParams.set('ct', source);
    link.href = url.href;
  });
})();
