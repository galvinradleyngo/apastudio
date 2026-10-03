// Run: node tests/engine.test.js   (pure Node, no browser)
// Loads the DOM-free reference engine and parser and checks parse-and-rebuild behaviour.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, URL });
for (const f of ['reference-engine.js', 'reference-parser.js', 'web-metadata.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const run = (expr, vars = {}) => { Object.assign(ctx, { __v: vars }); return vm.runInContext(expr, ctx); };
const gen = item => run('generateApaReference(__v.item).marked', { item });
const rebuild = text => run('rebuildReference(__v.text)', { text });

let failures = 0;
const check = (name, fn) => { try { fn(); console.log('ok  -', name); } catch (e) { failures++; console.log('FAIL-', name, '\n     ', e.message); } };
const strip = t => t.replace(/\*/g, '');

// One item per source type. Each must survive generate -> (plain text) -> parse -> generate unchanged.
const base = { year: '2024', monthDay: '', url: '', doi: '', retrieved: '' };
const corpus = {
  journal: { ...base, type: 'journal', title: 'Sleep and memory', authors: [{ family: 'Doe', given: 'J. A.' }, { family: 'Roe', given: 'R.' }], source: 'Journal of Sleep Research', volume: '12', issue: '3', pages: '45-67', doi: '10.1/x' },
  'journal brand case': { ...base, type: 'journal', title: 'Gene editing today', authors: [{ family: 'Doe', given: 'J.' }], source: 'eLife', volume: '9', pages: 'e123', doi: '10.1/y' },
  book: { ...base, type: 'book', title: 'The republic', authors: [{ name: 'Plato' }], edition: '2', translator: 'B. Jowett', source: 'Dover' },
  'book with question title': { ...base, type: 'book', title: 'Is it working?', authors: [{ family: 'Lee', given: 'S.' }], source: 'Penguin' },
  chapter: { ...base, type: 'chapter', title: 'Memory and aging', authors: [{ family: 'Jones', given: 'K.' }], container: 'Handbook of cognitive aging', editors: 'Lee, R., & Kim, P.', pages: '10-30', edition: '2nd', source: 'Academic Press' },
  report: { ...base, type: 'report', title: 'Mental health: Strengthening our response', authors: [{ name: 'World Health Organization' }], url: 'https://www.who.int/x', source: '' },
  webpage: { ...base, monthDay: 'March 5', type: 'webpage', title: 'Our story', authors: [{ name: 'Apple Inc.' }], source: 'Apple Newsroom', url: 'https://apple.com/a' },
  'webpage with retrieval date': { ...base, type: 'webpage', title: 'Live dashboard', authors: [{ name: 'Agency Office' }], source: 'Agency Site', url: 'https://a.gov/d', retrieved: 'October 3, 2026' },
  thesis: { ...base, type: 'thesis', title: 'Learning in crisis', authors: [{ family: 'Cruz', given: 'M.' }], source: 'Ateneo de Manila University', url: 'https://x.org/1' },
  dataset: { ...base, type: 'dataset', title: 'Survey responses', authors: [{ family: 'Cruz', given: 'M.' }], edition: 'Version 2.1', source: 'Zenodo', doi: '10.5281/zenodo.1' },
  software: { ...base, type: 'software', title: 'Analysis toolkit', authors: [{ name: 'Acme Labs Inc.' }], edition: 'Version 3', source: 'GitHub', url: 'https://github.com/a/b' },
  video: { ...base, monthDay: 'May 3', type: 'video', title: 'Sleep tips', authors: [{ name: 'Sleep Channel Group' }], source: 'YouTube', url: 'https://youtube.com/watch?v=1' },
  podcast: { ...base, monthDay: 'May 3', type: 'podcast', title: 'Sleep science', authors: [{ family: 'Lee', given: 'S.' }], edition: 'No. 12', container: 'Mind Matters', source: 'Radio One', url: 'https://r.org/12' },
  social: { ...base, monthDay: 'June 1', type: 'social', title: 'Big news today', authors: [{ name: 'Jane Doe [@janedoe]' }], source: 'X', url: 'https://x.com/p/1' },
  religious: { ...base, year: '2015', type: 'religious', title: "Laudato si': On care for our common home", authors: [{ family: 'Francis', given: 'P.' }], source: 'Vatican Press', url: 'https://vatican.va/x' },
  'year suffix': { ...base, year: '2020a', type: 'book', title: 'Apples in spring', authors: [{ family: 'Doe', given: 'J.' }], source: 'Press' },
  'no date': { ...base, year: '', type: 'book', title: 'Old manuscript', authors: [{ family: 'Doe', given: 'J.' }], source: 'Press' }
};
for (const [name, item] of Object.entries(corpus)) {
  const marked = gen(item);
  check(`round trip (italic markers kept): ${name}`, () => {
    const r = rebuild(marked);
    assert.ok(r.rebuilt, `${r.reason}: ${marked}`);
    assert.strictEqual(r.text, marked);
  });
  check(`round trip (pasted as plain text): ${name}`, () => {
    const r = rebuild(strip(marked));
    assert.ok(r.rebuilt, `${r.reason}: ${strip(marked)}`);
    assert.strictEqual(r.text, marked);
  });
}
// News/blog articles need the user's italic markers: plain text cannot reveal which part is the publication.
check('round trip with markers: news article and no-author work', () => {
  const article = gen({ ...base, monthDay: 'March 5', type: 'article', title: 'Why sleep matters', authors: [{ family: 'Doe', given: 'J.' }], source: 'The Guardian', url: 'https://g.com/a' });
  assert.strictEqual(rebuild(article).text, article);
  const noAuthor = gen({ ...base, type: 'report', title: 'Untitled guidance', authors: [], source: 'Some Agency', url: 'https://a.gov/g' });
  assert.strictEqual(rebuild(noAuthor).text, noAuthor);
});
check('rebuilding is idempotent', () => {
  for (const item of Object.values(corpus)) {
    const once = rebuild(gen(item)).text;
    assert.strictEqual(rebuild(once).text, once);
  }
});

// Messy pasted references are standardized...
const messy = [
  ['title-case article title, missing italics', 'Smith, J.A. & Lee, R.T. (2021). Learning Analytics In Blended Classrooms. journal of educational computing, 35(2), 145-162. https://doi.org/10.1000/xyz123',
    'Smith, J. A., & Lee, R. T. (2021). Learning Analytics In Blended Classrooms. *Journal of Educational Computing*, *35*(2), 145–162. https://doi.org/10.1000/xyz123'],
  ['capitalization of the title is kept as typed', 'Brown, B. (2012). Daring Greatly: How The Courage To Be Vulnerable. Gotham Books.',
    'Brown, B. (2012). *Daring Greatly: How The Courage To Be Vulnerable*. Gotham Books.'],
  ['sentence-case titles with proper nouns are not damaged', 'American Psychological Association. (2020). Publication manual of the American Psychological Association (7th ed.). https://doi.org/10.1037/0000165-000',
    'American Psychological Association. (2020). *Publication manual of the American Psychological Association* (7th ed.). https://doi.org/10.1037/0000165-000'],
  ['dated with month and day is recognized (no bogus n.d.)', 'Centers for Disease Control and Prevention. (2021, March 5). COVID-19 vaccine safety. https://www.cdc.gov/vaccines',
    'Centers for Disease Control and Prevention. (2021, March 5). *COVID-19 vaccine safety*. https://www.cdc.gov/vaccines']
];
for (const [name, input, expected] of messy) {
  check(`standardizes: ${name}`, () => {
    const fixed = run('applyBibliographyAutoFix(__v.t, { rebuild: true }).fixed', { t: input });
    assert.strictEqual(fixed, expected);
  });
}
// ...and uncertain ones are left alone, with a reason.
for (const [name, input] of [
  ['unknown author/title ambiguity', 'The effects of sleep. (2020). Some Press.'],
  ['no year', 'Doe, J. Untitled notes. Press.'],
  ['wording would change', 'Apple. (2024). *Apple*. Apple. https://apple.com']
]) {
  check(`left as typed: ${name}`, () => {
    const r = rebuild(input);
    assert.strictEqual(r.rebuilt, false);
    assert.strictEqual(r.text, input);
    assert.ok(r.reason);
  });
}
check('rebuild never drops or adds words (fuzz over the corpus with mangled spacing and case)', () => {
  for (const item of Object.values(corpus)) {
    const mangled = strip(gen(item)).replace(/\. /g, '.  ').replace(/^(\w)/, c => c.toLowerCase());
    const r = rebuild(mangled);
    if (r.rebuilt) assert.strictEqual(run('referenceWordSignature(__v.a)', { a: r.text }), run('referenceWordSignature(__v.a)', { a: mangled }));
  }
});

// Author edge cases that used to be left as typed.
check('suffix (Jr.) and hyphenated initials round-trip', () => {
  const input = 'Smith, J. A., Jr., & Martin, J.-P. (2020). Names. Press.';
  const r = rebuild(input);
  assert.ok(r.rebuilt, r.reason);
  assert.strictEqual(r.text, 'Smith, J. A., Jr., & Martin, J.-P. (2020). *Names*. Press.');
  assert.strictEqual(rebuild(r.text).text, r.text);
});
check('long author list with an ellipsis round-trips (19 authors, ellipsis, last author)', () => {
  const names = Array.from({ length: 19 }, (_, i) => `Author${String.fromCharCode(65 + i)}, A.`);
  const input = `${names.join(', ')}, ... Final, Z. (2020). Big team science. Press.`;
  const r = rebuild(input);
  assert.ok(r.rebuilt, r.reason);
  assert.strictEqual(r.text, `${names.join(', ')}, ... Final, Z. (2020). *Big team science*. Press.`);
  assert.strictEqual(rebuild(r.text).text, r.text);
});
check('plain-text news article is recognized from the URL', () => {
  const r = rebuild('Doe, J. (2024, March 5). Why sleep matters. The New York Times. https://www.nytimes.com/x');
  assert.ok(r.rebuilt, r.reason);
  assert.strictEqual(r.text, 'Doe, J. (2024, March 5). Why sleep matters. *The New York Times*. https://www.nytimes.com/x');
  const blog = rebuild('Doe, J. (2024). A normal report. Some Agency. https://agency.gov/r');
  assert.strictEqual(blog.text, 'Doe, J. (2024). *A normal report*. Some Agency. https://agency.gov/r');
});
check('citation-form author input accepts hyphenated initials', () => {
  assert.strictEqual(run("formatAuthorsApa(parseAuthorsInput('Martin, J.-P., & Lee, R.'))"), 'Martin, J.-P., & Lee, R.');
});

// Existing pure helpers also run without a browser.
check('engine: sentence case, page ranges, suffixes, BibTeX', () => {
  assert.strictEqual(run("toSentenceCase('Climate Change In Manila And The Philippines')"), 'Climate change in Manila and the Philippines');
  assert.strictEqual(run("normalizePageRanges('Doe, J. (2020). T. J, 3(2), 45-67. https://x.org/a-1-22')"), 'Doe, J. (2020). T. J, 3(2), 45–67. https://x.org/a-1-22');
  assert.strictEqual(run("JSON.stringify(assignYearSuffixes(['Doe, J. (2020). Zebras. P.', 'Doe, J. (2020). Apples. P.']).entries)"), JSON.stringify(['Doe, J. (2020a). Apples. P.', 'Doe, J. (2020b). Zebras. P.']));
  assert.strictEqual(run("parseBibtexEntries('@article{k, author={Doe, Jane}, title={T}, journal={J}, year={2020}}').length"), 1);
});

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall passed');
