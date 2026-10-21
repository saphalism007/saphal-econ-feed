/**
 * Builds feed.json for the Saphal Economics PhD app.
 *
 * Runs twice a day on GitHub Actions (.github/workflows/update.yml). It reads
 * public RSS and Atom feeds from news outlets, central banks, research
 * networks and scholarship sites, keeps items from the last few weeks, tags
 * them by topic and relevance (Nepal, South Asia, development, PhD study),
 * and writes one small JSON file that the app reads.
 *
 * Nothing is rewritten: each item keeps its own headline, source, date and
 * link, and a short excerpt of the source's own summary. Items from
 * scholarship aggregators are marked as secondary sources, to be confirmed
 * on the official page.
 *
 * Run locally:  node build.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PUBLISHED = "https://saphalism007.github.io/saphal-econ-feed/feed.json";

const G = (q, region = "US") =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-${region}&gl=${region}&ceid=${region}:en`;

/** section: world, nepal, policy, research, ideas, scholarships */
const FEEDS = [
  // World economy
  { section: "world", source: "The Economist", url: "https://www.economist.com/finance-and-economics/rss.xml" },
  { section: "world", source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", filter: "econ" },
  { section: "world", source: "The Guardian", url: "https://www.theguardian.com/business/economics/rss" },
  { section: "world", source: "Google News: world economy", url: G("global economy OR world economy OR inflation OR recession"), google: true },
  // Nepal and South Asia
  { section: "nepal", source: "Google News: Nepal economy", url: G("Nepal economy", "NP"), google: true },
  { section: "nepal", source: "Google News: Nepal Rastra Bank", url: G('"Nepal Rastra Bank"', "NP"), google: true },
  { section: "nepal", source: "The Kathmandu Post", url: "https://kathmandupost.com/rss", path: "/money/" },
  { section: "nepal", source: "The Himalayan Times", url: "https://thehimalayantimes.com/rssFeed/15", filter: "econ" },
  { section: "nepal", source: "Onlinekhabar English", url: "https://english.onlinekhabar.com/feed", filter: "econ" },
  { section: "nepal", source: "Nepali Times", url: "https://www.nepalitimes.com/feed", filter: "econ" },
  { section: "nepal", source: "Google News: South Asia economy", url: G('"South Asia" economy OR India economy OR Bangladesh economy'), google: true },
  // Central banks and institutions
  { section: "policy", source: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { section: "policy", source: "European Central Bank", url: "https://www.ecb.europa.eu/rss/press.html" },
  { section: "policy", source: "Google News: IMF and World Bank", url: G('IMF OR "World Bank" OR "Asian Development Bank" economy'), google: true },
  { section: "policy", source: "Liberty Street Economics (New York Fed)", url: "https://libertystreeteconomics.newyorkfed.org/feed/" },
  // Research
  { section: "research", source: "NBER new working papers", url: "https://www.nber.org/rss/new.xml" },
  { section: "research", source: "VoxEU (CEPR)", url: "https://cepr.org/rss/vox-content" },
  { section: "research", source: "VoxDev", url: "https://voxdev.org/rss.xml" },
  { section: "research", source: "PIIE", url: "https://www.piie.com/rss/update.xml" },
  { section: "research", source: "Econofact", url: "https://econofact.org/feed" },
  // Ideas and commentary
  { section: "ideas", source: "Project Syndicate", url: "https://www.project-syndicate.org/rss" },
  { section: "ideas", source: "Marginal Revolution", url: "https://marginalrevolution.com/feed" },
  { section: "ideas", source: "Noahpinion", url: "https://www.noahpinion.blog/feed" },
  // Scholarships, PhD programmes, summer schools
  { section: "scholarships", source: "Scholars4Dev", url: "https://www.scholars4dev.com/feed/", secondary: true, filter: "study" },
  { section: "scholarships", source: "Opportunity Desk", url: "https://opportunitydesk.org/feed/", secondary: true, filter: "study" },
  { section: "scholarships", source: "Google News: funded economics PhD", url: G('"PhD" economics scholarship OR "fully funded" PhD economics'), google: true, secondary: true, filter: "study" },
  { section: "scholarships", source: "Google News: major scholarship calls", url: G('applications open (Chevening OR "DAAD scholarship" OR "Commonwealth Scholarship" OR "Erasmus Mundus" OR "Australia Awards" OR "Fulbright Foreign Student" OR MEXT OR "Swedish Institute")'), google: true, secondary: true, filter: "study" },
  { section: "scholarships", source: "Google News: economics predocs and summer schools", url: G('"predoctoral" economics fellowship OR "summer school" economics applications OR "PhD position" economics'), google: true, secondary: true, filter: "study" },
  { section: "scholarships", source: "Google News: Nepali students abroad", url: G("scholarship Nepali students", "NP"), google: true, secondary: true, filter: "study" },
];

const ECON = /econom|gdp|inflation|price|bank|monetary|fiscal|budget|tax|revenue|trade|export|import|tariff|remittance|invest|market|stock|share|loan|interest|debt|imf|world bank|adb|growth|recession|employment|unemploy|labou?r|wage|currency|rupee|dollar|forex|reserve|financ|industr|energy|hydro|tourism|capital|subsid|poverty|income|cost|fuel|oil|insurance|nepse|ministry of finance|nrb/i;
const STUDY = /scholar|fellowship|phd|doctoral|doctorate|master'?s|graduate|postgraduate|university|funded|stipend|tuition|summer school|programme|program|admission|chevening|fulbright|daad|commonwealth|erasmus|award/i;
const NOT_STUDY = /teacher|high school|football|cricket|athlete|sports|public health|medical|medicine|nursing|clinical|pharma|informatics|scientist program|engineering|art residenc|artist|film|music|dance|journalis|hackathon|competition|contest|award ceremony|wins? |won |alumni|obituary/i;
// A study item must also be open to economists: economics, policy, development, social science, or any field.
const FOR_ECON = /econom|policy|public administration|development|social science|finance|business|international students|developing countr|all fields|any field|all disciplines|fully funded|full scholarship|nepal|south asia|chevening|fulbright|daad|commonwealth|erasmus|australia awards|gates cambridge|rhodes|knight-hennessy|mext|swedish institute|phd|doctoral/i;
// Reputable outlets for Google News results; everything else from Google News is dropped.
const REPUTABLE = /reuters|associated press|\bap news\b|bloomberg|financial times|wall street journal|new york times|washington post|the economist|bbc|guardian|cnbc|al jazeera|nikkei|south china morning post|the hindu|indian express|mint|livemint|business standard|economic times|hindustan times|dawn|daily star|the diplomat|devex|imf|world bank|asian development bank|adb|un news|ft\.com|forbes|fortune|axios|politico|npr|marketplace|kathmandu post|republica|himalayan times|rising nepal|nepalnews|onlinekhabar|nepal live today|annapurna express|setopati|ratopati|sharesansar|new business age|nepal economic forum|karobar|kantipur|nagarik|xinhua|nepal monitor|times higher education|university world news|inside higher ed|scholars4dev|opportunity desk|study international|qs|the pie news|icef/i;
// Outlets that announce study calls; accepted for the scholarships section only.
const STUDY_OUTLET = /opportunit|scholar|universit|college|school|institute|fundsforngos|u\.s\. news|daad|chevening|fulbright|study|education|academ|graduate|research/i;
const NOISE = /exchange rates? for|foreign exchange rate|forex rates? today|gold (and silver )?price|horoscope|evening briefing|morning briefing|news briefing|live updates|share market today|nepse (index )?(closes|gains|loses|falls|rises)|lottery|recipe|watch:|video:|podcast:/i;

const TAGS = [
  ["Nepal", /nepal|kathmandu|nrb|nepse|rupee/i],
  ["South Asia", /south asia|india|bangladesh|pakistan|sri lanka|bhutan|maldives/i],
  ["Development", /develop|poverty|aid|inequality|africa|low[- ]income|remittance|microfinance|rct|randomi[sz]ed/i],
  ["Monetary", /monetary|central bank|interest rate|inflation|federal reserve|\bfed\b|ecb|rate cut|rate hike/i],
  ["Trade", /trade|tariff|export|import|wto/i],
  ["Labour", /labou?r|wage|employ|jobs|worker/i],
  ["Public finance", /fiscal|budget|tax|debt|deficit|spending/i],
  ["AI and technology", /\bai\b|artificial intelligence|automation|technology|digital/i],
  ["Climate", /climate|carbon|emission|green|energy transition/i],
  ["PhD", /phd|doctoral|doctorate|predoc|research assistant|job market/i],
  ["Funded", /fully funded|full scholarship|stipend|tuition waiver|fully-funded/i],
];

const ent = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };
function clean(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ent[n.toLowerCase()] ?? m)
    // house style: plain punctuation only
    .replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[•·]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};
function linkOf(block) {
  const l = tag(block, "link");
  if (l && clean(l)) return clean(l);
  const href = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return href ? href[1].replace(/&amp;/g, "&") : "";
}

function parse(xml) {
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const entries = blocks.length ? blocks : [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return entries.map((b) => ({
    title: clean(tag(b, "title")),
    link: linkOf(b),
    date: clean(tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || tag(b, "dc:date")),
    summary: clean(tag(b, "description") || tag(b, "summary") || tag(b, "content")),
    google: clean(tag(b, "source")),
  }));
}

const MAX_AGE_DAYS = { world: 7, nepal: 10, policy: 14, research: 21, ideas: 10, scholarships: 45 };
const PER_SECTION = { world: 45, nepal: 45, policy: 35, research: 45, ideas: 25, scholarships: 70 };

async function get(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SaphalEconFeed/1.0; +https://saphalism007.github.io/saphal-economics-phd/)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

const now = Date.now();
// The previous feed: keeps first-seen dates and older items still inside their window.
let previous = { items: [] };
try {
  if (existsSync(new URL("./feed.json", import.meta.url))) previous = JSON.parse(readFileSync(new URL("./feed.json", import.meta.url), "utf8"));
  else previous = await (await fetch(PUBLISHED, { signal: AbortSignal.timeout(15000) })).json();
} catch { /* first run */ }
const firstSeen = new Map((previous.items || []).map((x) => [x.link, Date.parse(x.date)]));
const items = [];
const report = [];
await Promise.all(FEEDS.map(async (f) => {
  try {
    const xml = await get(f.url);
    const channelDate = clean(tag(xml.split(/<item[\s>]|<entry[\s>]/i)[0], "lastBuildDate") || tag(xml.split(/<item[\s>]|<entry[\s>]/i)[0], "pubDate"));
    let got = parse(xml).filter((x) => x.title && x.link && !NOISE.test(x.title));
    const total = got.length;
    if (f.filter === "econ") got = got.filter((x) => ECON.test(x.title + " " + x.summary));
    if (f.filter === "study") got = got.filter((x) => STUDY.test(x.title + " " + x.summary) && FOR_ECON.test(x.title + " " + x.summary) && !NOT_STUDY.test(x.title));
    if (f.path) got = got.filter((x) => x.link.includes(f.path));
    let kept = 0;
    for (const x of got) {
      // Feeds without dates (NBER, the Kathmandu Post): use the day this item was first seen.
      const seenBefore = firstSeen.get(x.link);
      let t = Date.parse(x.date);
      const dated = Number.isFinite(t);
      if (!dated) t = seenBefore ?? (Number.isFinite(Date.parse(channelDate)) ? Math.min(Date.parse(channelDate), now) : now);
      if (now - t > MAX_AGE_DAYS[f.section] * 86400000 || t - now > 86400000) continue;
      let title = x.title;
      let source = f.source;
      // Google News titles end with " - Outlet"; keep the outlet as the source.
      if (f.google) {
        const outlet = x.google || (title.match(/ - ([^-]+)$/) || [])[1];
        if (outlet) { title = title.replace(new RegExp(` - ${outlet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), ""); source = outlet.trim(); }
        if (!REPUTABLE.test(source) && !(f.section === "scholarships" && STUDY_OUTLET.test(source))) continue;
      }
      const summary = f.google ? "" : x.summary.slice(0, 280) + (x.summary.length > 280 ? "..." : "");
      const text = title + " " + summary;
      items.push({
        section: f.section, title, link: x.link, source, via: f.google ? "Google News" : undefined,
        date: new Date(t).toISOString(), seen: dated ? undefined : true, summary: summary || undefined,
        tags: TAGS.filter(([, re]) => re.test(text)).map(([n]) => n),
        secondary: f.secondary || undefined,
      });
      kept++;
    }
    report.push({ source: f.source, section: f.section, ok: true, items: total, kept });
  } catch (e) {
    report.push({ source: f.source, section: f.section, ok: false, error: String(e.message || e) });
  }
}));

// Keep earlier items that have dropped out of their feeds but are still recent.
for (const old of previous.items || []) {
  const age = now - Date.parse(old.date);
  if (age <= MAX_AGE_DAYS[old.section] * 86400000 && !items.some((x) => x.link === old.link)) items.push(old);
}

// Remove repeats (the same story from two feeds), newest first, cap each section.
const seen = new Set();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").slice(0, 80);
const out = [];
for (const it of items.sort((a, b) => b.date.localeCompare(a.date))) {
  const k = norm(it.title);
  if (seen.has(k) || seen.has(it.link)) continue;
  seen.add(k); seen.add(it.link);
  if (out.filter((o) => o.section === it.section).length >= PER_SECTION[it.section]) continue;
  // No single source may crowd out the rest of a section.
  if (out.filter((o) => o.section === it.section && o.source === it.source).length >= (it.section === "scholarships" ? 6 : 14)) continue;
  out.push(it);
}

const feed = { updated: new Date().toISOString(), sources: report.sort((a, b) => a.section.localeCompare(b.section) || a.source.localeCompare(b.source)), items: out };
writeFileSync(new URL("./feed.json", import.meta.url), JSON.stringify(feed));
const by = Object.entries(out.reduce((a, x) => ((a[x.section] = (a[x.section] || 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(", ");
console.log(`feed.json: ${out.length} items (${by}); ${report.filter((r) => !r.ok).length} of ${FEEDS.length} sources failed.`);
for (const r of report) if (!r.ok || !r.kept) console.log(`  ${r.ok ? "no recent items" : "failed"}: ${r.source} ${r.error || `(${r.items} in feed)`}`);
