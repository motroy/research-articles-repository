/* Publications page
 * ------------------------------------------------------------------
 * Loads _bibliography/papers.bib, parses it in the browser, and renders a
 * searchable, filterable, sortable list with an interactive year chart.
 * No build step and no dependencies.
 */

// --- Configuration -------------------------------------------------------
const BIB_PATH = '_bibliography/papers.bib';

// Author names matching this pattern are emphasised in the author list.
// Set to null to disable.
const HIGHLIGHT_AUTHOR = /^Motro\b/i;

const SEARCH_DEBOUNCE_MS = 180;

// --- DOM references ------------------------------------------------------
const $ = (id) => document.getElementById(id);

const els = {
    list: $('publicationsList'),
    resultsCount: $('resultsCount'),
    search: $('searchInput'),
    clearSearch: $('clearSearch'),
    sort: $('sortOptions'),
    journalGroup: $('journalFilterGroup'),
    journal: $('filterJournal'),
    from: $('filterStartDate'),
    to: $('filterEndDate'),
    reset: $('clearFilterButton'),
    chart: $('yearChart'),
    chartHint: $('chartHint'),
    exportToggle: $('exportToggle'),
    exportOptions: $('exportOptions'),
    exportBib: $('exportBib'),
    exportCsv: $('exportCsv'),
    exportMd: $('exportMd'),
    exportJson: $('exportJson'),
    themeToggle: $('themeToggle'),
    backToTop: $('backToTop'),
    toast: $('toast'),
    statPublications: $('statPublications'),
    statCitations: $('statCitations'),
    statHIndex: $('statHIndex'),
    statYears: $('statYears'),
};

// --- State ---------------------------------------------------------------
let rawBibtex = '';
let entries = [];
let visibleEntries = [];
let searchTimer = null;
let toastTimer = null;

// --- Icons ---------------------------------------------------------------
const ICONS = {
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    citations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    searchOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M8 11h6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
};

// --- Utilities -----------------------------------------------------------
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchTerms(query) {
    return (query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function highlight(text, query) {
    const safe = escapeHtml(text);
    const terms = searchTerms(query);
    if (terms.length === 0) return safe;
    const pattern = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'gi');
    return safe.replace(pattern, '<mark>$1</mark>');
}

function formatNumber(n) {
    return new Intl.NumberFormat().format(n);
}

function pluralise(count, singular, plural = singular + 's') {
    return count === 1 ? singular : plural;
}

function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
        return ok;
    }
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- BibTeX parsing ------------------------------------------------------
// A small brace-aware parser: handles nested braces, quoted values, bare
// numbers, and comments. Returns [{ type, key, fields, raw }].
function parseBibTeX(source) {
    const text = source.replace(/^\s*%.*$/gm, '');
    const result = [];
    let i = 0;

    const skipWs = () => { while (i < text.length && /\s/.test(text[i])) i++; };

    while (i < text.length) {
        const at = text.indexOf('@', i);
        if (at === -1) break;
        i = at + 1;

        const typeMatch = /^[A-Za-z]+/.exec(text.slice(i));
        if (!typeMatch) continue;
        const type = typeMatch[0].toLowerCase();
        i += typeMatch[0].length;
        skipWs();

        const open = text[i];
        if (open !== '{' && open !== '(') continue;
        const close = open === '{' ? '}' : ')';
        const entryStart = at;
        i++;
        skipWs();

        if (type === 'comment' || type === 'preamble' || type === 'string') {
            // Skip to the matching close brace.
            let depth = 1;
            while (i < text.length && depth > 0) {
                if (text[i] === open) depth++;
                else if (text[i] === close) depth--;
                i++;
            }
            continue;
        }

        const keyEnd = text.indexOf(',', i);
        const bodyEnd = text.indexOf(close, i);
        if (keyEnd === -1 || (bodyEnd !== -1 && bodyEnd < keyEnd)) {
            i = bodyEnd === -1 ? text.length : bodyEnd + 1;
            continue;
        }
        const key = text.slice(i, keyEnd).trim();
        i = keyEnd + 1;

        const fields = {};
        for (;;) {
            skipWs();
            if (i >= text.length) break;
            if (text[i] === close) { i++; break; }
            if (text[i] === ',') { i++; continue; }

            const nameMatch = /^[A-Za-z0-9_\-:.]+/.exec(text.slice(i));
            if (!nameMatch) { i++; continue; }
            const name = nameMatch[0].toLowerCase();
            i += nameMatch[0].length;
            skipWs();
            if (text[i] !== '=') continue;
            i++;
            skipWs();

            let value = '';
            if (text[i] === '{') {
                let depth = 0;
                const start = i;
                do {
                    if (text[i] === '{') depth++;
                    else if (text[i] === '}') depth--;
                    i++;
                } while (i < text.length && depth > 0);
                value = text.slice(start + 1, i - 1);
            } else if (text[i] === '"') {
                const start = ++i;
                while (i < text.length && text[i] !== '"') i++;
                value = text.slice(start, i);
                i++;
            } else {
                const start = i;
                while (i < text.length && text[i] !== ',' && text[i] !== close) i++;
                value = text.slice(start, i);
            }
            fields[name] = value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
        }

        result.push({ type, key, fields, raw: text.slice(entryStart, i).trim() });
    }
    return result;
}

// --- Derived data --------------------------------------------------------
function entryYear(entry) {
    const y = parseInt(entry.fields.year, 10);
    return Number.isFinite(y) ? y : null;
}

function entryCitations(entry) {
    const c = parseInt(entry.fields.citations, 10);
    return Number.isFinite(c) && c > 0 ? c : 0;
}

function entryVenue(entry) {
    return (entry.fields.journal || entry.fields.booktitle || '').trim();
}

function entryAuthors(entry) {
    const raw = (entry.fields.author || '').trim();
    if (!raw) return [];
    // Europe PMC style: "Last F, Last FG" — also accept BibTeX "and".
    return raw.split(/\s+and\s+|,\s*/).map((a) => a.trim()).filter(Boolean);
}

function firstAuthorLastName(entry) {
    const first = entryAuthors(entry)[0];
    if (!first) return '￿';
    return first.split(/\s+/)[0].toLowerCase();
}

function computeHIndex(list) {
    const sorted = list.map(entryCitations).sort((a, b) => b - a);
    let h = 0;
    while (h < sorted.length && sorted[h] >= h + 1) h++;
    return h;
}

function countsByYear(list) {
    const counts = new Map();
    for (const e of list) {
        const y = entryYear(e);
        if (y === null) continue;
        counts.set(y, (counts.get(y) || 0) + 1);
    }
    return counts;
}

// --- URL state -----------------------------------------------------------
function readStateFromUrl() {
    const p = new URLSearchParams(location.search);
    return {
        q: p.get('q') || '',
        sort: p.get('sort') || 'year_newest',
        journal: p.get('journal') || '',
        from: p.get('from') || '',
        to: p.get('to') || '',
    };
}

function writeStateToUrl() {
    const p = new URLSearchParams();
    if (els.search.value.trim()) p.set('q', els.search.value.trim());
    if (els.sort.value !== 'year_newest') p.set('sort', els.sort.value);
    if (els.journal.value) p.set('journal', els.journal.value);
    if (els.from.value) p.set('from', els.from.value);
    if (els.to.value) p.set('to', els.to.value);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function hasActiveFilters() {
    return Boolean(els.search.value.trim() || els.journal.value || els.from.value || els.to.value || els.sort.value !== 'year_newest');
}

// --- Controls ------------------------------------------------------------
function populateControls() {
    const years = [...countsByYear(entries).keys()].sort((a, b) => a - b);
    for (const y of years) {
        els.from.appendChild(new Option(String(y), String(y)));
        els.to.appendChild(new Option(String(y), String(y)));
    }

    const journals = [...new Set(entries.map(entryVenue).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (journals.length > 0) {
        for (const j of journals) els.journal.appendChild(new Option(j, j));
        els.journalGroup.hidden = false;
    }

    const state = readStateFromUrl();
    els.search.value = state.q;
    if ([...els.sort.options].some((o) => o.value === state.sort)) els.sort.value = state.sort;
    if ([...els.journal.options].some((o) => o.value === state.journal)) els.journal.value = state.journal;
    if ([...els.from.options].some((o) => o.value === state.from)) els.from.value = state.from;
    if ([...els.to.options].some((o) => o.value === state.to)) els.to.value = state.to;
    els.clearSearch.hidden = !els.search.value;
}

function renderStats() {
    const years = entries.map(entryYear).filter((y) => y !== null);
    const totalCitations = entries.reduce((sum, e) => sum + entryCitations(e), 0);
    els.statPublications.textContent = formatNumber(entries.length);
    els.statCitations.textContent = formatNumber(totalCitations);
    els.statHIndex.textContent = formatNumber(computeHIndex(entries));
    els.statYears.textContent = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '–';
}

// --- Filtering & sorting -------------------------------------------------
function filterEntries(list) {
    const from = els.from.value ? parseInt(els.from.value, 10) : null;
    const to = els.to.value ? parseInt(els.to.value, 10) : null;
    const journal = els.journal.value;
    const terms = searchTerms(els.search.value);

    return list.filter((e) => {
        const y = entryYear(e);
        if (from !== null && (y === null || y < from)) return false;
        if (to !== null && (y === null || y > to)) return false;
        if (journal && entryVenue(e) !== journal) return false;
        if (terms.length) {
            const haystack = [
                e.fields.title, e.fields.author, e.fields.journal, e.fields.booktitle,
                e.fields.doi, e.fields.pmid, e.fields.year, e.key,
            ].filter(Boolean).join(' ').toLowerCase();
            if (!terms.every((t) => haystack.includes(t))) return false;
        }
        return true;
    });
}

function sortEntries(list) {
    const by = els.sort.value;
    const sorted = [...list];
    const cmpYearDesc = (a, b) => (entryYear(b) ?? -Infinity) - (entryYear(a) ?? -Infinity);
    switch (by) {
        case 'year_oldest':
            sorted.sort((a, b) => (entryYear(a) ?? Infinity) - (entryYear(b) ?? Infinity));
            break;
        case 'citations_desc':
            sorted.sort((a, b) => entryCitations(b) - entryCitations(a) || cmpYearDesc(a, b));
            break;
        case 'author_az':
            sorted.sort((a, b) => firstAuthorLastName(a).localeCompare(firstAuthorLastName(b)) || cmpYearDesc(a, b));
            break;
        case 'title_az':
            sorted.sort((a, b) => (a.fields.title || '').localeCompare(b.fields.title || '', undefined, { sensitivity: 'base' }));
            break;
        default:
            sorted.sort((a, b) => cmpYearDesc(a, b) || entryCitations(b) - entryCitations(a));
    }
    return sorted;
}

function update() {
    visibleEntries = sortEntries(filterEntries(entries));
    renderList(visibleEntries, els.search.value);
    renderCount(visibleEntries.length, entries.length);
    renderChart();
    els.reset.hidden = !hasActiveFilters();
    els.clearSearch.hidden = !els.search.value;
    writeStateToUrl();
}

function renderCount(shown, total) {
    const noun = pluralise(total, 'publication');
    els.resultsCount.innerHTML = shown === total
        ? `<strong>${formatNumber(total)}</strong> ${noun}`
        : `<strong>${formatNumber(shown)}</strong> of ${formatNumber(total)} ${noun}`;
}

// --- Rendering -----------------------------------------------------------
function renderAuthors(entry, query) {
    const authors = entryAuthors(entry);
    if (authors.length === 0) return '';
    const parts = authors.map((name) => {
        const html = highlight(name, query);
        return HIGHLIGHT_AUTHOR && HIGHLIGHT_AUTHOR.test(name)
            ? `<span class="author-me">${html}</span>`
            : html;
    });
    return `<p class="pub-authors">${parts.join(', ')}</p>`;
}

function renderCard(entry, query) {
    const f = entry.fields;
    const title = f.title || 'Untitled';
    const url = f.url || (f.doi ? `https://doi.org/${f.doi}` : '');
    const year = entryYear(entry);
    const venue = entryVenue(entry);
    const citations = entryCitations(entry);

    const titleHtml = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${highlight(title, query)}</a>`
        : highlight(title, query);

    const tags = [];
    if (venue) tags.push(`<span class="tag tag-journal">${highlight(venue, query)}</span>`);
    if (citations > 0) tags.push(`<span class="tag tag-citations">${ICONS.citations}${formatNumber(citations)} ${pluralise(citations, 'citation')}</span>`);
    if (f.doi) tags.push(`<span class="tag tag-doi">${highlight(f.doi, query)}</span>`);
    if (f.pages) tags.push(`<span class="tag">pp. ${escapeHtml(f.pages)}</span>`);

    const actions = [];
    if (url) actions.push(`<a class="action-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">${ICONS.external}View article</a>`);
    if (f.pmid) actions.push(`<a class="action-btn" href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(f.pmid)}/" target="_blank" rel="noopener">${ICONS.external}PubMed</a>`);
    if (f.doi) actions.push(`<button class="action-btn" type="button" data-action="copy-doi" data-key="${escapeHtml(entry.key)}">${ICONS.copy}Copy DOI</button>`);
    actions.push(`<button class="action-btn" type="button" data-action="copy-bibtex" data-key="${escapeHtml(entry.key)}">${ICONS.quote}Copy BibTeX</button>`);

    return `
        <li class="pub-card">
            <div class="pub-top">
                <h3 class="pub-title">${titleHtml}</h3>
                ${year !== null ? `<span class="pub-year-badge">${year}</span>` : ''}
            </div>
            ${renderAuthors(entry, query)}
            ${tags.length ? `<div class="pub-meta">${tags.join('')}</div>` : ''}
            <div class="pub-actions">${actions.join('')}</div>
        </li>`;
}

function renderList(list, query) {
    els.list.setAttribute('aria-busy', 'false');
    if (list.length === 0) {
        const q = els.search.value.trim();
        els.list.innerHTML = `
            <div class="empty-state">
                ${ICONS.searchOff}
                <p class="empty-title">No publications found</p>
                <p>${q ? `Nothing matches “${escapeHtml(q)}”.` : 'Nothing matches the current filters.'}</p>
                <button class="btn btn-secondary" type="button" data-action="reset">Reset filters</button>
            </div>`;
        return;
    }
    els.list.innerHTML = `<ul>${list.map((e) => renderCard(e, query)).join('')}</ul>`;
}

function renderError(message) {
    els.list.setAttribute('aria-busy', 'false');
    els.list.innerHTML = `
        <div class="empty-state">
            ${ICONS.alert}
            <p class="empty-title">Couldn’t load publications</p>
            <p>${escapeHtml(message)}</p>
        </div>`;
    els.resultsCount.textContent = 'Unavailable';
}

// --- Chart ---------------------------------------------------------------
function renderChart() {
    const totals = countsByYear(entries);
    if (totals.size === 0) {
        els.chart.innerHTML = '';
        return;
    }
    const years = [...totals.keys()];
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const span = [];
    for (let y = minYear; y <= maxYear; y++) span.push(y);

    const max = Math.max(...totals.values());
    const from = els.from.value ? parseInt(els.from.value, 10) : null;
    const to = els.to.value ? parseInt(els.to.value, 10) : null;
    const rangeActive = from !== null || to !== null;
    const singleYear = from !== null && to !== null && from === to ? from : null;

    const width = Math.max(560, span.length * 34);
    const height = 180;
    const pad = { top: 22, right: 8, bottom: 28, left: 8 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const slot = innerW / span.length;
    const barW = Math.min(26, slot * 0.7);
    const labelEvery = span.length > 18 ? Math.ceil(span.length / 12) : 1;

    let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<line class="axis" x1="${pad.left}" y1="${height - pad.bottom + 0.5}" x2="${width - pad.right}" y2="${height - pad.bottom + 0.5}"/>`;

    span.forEach((year, idx) => {
        const count = totals.get(year) || 0;
        const x = pad.left + idx * slot + (slot - barW) / 2;
        const h = count ? Math.max(3, (count / max) * innerH) : 0;
        const y = height - pad.bottom - h;
        const inRange = !rangeActive || ((from === null || year >= from) && (to === null || year <= to));
        const classes = ['bar-group'];
        if (singleYear === year) classes.push('is-active');
        else if (rangeActive && !inRange) classes.push('is-dimmed');
        const label = `${year}: ${count} ${pluralise(count, 'publication')}`;
        const showLabel = idx % labelEvery === 0 || idx === span.length - 1;

        svg += `<g class="${classes.join(' ')}" data-year="${year}" tabindex="${count ? 0 : -1}" role="button" aria-label="${label}">`;
        svg += `<title>${label}</title>`;
        svg += `<rect class="bar-hit" x="${pad.left + idx * slot}" y="${pad.top}" width="${slot}" height="${innerH}"/>`;
        if (count) {
            svg += `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4"/>`;
            svg += `<text class="bar-value" x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${count}</text>`;
        }
        if (showLabel) {
            svg += `<text class="bar-label" x="${(pad.left + idx * slot + slot / 2).toFixed(1)}" y="${height - 9}" text-anchor="middle">${year}</text>`;
        }
        svg += '</g>';
    });
    svg += '</svg>';
    els.chart.innerHTML = svg;
    els.chartHint.textContent = singleYear !== null
        ? `Showing ${singleYear}. Click the bar again to show all years.`
        : 'Click a bar to filter by year.';
}

function toggleYear(year) {
    const current = els.from.value && els.from.value === els.to.value ? els.from.value : null;
    if (current === String(year)) {
        els.from.value = '';
        els.to.value = '';
    } else {
        els.from.value = String(year);
        els.to.value = String(year);
    }
    update();
}

// --- Export --------------------------------------------------------------
function exportScope() {
    const filtered = visibleEntries.length !== entries.length;
    return { list: visibleEntries, suffix: filtered ? '-filtered' : '' };
}

function csvCell(value) {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportBib() {
    const { list, suffix } = exportScope();
    const content = suffix ? list.map((e) => e.raw).join('\n\n') + '\n' : rawBibtex;
    downloadFile(`publications${suffix}.bib`, content, 'application/x-bibtex');
}

function exportCsv() {
    const { list, suffix } = exportScope();
    const header = ['Type', 'Key', 'Title', 'Authors', 'Year', 'Journal', 'DOI', 'PMID', 'Citations', 'URL'];
    const rows = list.map((e) => [
        e.type, e.key, e.fields.title || '', e.fields.author || '', e.fields.year || '',
        entryVenue(e), e.fields.doi || '', e.fields.pmid || '', entryCitations(e) || '',
        e.fields.url || (e.fields.doi ? `https://doi.org/${e.fields.doi}` : ''),
    ].map(csvCell).join(','));
    downloadFile(`publications${suffix}.csv`, [header.join(','), ...rows].join('\n') + '\n', 'text/csv');
}

function exportMd() {
    const { list, suffix } = exportScope();
    let md = '# Publications\n\n';
    for (const e of list) {
        const f = e.fields;
        const url = f.url || (f.doi ? `https://doi.org/${f.doi}` : '');
        md += `## ${f.title || 'Untitled'}\n\n`;
        md += `- **Authors:** ${f.author || 'N/A'}\n`;
        md += `- **Year:** ${f.year || 'N/A'}\n`;
        if (entryVenue(e)) md += `- **Journal:** ${entryVenue(e)}\n`;
        if (f.doi) md += `- **DOI:** [${f.doi}](https://doi.org/${f.doi})\n`;
        if (f.pmid) md += `- **PMID:** [${f.pmid}](https://pubmed.ncbi.nlm.nih.gov/${f.pmid}/)\n`;
        if (entryCitations(e)) md += `- **Citations:** ${entryCitations(e)}\n`;
        if (url) md += `- **URL:** <${url}>\n`;
        md += '\n';
    }
    downloadFile(`publications${suffix}.md`, md, 'text/markdown');
}

function exportJson() {
    const { list, suffix } = exportScope();
    const data = list.map((e) => ({ type: e.type, key: e.key, ...e.fields, citations: entryCitations(e) || undefined }));
    downloadFile(`publications${suffix}.json`, JSON.stringify(data, null, 2) + '\n', 'application/json');
}

function setExportMenu(open) {
    els.exportOptions.hidden = !open;
    els.exportToggle.setAttribute('aria-expanded', String(open));
    if (open) els.exportOptions.querySelector('button')?.focus();
}

// --- Theme ---------------------------------------------------------------
function currentTheme() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit === 'dark' || explicit === 'light') return explicit;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeToggleLabel() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    els.themeToggle.setAttribute('aria-label', `Switch to ${next} theme`);
}

function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* ignore */ }
    updateThemeToggleLabel();
}

// --- Events --------------------------------------------------------------
function bindEvents() {
    els.search.addEventListener('input', () => {
        els.clearSearch.hidden = !els.search.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(update, SEARCH_DEBOUNCE_MS);
    });

    els.search.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && els.search.value) {
            ev.preventDefault();
            els.search.value = '';
            update();
        }
    });

    els.clearSearch.addEventListener('click', () => {
        els.search.value = '';
        update();
        els.search.focus();
    });

    for (const el of [els.sort, els.journal, els.from, els.to]) {
        el.addEventListener('change', () => {
            if (els.from.value && els.to.value && parseInt(els.from.value, 10) > parseInt(els.to.value, 10)) {
                if (el === els.from) els.to.value = els.from.value;
                else els.from.value = els.to.value;
            }
            update();
        });
    }

    const reset = () => {
        els.search.value = '';
        els.sort.value = 'year_newest';
        els.journal.value = '';
        els.from.value = '';
        els.to.value = '';
        update();
    };
    els.reset.addEventListener('click', reset);

    els.list.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'reset') { reset(); return; }

        const entry = entries.find((e) => e.key === btn.dataset.key);
        if (!entry) return;
        const text = action === 'copy-doi' ? entry.fields.doi : entry.raw;
        const ok = await copyText(text);
        showToast(ok ? (action === 'copy-doi' ? 'DOI copied' : 'BibTeX copied') : 'Copy failed');
        if (ok) {
            const original = btn.innerHTML;
            btn.classList.add('is-done');
            btn.innerHTML = `${ICONS.check}Copied`;
            setTimeout(() => { btn.classList.remove('is-done'); btn.innerHTML = original; }, 1600);
        }
    });

    els.chart.addEventListener('click', (ev) => {
        const g = ev.target.closest('.bar-group');
        if (g) toggleYear(parseInt(g.dataset.year, 10));
    });
    els.chart.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const g = ev.target.closest('.bar-group');
        if (g) { ev.preventDefault(); toggleYear(parseInt(g.dataset.year, 10)); }
    });

    els.exportToggle.addEventListener('click', () => setExportMenu(els.exportOptions.hidden));
    els.exportBib.addEventListener('click', () => { exportBib(); setExportMenu(false); });
    els.exportCsv.addEventListener('click', () => { exportCsv(); setExportMenu(false); });
    els.exportMd.addEventListener('click', () => { exportMd(); setExportMenu(false); });
    els.exportJson.addEventListener('click', () => { exportJson(); setExportMenu(false); });
    document.addEventListener('click', (ev) => {
        if (!els.exportOptions.hidden && !ev.target.closest('.export-menu')) setExportMenu(false);
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !els.exportOptions.hidden) { setExportMenu(false); els.exportToggle.focus(); }
    });

    els.themeToggle.addEventListener('click', toggleTheme);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeToggleLabel);

    // Keyboard shortcut: "/" focuses search.
    document.addEventListener('keydown', (ev) => {
        if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        ev.preventDefault();
        els.search.focus();
        els.search.select();
    });

    // Back to top.
    const onScroll = () => { els.backToTop.hidden = window.scrollY < 600; };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    els.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// --- Boot ----------------------------------------------------------------
async function init() {
    updateThemeToggleLabel();
    bindEvents();

    try {
        const response = await fetch(BIB_PATH, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${BIB_PATH}`);
        rawBibtex = await response.text();
        entries = parseBibTeX(rawBibtex);
    } catch (err) {
        console.error('Failed to load publications:', err);
        renderError(err.message);
        return;
    }

    if (entries.length === 0) {
        renderError('The bibliography file is empty or could not be parsed.');
        return;
    }

    populateControls();
    renderStats();
    els.exportToggle.disabled = false;
    update();
}

init();
