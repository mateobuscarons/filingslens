import * as cheerio from 'cheerio';

const BASE = 'https://www.bundesanzeiger.de';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; FilingLens/1.0)',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function extractCookies(response) {
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function initSession() {
  const res = await fetch(`${BASE}/pub/de/start`, { headers: HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`Bundesanzeiger init failed: ${res.status}`);
  const html = await res.text();
  const cookies = extractCookies(res);
  return { html, cookies };
}

function extractFormAction(html) {
  const $ = cheerio.load(html);
  const form = $('form[action*="IFormSubmitListener"]');
  if (!form.length) throw new Error('Bundesanzeiger scraping failed — site structure may have changed');
  const action = form.attr('action');
  return action.startsWith('http') ? action : `${BASE}${action}`;
}

export async function searchCompanies(query) {
  const { html, cookies } = await initSession();
  const formAction = extractFormAction(html);

  const body = new URLSearchParams({
    suche_eingabe: query,
    kategorie_filter: 'jahrn',
  });

  const searchRes = await fetch(formAction, {
    method: 'POST',
    headers: {
      ...HEADERS,
      Cookie: cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    redirect: 'follow',
  });

  if (!searchRes.ok) throw new Error(`Bundesanzeiger search failed: ${searchRes.status}`);
  const searchHtml = await searchRes.text();
  const $ = cheerio.load(searchHtml);

  const results = [];
  // Each result row has company name + link to the publication
  $('table.result_list tr, div.result_container .result_item, .publication_list .publication_container').each((_, el) => {
    if (results.length >= 10) return;
    const $el = $(el);
    const link = $el.find('a[href*="pub/de"]').first();
    const href = link.attr('href');
    if (!href) return;
    const name = link.text().trim() || $el.find('.info').text().trim();
    if (!name) return;
    const yearMatch = $el.text().match(/\b(20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    const reportUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    results.push({ name, reportUrl, year });
  });

  // Fallback: look for any links to individual filings
  if (results.length === 0) {
    $('a[href*="/pub/de/"]').each((_, el) => {
      if (results.length >= 10) return;
      const $a = $(el);
      const href = $a.attr('href');
      const name = $a.text().trim();
      if (!name || !href || href === '/pub/de/start') return;
      const yearMatch = ($a.closest('tr, div').text() || '').match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      const reportUrl = href.startsWith('http') ? href : `${BASE}${href}`;
      results.push({ name, reportUrl, year });
    });
  }

  return results;
}

export async function fetchReportText(reportUrl) {
  const res = await fetch(reportUrl, { headers: HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`Bundesanzeiger fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove scripts and styles
  $('script, style, nav, header, footer').remove();

  const container =
    $('div.publication_container').first() ||
    $('div#main-column').first() ||
    $('div.main').first() ||
    $('main').first();

  const el = container.length ? container : $('body');
  const text = el
    .text()
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length < 200) throw new Error('Bundesanzeiger returned an empty or unreadable document');
  return text;
}
