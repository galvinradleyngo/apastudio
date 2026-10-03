// Run: node tests/features.test.js   (needs playwright)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok  -', name); } catch (e) { failures++; console.log('FAIL-', name, '\n     ', e.message); } };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/cdn|unpkg|tailwind/, r => r.abort());
  await page.addInitScript(() => { window.lucide = { createIcons() {} }; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => typeof inferItalicMarkers === 'function');
  const call = (fn, ...args) => page.evaluate(([f, a]) => window[f](...a), [fn, args]);

  // ── Italics inference on pasted references ───────────────────────────────
  const italics = [
    ['journal article', 'Smith, J. A., & Davis, M. (2020). Effects of sleep on memory. Journal of Sleep Research, 29(3), 45–67. https://doi.org/10.1000/xyz',
      'Smith, J. A., & Davis, M. (2020). Effects of sleep on memory. *Journal of Sleep Research*, *29*(3), 45–67. https://doi.org/10.1000/xyz'],
    ['journal, volume only', 'Smith, J. (2020). A study of things. Educational Psychology Review, 32, 1–20.',
      'Smith, J. (2020). A study of things. *Educational Psychology Review*, *32*, 1–20.'],
    ['book', 'Brown, B. (2012). Daring greatly: How the courage to be vulnerable transforms the way we live. Gotham Books.',
      'Brown, B. (2012). *Daring greatly: How the courage to be vulnerable transforms the way we live*. Gotham Books.'],
    ['book with edition kept plain', 'Lee, K. (2018). Research methods (2nd ed.). Sage.', 'Lee, K. (2018). *Research methods* (2nd ed.). Sage.'],
    ['report / webpage', 'World Health Organization. (2022). Mental health: Strengthening our response. https://www.who.int/x',
      'World Health Organization. (2022). *Mental health: Strengthening our response*. https://www.who.int/x'],
    ['bracketed descriptor stays plain', "Francis, P. (2015). Laudato si': On care for our common home [Encyclical]. Vatican Press.",
      "Francis, P. (2015). *Laudato si': On care for our common home* [Encyclical]. Vatican Press."],
    ['edited-book chapter', 'Jones, K. (2019). Memory and aging. In R. Lee & P. Kim (Eds.), Handbook of cognitive aging (2nd ed., pp. 10–30). Academic Press.',
      'Jones, K. (2019). Memory and aging. In R. Lee & P. Kim (Eds.), *Handbook of cognitive aging* (2nd ed., pp. 10–30). Academic Press.'],
    ['thesis', 'Cruz, M. (2021). Learning in crisis [Doctoral dissertation, Ateneo de Manila University]. https://x.org/1',
      'Cruz, M. (2021). *Learning in crisis* [Doctoral dissertation, Ateneo de Manila University]. https://x.org/1'],
    ['question mark title', 'Lee, S. (2021). Is social media harmful? Penguin.', 'Lee, S. (2021). *Is social media harmful?* Penguin.'],
    ['no date: left alone', 'Plain text with no date', 'Plain text with no date'],
    ['existing markers respected', 'Smith, J. (2020). A study of things. *Already* marked, 3(2), 4.', 'Smith, J. (2020). A study of things. *Already* marked, 3(2), 4.']
  ];
  for (const [name, input, expected] of italics) {
    await check(`italics: ${name}`, async () => assert.strictEqual(await call('inferItalicMarkers', input), expected));
  }

  // ── Generator: new source types and options ──────────────────────────────
  const ref = item => page.evaluate(i => generateApaReference(i).marked, item);
  const base = { year: '2024', monthDay: '', url: '', doi: '' };
  await check('generator: book with edition and translator', async () => assert.strictEqual(
    await ref({ ...base, type: 'book', title: 'The republic', authors: [{ family: 'Plato', given: '' }], edition: '2', translator: 'B. Jowett', source: 'Dover' }),
    'Plato. (2024). *The republic* (2nd ed.; B. Jowett, Trans.). Dover.'));
  await check('generator: book chapter with editors and pages', async () => assert.strictEqual(
    await ref({ ...base, type: 'chapter', title: 'Memory and aging', authors: ['Jones, K.'], container: 'Handbook of cognitive aging', editors: 'Lee, R., & Kim, P.', pages: '10-30', source: 'Academic Press' }),
    'Jones, K. (2024). Memory and aging. In R. Lee & P. Kim (Eds.), *Handbook of cognitive aging* (pp. 10–30). Academic Press.'));
  await check('generator: thesis', async () => assert.strictEqual(
    await ref({ ...base, type: 'thesis', title: 'Learning in crisis', authors: ['Cruz, M.'], source: 'Ateneo de Manila University', url: 'https://x.org/1' }),
    'Cruz, M. (2024). *Learning in crisis* [Doctoral dissertation, Ateneo de Manila University]. https://x.org/1'));
  await check('generator: dataset and software versions', async () => {
    assert.strictEqual(await ref({ ...base, type: 'dataset', title: 'Survey responses', authors: ['Cruz, M.'], edition: 'Version 2.1', source: 'Zenodo', doi: '10.5281/zenodo.1' }),
      'Cruz, M. (2024). *Survey responses* (Version 2.1) [Data set]. Zenodo. https://doi.org/10.5281/zenodo.1');
    assert.strictEqual(await ref({ ...base, type: 'software', title: 'Analysis toolkit', authors: [{ name: 'Acme Labs' }], edition: 'Version 3', source: 'GitHub', url: 'https://github.com/a/b' }),
      'Acme Labs. (2024). *Analysis toolkit* (Version 3) [Computer software]. GitHub. https://github.com/a/b');
  });
  await check('generator: podcast episode', async () => assert.strictEqual(
    await ref({ ...base, monthDay: 'May 3', type: 'podcast', title: 'Sleep science', authors: ['Lee, S.'], edition: 'No. 12', container: 'Mind Matters', source: 'Radio One' }),
    'Lee, S. (2024, May 3). *Sleep science* (No. 12) [Audio podcast episode]. In *Mind Matters*. Radio One.'));
  await check('generator: social post keeps handle', async () => assert.strictEqual(
    await ref({ ...base, monthDay: 'June 1', type: 'social', title: 'Big news today', authors: [{ name: 'Jane Doe [@janedoe]' }], source: 'X', url: 'https://x.com/p/1' }),
    'Jane Doe [@janedoe]. (2024, June 1). *Big news today* [Social media post]. X. https://x.com/p/1'));
  await check('generator: retrieval date only for URLs', async () => {
    assert.strictEqual(await ref({ ...base, type: 'webpage', title: 'Live dashboard', authors: [{ name: 'Agency' }], source: 'Agency Site', retrieved: 'October 3, 2026', url: 'https://a.gov/d' }),
      'Agency. (2024). *Live dashboard*. Agency Site. Retrieved October 3, 2026, from https://a.gov/d');
    assert.ok(!(await ref({ ...base, type: 'webpage', title: 'T', authors: ['Doe, J.'], retrieved: 'October 3, 2026', doi: '10.1/x' })).includes('Retrieved'));
  });

  // ── Bibliography improvements ────────────────────────────────────────────
  await check('page ranges: en dash outside URLs only', async () => {
    assert.strictEqual(await call('normalizePageRanges', 'Doe, J. (2020). T. Journal, 3(2), 45-67. https://x.org/a-1-22'), 'Doe, J. (2020). T. Journal, 3(2), 45–67. https://x.org/a-1-22');
    assert.strictEqual(await call('normalizePageRanges', 'In B (pp. 10-30). Press.'), 'In B (pp. 10–30). Press.');
  });
  await check('year suffixes: a/b by title, idempotent, singles untouched', async () => {
    const input = ['Doe, J. (2020). Zebras at night. Press.', 'Doe, J. (2020). Apples in spring. Press.', 'Roe, R. (2020). Alone. Press.'];
    const out = await page.evaluate(e => assignYearSuffixes(e).entries, input);
    assert.deepStrictEqual(out, ['Doe, J. (2020a). Apples in spring. Press.', 'Doe, J. (2020b). Zebras at night. Press.', 'Roe, R. (2020). Alone. Press.']);
    const again = await page.evaluate(e => assignYearSuffixes(e).entries, out);
    assert.deepStrictEqual(again.sort(), out.slice().sort());
  });
  await check('formatBibliography orders suffixed entries a before b', async () => {
    const text = await page.evaluate(() => {
      document.getElementById('bibliography-input').value = 'Doe, J. (2020). Zebras at night. Press.\n\nDoe, J. (2020). Apples in spring. Press.';
      formatBibliography();
      return document.getElementById('bibliography-input').value;
    });
    assert.ok(text.indexOf('2020a') < text.indexOf('2020b'), text);
  });
  await check('sentence-case fix button rewrites the title', async () => {
    const fixed = await call('sentenceCaseEntry', 'Doe, J. (2020). The Effects Of Sleep On Memory In Adults. Journal, 3(2), 4.');
    assert.strictEqual(fixed, 'Doe, J. (2020). The effects of sleep on memory in adults. Journal, 3(2), 4.');
  });

  // ── In-text citation cross-check ─────────────────────────────────────────
  await check('cross-check finds missing and uncited references', async () => {
    const html = await page.evaluate(() => {
      document.getElementById('bibliography-input').value = 'Smith, J., & Lee, R. (2020). A. Press.\n\nJones, K. (2019). B. Press.\n\nWorld Health Organization. (2022). C. https://who.int';
      document.getElementById('manuscript-input').value = 'Sleep matters (Smith & Lee, 2020; Brown, 2018). Jones et al. (2017) disagreed, and the World Health Organization (2022) agreed.';
      checkCitationsAgainstReferences();
      return document.getElementById('citation-check-results').innerText;
    });
    assert.ok(/Brown, 2018/.test(html) && /Jones, 2017/.test(html), html);
    assert.ok(!/Smith, 2020/.test(html) && !/Organization, 2022/.test(html), html);
    assert.ok(/never cited \(1\)/.test(html) && /Jones, K\. \(2019\)/.test(html), html);
  });

  // ── BibTeX / RIS import ──────────────────────────────────────────────────
  await check('BibTeX import: article, chapter, corporate author', async () => {
    const out = await page.evaluate(() => {
      const bib = `@article{doe2020, author = {Doe, Jane and Smith, John}, title = {Sleep and {Manila} Memory}, journal = {Journal of Sleep Research}, year = {2020}, volume = {12}, number = {3}, pages = {45--67}, doi = {10.1000/xyz} }
@incollection{lee2019, author = "Lee, Ann", title = {Memory and aging}, booktitle = {Handbook of aging}, editor = {Kim, Pat}, publisher = {Academic Press}, year = 2019, pages = {10--30} }
@misc{who, author = {{World Health Organization}}, title = {Mental health}, year = {2022}, url = {https://who.int/mh} }`;
      return parseBibtexEntries(bib).map(it => generateApaReference({ monthDay: '', retrieved: '', translator: '', ...it }).marked);
    });
    assert.deepStrictEqual(out, [
      'Doe, J., & Smith, J. (2020). Sleep and Manila memory. *Journal of Sleep Research*, *12*(3), 45–67. https://doi.org/10.1000/xyz',
      'Lee, A. (2019). Memory and aging. In P. Kim (Ed.), *Handbook of aging* (pp. 10–30). Academic Press.',
      'World Health Organization. (2022). *Mental health*. https://who.int/mh']);
  });
  await check('RIS import: journal article', async () => {
    const out = await page.evaluate(() => {
      const ris = 'TY  - JOUR\nAU  - Doe, Jane\nAU  - Smith, John\nPY  - 2021///\nTI  - Sleep and memory\nJO  - Journal of Sleep Research\nVL  - 12\nIS  - 3\nSP  - 45\nEP  - 67\nDO  - 10.1000/xyz\nER  - \n';
      return parseRisEntries(ris).map(it => generateApaReference({ monthDay: '', retrieved: '', translator: '', ...it }).marked);
    });
    assert.deepStrictEqual(out, ['Doe, J., & Smith, J. (2021). Sleep and memory. *Journal of Sleep Research*, *12*(3), 45–67. https://doi.org/10.1000/xyz']);
  });
  await check('import appends to the bibliography textbox', async () => {
    const n = await page.evaluate(() => { document.getElementById('bibliography-input').value = ''; return importReferencesText('@book{a, author={Doe, J.}, title={A book}, publisher={Press}, year={2001}}'); });
    assert.strictEqual(n, 1);
    assert.ok((await page.evaluate(() => document.getElementById('bibliography-input').value)).includes('A book'));
  });

  // ── .docx export ─────────────────────────────────────────────────────────
  await check('docx export: valid package with italic runs and hanging indent', async () => {
    await page.evaluate(() => {
      setMode('bibliography');
      document.getElementById('bibliography-input').value = 'Doe, J. (2020). Sleep & memory. Journal of Sleep Research, 12(3), 45-67. https://doi.org/10.1/x';
      formatBibliography();
    });
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportToWord())]);
    const file = path.join(os.tmpdir(), 'apa-test.docx');
    await download.saveAs(file);
    assert.strictEqual(download.suggestedFilename(), 'APA_References.docx');
    const buf = fs.readFileSync(file);
    assert.strictEqual(buf.readUInt32LE(0), 0x04034b50);
    const names = [];
    for (let i = 0; i < buf.length - 4; ) {
      if (buf.readUInt32LE(i) === 0x04034b50) {
        const size = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), elen = buf.readUInt16LE(i + 28);
        names.push(buf.slice(i + 30, i + 30 + nlen).toString());
        if (names[names.length - 1] === 'word/document.xml') {
          const xml = buf.slice(i + 30 + nlen + elen, i + 30 + nlen + elen + size).toString();
          assert.ok(/<w:spacing[^>]*\/><w:jc/.test(xml) && !/<w:jc[^>]*\/><w:spacing/.test(xml), 'pPr child order');
          fs.writeFileSync(path.join(os.tmpdir(), 'apa-test-document.xml'), xml);
          assert.ok(xml.includes('<w:i/>') && xml.includes('Journal of Sleep Research') && xml.includes('w:hanging="720"') && xml.includes('Sleep &amp; memory'), xml);
        }
        i += 30 + nlen + elen + size;
      } else break;
    }
    assert.deepStrictEqual(names, ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
  });

  // ── Accessibility basics ─────────────────────────────────────────────────
  await check('a11y: labels linked to controls, live regions present', async () => {
    const r = await page.evaluate(() => ({
      unlinked: [...document.querySelectorAll('label')].filter(l => !l.htmlFor && !l.querySelector('input,textarea,select') && l.id !== 'cite-source-label' && l.offsetParent !== null).length,
      toast: document.getElementById('toast').getAttribute('aria-live'),
      status: document.getElementById('citation-status-card').getAttribute('aria-live'),
      titleFor: document.querySelector('label[for="cite-title"]') !== null || document.getElementById('cite-title').labels.length > 0
    }));
    assert.strictEqual(r.toast, 'polite'); assert.strictEqual(r.status, 'polite'); assert.ok(r.titleFor);
    assert.strictEqual(r.unlinked, 0, `unlinked labels: ${r.unlinked}`);
  });
  await check('no page errors', async () => assert.deepStrictEqual(errors, []));

  await browser.close();
  if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nall passed');
})().catch(e => { console.error(e); process.exit(1); });
