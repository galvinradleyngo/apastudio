// Citation Generator UI: form handling, DOI/URL/PDF resolution and live citation preview.

// ── Citation Generator Engine ──────────────────────────────────────────
let currentCitationPlain = '';
let currentCitationMarked = '';

const sampleCitations = {
    nature: {
        type: 'journal',
        title: 'Array programming with NumPy',
        authors: 'Harris, C. R., Millman, K. J., & van der Walt, S. J.',
        year: '2020',
        source: 'Nature',
        volume: '585',
        issue: '7825',
        pages: '357–362',
        doiUrl: 'https://doi.org/10.1038/s41586-020-2649-2',
        status: { title: 'Verified Nature Article', desc: 'Loaded verified sample via DOI 10.1038/s41586-020-2649-2' }
    },
    arxiv: {
        type: 'journal',
        title: 'Verifiable Fully Homomorphic Encryption',
        authors: 'Viand, A., & Knabenhans, C.',
        year: '2023',
        source: 'arXiv',
        volume: '',
        issue: '',
        pages: '',
        doiUrl: 'https://doi.org/10.48550/arXiv.2301.07041',
        status: { title: 'Verified arXiv Preprint', desc: 'Loaded preprint sample via DOI 10.48550/arXiv.2301.07041' }
    },
    who: {
        type: 'webpage',
        title: 'Mental health: Strengthening our response',
        authors: '',
        year: '2022',
        monthDay: 'June 17',
        source: 'World Health Organization',
        volume: '',
        issue: '',
        pages: '',
        doiUrl: 'https://www.who.int/news-room/fact-sheets/detail/mental-health-strengthening-our-response',
        status: { title: 'Verified WHO Webpage', desc: 'In APA 7, when author and site are identical, the organization is listed in the author position.' }
    }
};

function switchCitationTab(tab) {
    const isPdf = tab === 'pdf';
    document.getElementById('tab-btn-pdf').setAttribute('aria-pressed', String(isPdf));
    document.getElementById('tab-btn-link').setAttribute('aria-pressed', String(!isPdf));
    const pdfSection = document.getElementById('citation-pdf-tab');
    const linkSection = document.getElementById('citation-link-tab');
    if (pdfSection) pdfSection.classList.toggle('hidden', !isPdf);
    if (linkSection) linkSection.classList.toggle('hidden', isPdf);

    const btnPdf = document.getElementById('tab-btn-pdf');
    const btnLink = document.getElementById('tab-btn-link');

    if (isPdf) {
        btnPdf.className = "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 bg-white text-indigo-600 shadow-sm";
        btnLink.className = "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900";
    } else {
        btnLink.className = "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 bg-white text-indigo-600 shadow-sm";
        btnPdf.className = "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900";
    }
    lucide.createIcons();
}

function initPdfDropzone() {
    const dropzone = document.getElementById('pdf-dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('border-indigo-600', 'bg-indigo-50/50');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('border-indigo-600', 'bg-indigo-50/50');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            processPdfFile(files[0]);
        }
    });
}

function handlePdfFileInput(e) {
    const file = e.target.files && e.target.files[0];
    if (file) {
        processPdfFile(file);
    }
}

function setCitationStatus(state, title, desc) {
    const card = document.getElementById('citation-status-card');
    const icon = document.getElementById('citation-status-icon');
    const titleEl = document.getElementById('citation-status-title');
    const descEl = document.getElementById('citation-status-desc');

    if (!card || !icon || !titleEl || !descEl) return;

    if (!state) {
        card.classList.add('hidden');
        return;
    }

    card.classList.remove('hidden', 'bg-indigo-50', 'text-indigo-900', 'border-indigo-200', 'bg-emerald-50', 'text-emerald-900', 'border-emerald-200', 'bg-amber-50', 'text-amber-900', 'border-amber-200', 'bg-rose-50', 'text-rose-900', 'border-rose-200');
    card.classList.add('border');

    if (state === 'loading') {
        card.classList.add('bg-indigo-50', 'text-indigo-900', 'border-indigo-200');
        icon.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 text-indigo-600 animate-spin"></i>';
    } else if (state === 'success') {
        card.classList.add('bg-emerald-50', 'text-emerald-900', 'border-emerald-200');
        icon.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600"></i>';
    } else if (state === 'warning') {
        card.classList.add('bg-amber-50', 'text-amber-900', 'border-amber-200');
        icon.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i>';
    } else {
        card.classList.add('bg-rose-50', 'text-rose-900', 'border-rose-200');
        icon.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4 text-rose-600"></i>';
    }

    titleEl.innerText = title;
    descEl.innerText = desc || '';
    lucide.createIcons();
}

async function processPdfFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        setCitationStatus('error', 'Unsupported File', 'Please upload a PDF document (.pdf).');
        return;
    }

    if (typeof pdfjsLib === 'undefined') {
        setCitationStatus('error', 'PDF Parser Unavailable', 'PDF.js library is not loaded. Please check your network connection.');
        return;
    }

    setCitationStatus('loading', 'Analyzing PDF...', `Reading ${file.name} and scanning for bibliographic data...`);

    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        const metadata = await pdf.getMetadata().catch(() => ({}));
        const info = (metadata && metadata.info) || {};

        let text = '';
        const pagesToScan = Math.min(pdf.numPages, 3);
        for (let i = 1; i <= pagesToScan; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += ' ' + content.items.map(item => item.str).join(' ');
        }

        // Search for DOI in PDF text
        const detectedDoi = extractDoiFromText(text);
        if (detectedDoi) {
            setCitationStatus('loading', 'DOI Found in PDF', `Found DOI: ${detectedDoi}. Querying Crossref registry for verified metadata...`);
            const resolved = await resolveDoiMetadata(detectedDoi);
            if (resolved) {
                setCitationStatus('success', 'Verified via Crossref Registry', `Auto-extracted complete metadata from DOI ${detectedDoi} found in "${file.name}".`);
                showToast('Citation generated from PDF!');
                return;
            }
        }

        // If no DOI or Crossref failed, fallback to heuristic extraction from PDF metadata & text
        extractMetadataFromPdfContent(info, text, file.name);
    } catch (err) {
        console.error('PDF parsing error:', err);
        setCitationStatus('error', 'Could Not Read PDF', 'The PDF could not be read or contains scanned raster images without text.');
    }
}

function extractMetadataFromPdfContent(info, text, filename) {
    let title = info.Title && info.Title.trim() && !/^untitled/i.test(info.Title) ? info.Title.trim() : '';
    let author = info.Author && info.Author.trim() ? info.Author.trim() : '';
    let year = '';

    if (info.CreationDate) {
        const dateMatch = info.CreationDate.match(/D:(\d{4})/);
        if (dateMatch) year = dateMatch[1];
    }

    const lines = text.split(/\s{2,}|\n/).map(l => l.trim()).filter(l => l.length > 5);
    if (!title && lines.length > 0) {
        const candidate = lines.find(l => !/^(volume|issue|page|issn|isbn|http|www|copyright)/i.test(l));
        if (candidate) title = candidate.slice(0, 150);
    }
    if (!title) {
        title = filename.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    }

    if (!year) {
        const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) year = yearMatch[1];
    }

    setCiteTypeFromSource('report');
    document.getElementById('cite-title').value = toSentenceCase(title);
    document.getElementById('cite-authors').value = author;
    document.getElementById('cite-year').value = year;
    document.getElementById('cite-source').value = info.Producer || info.Creator || '';
    document.getElementById('cite-doi-url').value = '';

    updateCitationPreview();
    setCitationStatus('warning', 'PDF Analyzed (No DOI)', 'Extracted metadata from PDF document properties. Please review and refine the title and author names.');
    showToast('Metadata extracted from PDF.');
}

async function handleResolveUrl() {
    const input = document.getElementById('citation-url-input').value.trim();
    if (!input) {
        setCitationStatus('error', 'Empty Input', 'Please enter a web link or DOI to generate a citation.');
        return;
    }

    setCitationStatus('loading', 'Resolving Reference...', 'Searching academic registries and web metadata...');
    const btn = document.getElementById('btn-resolve-url');
    if (btn) btn.disabled = true;

    try {
        await resolveWebOrDoi(input);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function resolveWebOrDoi(input) {
    // 1. Direct or embedded DOI
    const doi = extractDoiFromText(input);
    if (doi) {
        setCitationStatus('loading', 'Querying Registry...', `Found DOI: ${doi}. Contacting Crossref...`);
        const ok = await resolveDoiMetadata(doi);
        if (ok) {
            setCitationStatus('success', 'Verified via Academic DOI Registry', `Successfully fetched bibliographic data for ${doi}.`);
            showToast('Citation generated from DOI!');
            return;
        }
    }

    // 2. arXiv identifier or link
    const arxivMatch = input.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+)/i) || input.match(/\barxiv:\s*([0-9]+\.[0-9]+)/i);
    if (arxivMatch) {
        const arxivDoi = `10.48550/arXiv.${arxivMatch[1]}`;
        const ok = await resolveDoiMetadata(arxivDoi);
        if (ok) {
            setCitationStatus('success', 'Verified via arXiv Preprint Registry', `Successfully retrieved preprint metadata for arXiv:${arxivMatch[1]}.`);
            showToast('Citation generated from arXiv!');
            return;
        }
    }

    // 3a. YouTube video via oEmbed
    if (await resolveYouTubeUrl(input)) return;

    // 3. Wikipedia article
    const wikiMatch = input.match(/wikipedia\.org\/wiki\/([^#?&]+)/i);
    if (wikiMatch) {
        const articleSlug = decodeURIComponent(wikiMatch[1]);
        try {
            const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleSlug)}`);
            if (resp.ok) {
                const data = await resp.json();
                setCiteTypeFromSource('webpage');
                document.getElementById('cite-title').value = toSentenceCase(data.title || articleSlug.replace(/_/g, ' '));
                document.getElementById('cite-authors').value = '';
                document.getElementById('cite-year').value = new Date().getFullYear().toString();
                document.getElementById('cite-monthday').value = '';
                document.getElementById('cite-source').value = 'Wikipedia';
                document.getElementById('cite-doi-url').value = input;
                updateCitationPreview();
                setCitationStatus('success', 'Wikipedia Page Resolved', `Retrieved summary for "${data.title}". In APA 7, Wikipedia entries use the article title in place of author.`);
                showToast('Citation generated from Wikipedia!');
                return;
            }
        } catch (e) {
            console.warn('Wikipedia API fetch failed', e);
        }
    }

    // 4. General webpage via URL parsing & metadata fetch attempt
    await resolveGeneralWebUrl(input);
}

async function resolveDoiMetadata(doi) {
    const cleanDoi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();

    // 1. Crossref
    try {
        const resp = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
            headers: { 'Accept': 'application/json' }
        });
        if (resp.ok) {
            const json = await resp.json();
            const msg = json.message;
            if (msg) {
                populateFromCrossref(msg, cleanDoi);
                return true;
            }
        }
    } catch (e) {
        console.warn('Crossref request failed:', e);
    }

    // 2. Datacite fallback
    try {
        const resp = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(cleanDoi)}`);
        if (resp.ok) {
            const json = await resp.json();
            const attrs = json.data && json.data.attributes;
            if (attrs) {
                populateFromDatacite(attrs, cleanDoi);
                return true;
            }
        }
    } catch (e) {
        console.warn('Datacite request failed:', e);
    }

    return false;
}

function populateFromCrossref(msg, cleanDoi) {
    setCiteTypeFromSource(inferCrossrefSourceType(msg));

    const rawTitle = Array.isArray(msg.title) ? msg.title[0] : (msg.title || '');
    document.getElementById('cite-title').value = toSentenceCase(rawTitle);

    if (Array.isArray(msg.author) && msg.author.length > 0) {
        document.getElementById('cite-authors').value = formatAuthorsApa(msg.author);
    } else {
        document.getElementById('cite-authors').value = msg.publisher || '';
    }

    let year = '';
    const dateParts = (msg.issued && msg.issued['date-parts'] && msg.issued['date-parts'][0]) ||
                      (msg.created && msg.created['date-parts'] && msg.created['date-parts'][0]);
    if (dateParts && dateParts[0]) {
        year = dateParts[0].toString();
    }
    document.getElementById('cite-year').value = year;

    const containerRaw = Array.isArray(msg['container-title']) ? msg['container-title'][0] : (msg['container-title'] || '');
    const citeType = document.getElementById('cite-type').value;
    if (citeType === 'chapter') {
        document.getElementById('cite-container').value = toSentenceCase(containerRaw || '');
        document.getElementById('cite-editors').value = Array.isArray(msg.editor) && msg.editor.length ? formatAuthorsApa(msg.editor) : '';
        document.getElementById('cite-source').value = msg.publisher || '';
    } else if (citeType === 'thesis') {
        const inst = Array.isArray(msg.institution) && msg.institution[0] ? msg.institution[0].name : '';
        document.getElementById('cite-source').value = inst || msg.publisher || '';
    } else if (citeType === 'journal') {
        document.getElementById('cite-source').value = (containerRaw || msg.publisher) ? toTitleCase(containerRaw || msg.publisher) : '';
    } else {
        document.getElementById('cite-source').value = containerRaw || msg.publisher || '';
    }
    const editionNumber = parseInt(msg['edition-number'], 10);
    if (['book', 'chapter'].includes(citeType) && editionNumber > 1) document.getElementById('cite-edition').value = String(editionNumber);

    document.getElementById('cite-volume').value = msg.volume || '';
    document.getElementById('cite-issue').value = msg.issue || '';
    document.getElementById('cite-pages').value = msg.page ? msg.page.replace('-', '–') : '';

    document.getElementById('cite-doi-url').value = `https://doi.org/${cleanDoi}`;

    updateCitationPreview();
    applyFieldProvenance({});
}

function populateFromDatacite(attrs, cleanDoi) {
    const resourceType = ((attrs.types && (attrs.types.resourceTypeGeneral || attrs.types.resourceType)) || '').toLowerCase();
    const isArticle = resourceType.includes('article') || resourceType.includes('journal');
    const dataciteType = isArticle ? 'journal' : resourceType.includes('dataset') ? 'dataset'
        : resourceType.includes('software') ? 'software' : resourceType.includes('dissertation') ? 'thesis' : 'report';
    setCiteTypeFromSource(dataciteType);

    const title = attrs.titles && attrs.titles[0] ? attrs.titles[0].title : '';
    document.getElementById('cite-title').value = toSentenceCase(title);

    if (Array.isArray(attrs.creators) && attrs.creators.length > 0) {
        document.getElementById('cite-authors').value = formatAuthorsApa(attrs.creators);
    } else {
        document.getElementById('cite-authors').value = attrs.publisher || '';
    }

    document.getElementById('cite-year').value = attrs.publicationYear ? attrs.publicationYear.toString() : '';
    document.getElementById('cite-source').value = (attrs.publisher && attrs.publisher.name) || attrs.publisher || 'arXiv';
    if (['dataset', 'software'].includes(dataciteType) && attrs.version) document.getElementById('cite-edition').value = `Version ${attrs.version}`;
    document.getElementById('cite-volume').value = '';
    document.getElementById('cite-issue').value = '';
    document.getElementById('cite-pages').value = '';
    document.getElementById('cite-doi-url').value = `https://doi.org/${cleanDoi}`;

    updateCitationPreview();
    applyFieldProvenance({});
}

// Optional self-hosted metadata proxy (see worker/README.md). Set window.APA_METADATA_PROXY
// before this script runs, or edit this constant, to route page fetches through it first.
const METADATA_PROXY_URL = (typeof window !== 'undefined' && window.APA_METADATA_PROXY) || '';
const PROVENANCE_FIELDS = ['cite-title', 'cite-authors', 'cite-year', 'cite-source', 'cite-doi-url'];

function clearFieldProvenance() {
    PROVENANCE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('prov-found', 'prov-guess', 'prov-missing');
    });
    const legend = document.getElementById('citation-prov-legend');
    if (legend) legend.classList.add('hidden');
}

// states maps a field id to 'found' | 'guess'; empty required fields are shown as missing.
function applyFieldProvenance(states) {
    clearFieldProvenance();
    PROVENANCE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const hasValue = !!el.value.trim();
        if (!hasValue && !['cite-authors', 'cite-year', 'cite-title'].includes(id)) return;
        el.classList.add(`prov-${hasValue ? (states[id] || 'found') : 'missing'}`);
    });
    const legend = document.getElementById('citation-prov-legend');
    if (legend) legend.classList.remove('hidden');
}

// Looks a page title up in Crossref and returns a DOI only for a near-exact title match.
async function findDoiByTitle(title, authorHint) {
    if (!title || title.split(/\s+/).length < 4) return null;
    try {
        const query = `query.bibliographic=${encodeURIComponent(title)}${authorHint ? '&query.author=' + encodeURIComponent(authorHint) : ''}&rows=3&select=DOI,title`;
        const resp = await fetch(`https://api.crossref.org/works?${query}`);
        if (!resp.ok) return null;
        const items = ((await resp.json()).message || {}).items || [];
        const hit = items.find(it => titleSimilarity(title, (it.title || [])[0]) >= 0.85);
        return hit ? hit.DOI : null;
    } catch (e) {
        return null;
    }
}

async function fetchWaybackHtml(url, attempt) {
    try {
        const resp = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
        if (!resp.ok) return null;
        const snap = ((await resp.json()).archived_snapshots || {}).closest;
        if (!snap || !snap.available) return null;
        const rawUrl = snap.url.replace(/^http:/, 'https:').replace(/\/web\/(\d+)\//, '/web/$1id_/');
        const enc = encodeURIComponent(rawUrl);
        return await Promise.any([
            attempt(rawUrl, r => r.text()),
            attempt(`https://api.allorigins.win/get?url=${enc}`, async r => (await r.json()).contents),
            attempt(`https://corsproxy.io/?url=${enc}`, r => r.text())
        ]);
    } catch (e) {
        return null;
    }
}

async function resolveYouTubeUrl(input) {
    let url;
    try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch (e) { return false; }
    const host = url.hostname.replace(/^www\.|^m\./i, '').toLowerCase();
    if (host !== 'youtube.com' && host !== 'youtu.be') return false;
    const videoId = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    if (!videoId) return false;
    const canonical = `https://www.youtube.com/watch?v=${videoId}`;
    try {
        const resp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`);
        if (!resp.ok) return false;
        const data = await resp.json();
        setCiteTypeFromSource('video');
        document.getElementById('cite-title').value = toSentenceCase(data.title || '', [data.author_name]);
        document.getElementById('cite-authors').value = data.author_name || '';
        document.getElementById('cite-year').value = '';
        document.getElementById('cite-monthday').value = '';
        document.getElementById('cite-source').value = 'YouTube';
        document.getElementById('cite-doi-url').value = canonical;
        updateCitationPreview();
        applyFieldProvenance({});
        setCitationStatus('warning', 'YouTube Video Found', 'Title and channel were retrieved. YouTube does not expose the upload date to this tool, so add the year and date from the video page. APA lists the channel name as the author.');
        showToast('Video citation generated!');
        return true;
    } catch (e) {
        return false;
    }
}

async function fetchPageHtml(url) {
    lastFetchFailures = [];
    const attempt = async (endpoint, unwrap) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        try {
            const resp = await fetch(endpoint, { signal: controller.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const html = await unwrap(resp);
            if (!html || !/<(html|head|meta|title)/i.test(html)) throw new Error('No HTML');
            if (looksLikeBlockPage(html)) throw new Error('blocked-page');
            return html;
        } catch (err) {
            lastFetchFailures.push(err);
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    };
    const enc = encodeURIComponent(url);
    if (METADATA_PROXY_URL) {
        try {
            return await attempt(`${METADATA_PROXY_URL}${METADATA_PROXY_URL.includes('?') ? '&' : '?'}url=${enc}`, r => r.text());
        } catch (e) { /* fall through to public routes */ }
    }
    try {
        return await Promise.any([
            attempt(url, r => r.text()),
            attempt(`https://api.allorigins.win/get?url=${enc}`, async r => (await r.json()).contents),
            attempt(`https://corsproxy.io/?url=${enc}`, r => r.text()),
            attempt(`https://api.codetabs.com/v1/proxy?quest=${enc}`, r => r.text())
        ]);
    } catch (e) {
        return fetchWaybackHtml(url, attempt);
    }
}

async function resolveGeneralWebUrl(urlStr) {
    let parsedUrl;
    try {
        parsedUrl = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`);
    } catch (e) {
        setCitationStatus('error', 'Invalid Web Address', 'Please check that the URL is formatted correctly (e.g. https://example.com/article).');
        return;
    }

    const domainName = mapDomainToSiteName(parsedUrl.hostname);
    if (isLaudatoSiUrl(parsedUrl)) {
        populateLaudatoSiCitation(parsedUrl.href);
        setCitationStatus('success', 'Laudato si’ Document Recognized', 'Recognized as Pope Francis’ 2015 encyclical and applied the APA religious-document format.');
        showToast('Laudato si’ citation generated.');
        return;
    }

    const titleCandidate = deriveTitleFromUrlPath(parsedUrl.pathname);
    let dateParts = { year: '', monthDay: '' };
    const pathDate = parsedUrl.pathname.match(/\/((?:19|20)\d{2})[\/-](\d{1,2})[\/-](\d{1,2})(?=\/|$|-)/);
    if (pathDate) {
        dateParts = parseDateParts(`${pathDate[1]}-${pathDate[2]}-${pathDate[3]}`);
    } else {
        const yearOnly = parsedUrl.pathname.match(/\/((?:19|20)\d{2})(?=\/|$)/);
        if (yearOnly) dateParts.year = yearOnly[1];
    }

    const html = await fetchPageHtml(parsedUrl.href);
    const meta = html ? parseHtmlMetadata(html, parsedUrl.hostname) : null;

    if (meta && meta.doi && /^10\./.test(meta.doi)) {
        if (await resolveDoiMetadata(meta.doi)) {
            setCitationStatus('success', 'DOI Found in Webpage', `Identified DOI ${meta.doi} from webpage metadata.`);
            showToast('Citation generated via webpage DOI!');
            return;
        }
    }

    if (meta && meta.title && !isNewsHost(parsedUrl.hostname) && !meta.journal) {
        const titleDoi = await findDoiByTitle(meta.title, (meta.author || '').split(/;\s*/)[0]);
        if (titleDoi && await resolveDoiMetadata(titleDoi)) {
            setCitationStatus('success', 'Matched in Crossref', `The page title matched a published work (DOI ${titleDoi}). Check it is the right paper before using it.`);
            showToast('Citation matched via Crossref!');
            return;
        }
    }

    let citeUrl = cleanUrlForCitation(parsedUrl);
    if (meta && meta.canonical) {
        try {
            const canonical = new URL(meta.canonical, parsedUrl.href);
            if (canonical.hostname === parsedUrl.hostname) citeUrl = cleanUrlForCitation(canonical);
        } catch (e) { /* keep original */ }
    }

    const siteName = (meta && meta.siteName) || domainName;
    const institutional = isInstitutionalHost(parsedUrl.hostname);
    const isPdf = /\.pdf$/i.test(parsedUrl.pathname);
    const isJournalPage = !!(meta && meta.journal);
    const type = isJournalPage ? 'journal' : (isPdf ? 'report' : (isNewsHost(parsedUrl.hostname) ? 'article' : 'webpage'));

    setCiteTypeFromSource(type);

    const isHomePage = parsedUrl.pathname === '/' || parsedUrl.pathname === '';
    const rawTitle = (meta && meta.title) || titleCandidate || (isHomePage && siteName ? siteName : (domainName ? `${domainName} home page` : 'Webpage'));
    const orgName = knownOrganizationName(parsedUrl.hostname);
    const orgAuthor = !isJournalPage && institutional ? (orgName || siteName) : '';
    const authors = (meta && meta.author) || orgAuthor;
    const authorIsOrgGuess = !(meta && meta.author) && !!orgAuthor;
    const year = (meta && meta.year) || dateParts.year;
    const monthDay = (meta && meta.year) ? meta.monthDay : dateParts.monthDay;

    document.getElementById('cite-title').value = toSentenceCase(rawTitle, [siteName, ...(authors ? authors.split(/[;,]\s*/) : [])]);
    document.getElementById('cite-authors').value = authors;
    document.getElementById('cite-year').value = year;
    document.getElementById('cite-monthday').value = monthDay;
    const sourceDuplicatesAuthor = authorIsOrgGuess && authors.toLowerCase().startsWith(siteName.toLowerCase());
    document.getElementById('cite-source').value = isJournalPage ? toTitleCase(meta.journal) : (sourceDuplicatesAuthor ? '' : siteName);
    document.getElementById('cite-volume').value = isJournalPage ? meta.volume : '';
    document.getElementById('cite-issue').value = isJournalPage ? meta.issue : '';
    document.getElementById('cite-pages').value = isJournalPage ? meta.pages : '';
    document.getElementById('cite-doi-url').value = citeUrl;
    updateCitationPreview();
    applyFieldProvenance({
        'cite-title': meta && meta.title ? 'found' : 'guess',
        'cite-authors': meta && meta.author ? 'found' : 'guess',
        'cite-year': meta && meta.year ? 'found' : 'guess',
        'cite-source': meta && meta.siteName ? 'found' : 'guess',
        'cite-doi-url': 'found'
    });

    const missing = [];
    if (!authors) missing.push('author');
    if (!year) missing.push('date');
    if (meta) {
        const note = missing.length
            ? `Extracted details from "${siteName}". No ${missing.join(' or ')} found; the entry uses ${authors ? '(n.d.)' : 'the title in the author position'} per APA. Please verify.`
            : `Extracted details from "${siteName}". Review and verify details.`;
        setCitationStatus(missing.length ? 'warning' : 'success', 'Webpage Metadata Extracted', note);
        showToast('Web citation generated!');
    } else {
        setCitationStatus('warning', 'URL Analyzed', `${describeFetchFailure()} The title and site came from the link itself${orgAuthor ? ' and the author is the organization behind the site' : ''}. Please review the author, date and title fields.`);
        showToast('Citation template generated from link.');
    }
}

function populateLaudatoSiCitation(url) {
    setCiteTypeFromSource('religious');
    document.getElementById('cite-title').value = 'Laudato si\': On care for our common home';
    document.getElementById('cite-authors').value = 'Francis, P.';
    document.getElementById('cite-year').value = '2015';
    document.getElementById('cite-monthday').value = '';
    document.getElementById('cite-source').value = 'Vatican Press';
    document.getElementById('cite-volume').value = '';
    document.getElementById('cite-issue').value = '';
    document.getElementById('cite-pages').value = '';
    document.getElementById('cite-doi-url').value = url;
    updateCitationPreview();
}

const EXTRA_CITE_FIELDS = ['cite-container', 'cite-editors', 'cite-edition', 'cite-translator', 'cite-descriptor'];

function resetExtraCitationFields() {
    EXTRA_CITE_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const on = document.getElementById('cite-retrieved-on');
    if (on) on.checked = false;
}

function setCiteTypeFromSource(type) {
    resetExtraCitationFields();
    document.getElementById('cite-type').value = type;
    handleCiteTypeChange();
}

const CITE_TYPE_CONFIG = {
    journal:   { source: 'Journal Name (Title Case)', fields: ['volume', 'issue', 'pages'] },
    book:      { source: 'Publisher Name', fields: ['edition', 'translator'], edition: 'Edition (e.g. 2nd)' },
    chapter:   { source: 'Publisher Name', fields: ['container', 'editors', 'edition', 'pages'], container: 'Book Title', edition: 'Edition (optional, e.g. 2nd)' },
    webpage:   { source: 'Website / Organization Name', fields: ['monthday', 'retrieved'] },
    article:   { source: 'Publication / Blog Name (italicized)', fields: ['monthday'] },
    video:     { source: 'Platform (e.g. YouTube)', fields: ['monthday', 'descriptor'] },
    report:    { source: 'Publisher / Sponsoring Organization', fields: ['edition', 'descriptor'], edition: 'Report number (e.g. No. 12)' },
    religious: { source: 'Publisher / Religious Institution', fields: ['descriptor'] },
    thesis:    { source: 'University', fields: ['descriptor'] },
    dataset:   { source: 'Publisher / Repository', fields: ['edition', 'descriptor'], edition: 'Version (e.g. Version 2.1)' },
    software:  { source: 'Publisher / Developer', fields: ['edition', 'descriptor'], edition: 'Version (e.g. Version 2.1)' },
    podcast:   { source: 'Publisher / Network', fields: ['container', 'edition', 'monthday', 'descriptor'], container: 'Podcast Name', edition: 'Episode (e.g. No. 12)' },
    social:    { source: 'Platform (e.g. X, Instagram)', fields: ['monthday', 'descriptor'] }
};

function handleCiteTypeChange() {
    const type = document.getElementById('cite-type').value;
    const cfg = CITE_TYPE_CONFIG[type] || CITE_TYPE_CONFIG.report;
    const show = (id, on, display) => { const el = document.getElementById(id); if (el) el.style.display = on ? (display || 'block') : 'none'; };

    ['volume', 'issue', 'pages'].forEach(f => show(`cite-wrap-${f}`, cfg.fields.includes(f)));
    show('cite-journal-meta-wrapper', ['volume', 'issue', 'pages'].some(f => cfg.fields.includes(f)), 'grid');
    show('cite-monthday-wrapper', cfg.fields.includes('monthday'));
    ['container', 'editors', 'edition', 'translator', 'descriptor'].forEach(f => show(`cite-wrap-${f}`, cfg.fields.includes(f)));
    show('cite-wrap-retrieved', cfg.fields.includes('retrieved'), 'flex');
    const anyExtra = ['container', 'editors'].some(f => cfg.fields.includes(f));
    show('cite-extra-fields', anyExtra || ['edition', 'translator', 'descriptor', 'retrieved'].some(f => cfg.fields.includes(f)), 'grid');
    // Rarely needed options stay folded away unless they already hold a value.
    const optional = ['edition', 'translator', 'descriptor', 'retrieved'];
    show('cite-more-options', optional.some(f => cfg.fields.includes(f)), 'block');
    const more = document.getElementById('cite-more-options');
    if (more) {
        const filled = ['cite-edition', 'cite-translator', 'cite-descriptor'].some(id => (document.getElementById(id) || {}).value)
            || (document.getElementById('cite-retrieved-on') || {}).checked;
        more.open = !!filled;
    }

    const sourceLabel = document.getElementById('cite-source-label');
    if (sourceLabel) sourceLabel.innerText = cfg.source;
    const containerLabel = document.getElementById('cite-container-label');
    if (containerLabel) containerLabel.innerText = cfg.container || 'Container Title';
    const editionLabel = document.getElementById('cite-edition-label');
    if (editionLabel) editionLabel.innerText = cfg.edition || 'Edition';
    const descriptorEl = document.getElementById('cite-descriptor');
    if (descriptorEl) descriptorEl.placeholder = DEFAULT_DESCRIPTORS[type] || 'e.g. Report';
    const retrievedDate = document.getElementById('cite-retrieved-date');
    if (retrievedDate && !retrievedDate.value) retrievedDate.value = formatLongDate(new Date());

    updateCitationPreview();
}

function autoApplySentenceCaseToTitle() {
    const titleEl = document.getElementById('cite-title');
    if (titleEl && titleEl.value.trim()) {
        titleEl.value = toSentenceCase(titleEl.value);
        updateCitationPreview();
        showToast('Applied APA sentence case to title.');
    }
}

function updateCitationPreview() {
    const type = document.getElementById('cite-type').value;
    const title = document.getElementById('cite-title').value.trim();
    const authorsRaw = document.getElementById('cite-authors').value.trim();
    const year = document.getElementById('cite-year').value.trim();
    const monthDay = document.getElementById('cite-monthday') ? document.getElementById('cite-monthday').value.trim() : '';
    const source = document.getElementById('cite-source').value.trim();
    const volume = document.getElementById('cite-volume') ? document.getElementById('cite-volume').value.trim() : '';
    const issue = document.getElementById('cite-issue') ? document.getElementById('cite-issue').value.trim() : '';
    const pages = document.getElementById('cite-pages') ? document.getElementById('cite-pages').value.trim() : '';
    const doiUrl = document.getElementById('cite-doi-url').value.trim();

    const val = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
    const doiMatch = doiUrl.match(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+)$/i);

    const item = {
        type,
        title,
        authors: parseAuthorsInput(authorsRaw),
        year,
        monthDay,
        source,
        volume,
        issue,
        pages,
        container: val('cite-container'),
        editors: val('cite-editors'),
        edition: val('cite-edition'),
        translator: val('cite-translator'),
        descriptor: val('cite-descriptor'),
        retrieved: document.getElementById('cite-retrieved-on') && document.getElementById('cite-retrieved-on').checked && CITE_TYPE_CONFIG[type].fields.includes('retrieved') ? val('cite-retrieved-date') : '',
        doi: doiMatch ? `https://doi.org/${doiMatch[1]}` : '',
        url: doiMatch ? '' : (/^(?:www\.)\S+$/i.test(doiUrl) ? `https://${doiUrl}` : doiUrl)
    };

    const isEmptyForm = !title && !authorsRaw && !year && !source && !doiUrl;
    const formatted = isEmptyForm ? { html: '', plain: '', marked: '' } : generateApaReference(item);
    currentCitationPlain = formatted.plain;
    currentCitationMarked = formatted.marked;

    const refEl = document.getElementById('prev-citation-reference');
    if (refEl) {
        refEl.innerHTML = formatted.html || '<span style="color:#94a3b8">Paste a link or DOI on the left, or upload a PDF, and your reference will appear here.</span>';
    }

    const inText = isEmptyForm ? { parenthetical: '—', narrative: '—' } : formatInTextCitation(item.authors, year);
    const parentheticalEl = document.getElementById('prev-citation-parenthetical');
    const narrativeEl = document.getElementById('prev-citation-narrative');
    if (parentheticalEl) parentheticalEl.innerText = inText.parenthetical;
    if (narrativeEl) narrativeEl.innerText = inText.narrative;
}

function copyInTextCitation(type) {
    const el = type === 'parenthetical'
        ? document.getElementById('prev-citation-parenthetical')
        : document.getElementById('prev-citation-narrative');
    if (!el) return;

    const text = el.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${type} citation: ${text}`);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(`Copied ${type} citation: ${text}`);
    });
}

function addCitationToBibliography() {
    if (!currentCitationPlain) {
        showToast('Generate or edit a citation first.');
        return;
    }

    const bibInput = document.getElementById('bibliography-input');
    const currentText = bibInput.value.trim();
    const entry = currentCitationMarked || currentCitationPlain;
    bibInput.value = currentText ? `${currentText}\n\n${entry}` : entry;
    bibInputIsSample = false;
    saveBibliographyDraft();

    showToast('Citation added to Bibliography Formatter!');
}

function resetCitationForm() {
    document.getElementById('cite-title').value = '';
    document.getElementById('cite-authors').value = '';
    document.getElementById('cite-year').value = '';
    if (document.getElementById('cite-monthday')) document.getElementById('cite-monthday').value = '';
    document.getElementById('cite-source').value = '';
    if (document.getElementById('cite-volume')) document.getElementById('cite-volume').value = '';
    if (document.getElementById('cite-issue')) document.getElementById('cite-issue').value = '';
    if (document.getElementById('cite-pages')) document.getElementById('cite-pages').value = '';
    document.getElementById('cite-doi-url').value = '';
    document.getElementById('citation-url-input').value = '';
    resetExtraCitationFields();
    clearFieldProvenance();
    setCitationStatus(null);
    updateCitationPreview();
    showToast('Citation form cleared.');
}

function loadSampleCitation(key, showToastFlag = true) {
    const s = sampleCitations[key];
    if (!s) return;
    clearFieldProvenance();

    setCiteTypeFromSource(s.type);
    document.getElementById('cite-title').value = s.title;
    document.getElementById('cite-authors').value = s.authors;
    document.getElementById('cite-year').value = s.year;
    if (s.monthDay && document.getElementById('cite-monthday')) {
        document.getElementById('cite-monthday').value = s.monthDay;
    }
    document.getElementById('cite-source').value = s.source;
    if (document.getElementById('cite-volume')) document.getElementById('cite-volume').value = s.volume || '';
    if (document.getElementById('cite-issue')) document.getElementById('cite-issue').value = s.issue || '';
    if (document.getElementById('cite-pages')) document.getElementById('cite-pages').value = s.pages || '';
    document.getElementById('cite-doi-url').value = s.doiUrl;

    if (key === 'nature') document.getElementById('citation-url-input').value = '10.1038/s41586-020-2649-2';
    if (key === 'arxiv') document.getElementById('citation-url-input').value = 'https://arxiv.org/abs/2301.07041';
    if (key === 'who') document.getElementById('citation-url-input').value = 'https://www.who.int/news-room/fact-sheets/detail/mental-health-strengthening-our-response';

    setCitationStatus('success', s.status.title, s.status.desc);
    updateCitationPreview();
    if (showToastFlag) {
        showToast(`Loaded ${s.source} sample citation.`);
    }
}
