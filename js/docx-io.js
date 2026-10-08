// Word (.docx) reading and writing without a library: a ZIP reader (uses the browser's built-in
// DecompressionStream), a package builder with optional page-number header, and small OOXML helpers.
// Shared by the Table of Contents formatter and the Paper Reviewer. Loaded before them.

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class DocxError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
        throw new DocxError('UNSUPPORTED_BROWSER', 'This browser cannot open Word files. Please use a current version of Chrome, Edge, Firefox or Safari.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns a Map of part name -> Uint8Array. Throws DocxError with a friendly message for non-.docx files.
async function readDocxZip(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length > 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
        throw new DocxError('LEGACY_DOC', 'This is an older binary Word file (.doc). Open it in Word, choose File > Save As, pick "Word Document (.docx)", and upload that copy.');
    }
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
        throw new DocxError('NOT_DOCX', 'That file is not a Word document. Please choose a .docx file.');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new DocxError('NOT_DOCX', 'That file looks damaged: its ZIP directory could not be found.');
    const count = view.getUint16(eocd + 10, true);
    let pos = view.getUint32(eocd + 16, true);
    if (count === 0xFFFF || pos === 0xFFFFFFFF) throw new DocxError('NOT_DOCX', 'That file is too large or uses an unsupported ZIP format.');
    const dec = new TextDecoder();
    const files = new Map();
    for (let n = 0; n < count; n++) {
        if (view.getUint32(pos, true) !== 0x02014b50) throw new DocxError('NOT_DOCX', 'That file looks damaged: a ZIP entry is unreadable.');
        const flags = view.getUint16(pos + 8, true);
        const method = view.getUint16(pos + 10, true);
        const csize = view.getUint32(pos + 20, true);
        const nameLen = view.getUint16(pos + 28, true);
        const extraLen = view.getUint16(pos + 30, true);
        const commentLen = view.getUint16(pos + 32, true);
        const local = view.getUint32(pos + 42, true);
        const name = dec.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
        pos += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith('/')) continue;
        if (flags & 1) throw new DocxError('ENCRYPTED', 'This document is password-protected. Remove the password in Word and upload it again.');
        const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const raw = bytes.subarray(dataStart, dataStart + csize);
        if (method === 0) files.set(name, raw.slice());
        else if (method === 8) files.set(name, await inflateRaw(raw));
        else throw new DocxError('NOT_DOCX', 'That file uses an unsupported compression method.');
    }
    if (!files.has('word/document.xml')) {
        throw new DocxError('NOT_DOCX', 'That ZIP file is not a Word document (word/document.xml is missing).');
    }
    return files;
}

function writeDocxZip(files) {
    const list = [...files.entries()].map(([name, data]) => ({ name, data }));
    list.sort((a, b) => (b.name === '[Content_Types].xml') - (a.name === '[Content_Types].xml'));
    return buildZip(list);
}

// ── XML helpers ─────────────────────────────────────────────────────────
function parseXmlString(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new DocxError('BAD_XML', 'A part of the Word file could not be read (invalid XML).');
    return doc;
}

function serializeXml(doc) {
    const xml = new XMLSerializer().serializeToString(doc).replace(/^\s*<\?xml[^?]*\?>\s*/, '');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
}

// Builds element(s) from a string using the w: and r: prefixes, owned by `doc`.
function xmlFragment(doc, xml) {
    const wrapper = new DOMParser().parseFromString(`<root xmlns:w="${W_NS}" xmlns:r="${R_NS}">${xml}</root>`, 'application/xml');
    if (wrapper.getElementsByTagName('parsererror').length) throw new Error('Bad XML fragment: ' + xml.slice(0, 80));
    const nodes = [...wrapper.documentElement.children].map(el => doc.importNode(el, true));
    return nodes.length === 1 ? nodes[0] : nodes;
}

const wChildren = (el, name) => [...el.children].filter(c => c.localName === name && c.namespaceURI === W_NS);
const wChild = (el, name) => wChildren(el, name)[0] || null;
const wAttr = (el, name) => (el && el.getAttributeNS(W_NS, name)) || '';
const wDescendants = (el, name) => [...el.getElementsByTagNameNS(W_NS, name)];

function isTruthyToggle(el) {
    if (!el) return false;
    const v = wAttr(el, 'val');
    return !(v === '0' || v === 'false' || v === 'off');
}

// Visible text of a paragraph: runs only (deleted text, field instructions excluded).
function paragraphPlainText(p) {
    let out = '';
    const walk = node => {
        for (const c of node.children) {
            if (c.namespaceURI !== W_NS) continue;
            switch (c.localName) {
                case 't': out += c.textContent; break;
                case 'tab': out += '\t'; break;
                case 'br': case 'cr': out += c.getAttributeNS(W_NS, 'type') === 'page' ? '' : '\n'; break;
                case 'noBreakHyphen': out += '-'; break;
                case 'r': case 'hyperlink': case 'ins': case 'smartTag': case 'fldSimple': case 'sdt': case 'sdtContent': case 'sdtPr': if (c.localName !== 'sdtPr') walk(c); break;
                default: break;
            }
        }
    };
    walk(p);
    return out;
}

// ── Package builder (used for generated documents) ─────────────────────
function pageNumberFieldRuns() {
    return '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
}

// APA page header: page number flush right, or running head (left) + page number (right) for professional papers.
function apaHeaderXml(runningHead = '') {
    const head = runningHead
        ? `<w:r><w:t xml:space="preserve">${xmlEscape(runningHead)}</w:t></w:r><w:r><w:tab/></w:r>`
        : '';
    const pPr = runningHead
        ? '<w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
        : '<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p>${pPr}${head}${pageNumberFieldRuns()}</w:p></w:hdr>`;
}

const DOCX_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function buildDocxPackage({ bodyXml, stylesXml, headerXml = '' }) {
    const sect = `<w:sectPr>${headerXml ? '<w:headerReference w:type="default" r:id="rId2"/>' : ''}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${bodyXml}${sect}</w:body></w:document>`;
    const files = [
        { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${headerXml ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}</Types>` },
        { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${DOCX_REL}/officeDocument" Target="word/document.xml"/></Relationships>` },
        { name: 'word/document.xml', data: documentXml },
        { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${DOCX_REL}/styles" Target="styles.xml"/>${headerXml ? `<Relationship Id="rId2" Type="${DOCX_REL}/header" Target="header1.xml"/>` : ''}</Relationships>` },
        { name: 'word/styles.xml', data: stylesXml }
    ];
    if (headerXml) files.push({ name: 'word/header1.xml', data: headerXml });
    return buildZip(files);
}

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Lets the browser repaint between steps so progress bars visibly advance.
const nextFrame = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
