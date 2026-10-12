// Diagram Maker, part 1: data model, geometry, text layout, SVG output and APA checks.
// Pure logic with no DOM, so it can be tested in Node and shared by every export format.

// One canvas unit is one printed point. A figure is scaled down only if it is wider than the 6.5 in text area.
const DG_W = 600;
const DG_H = 480;
const DG_GRID = 10;
const DG_MAX_W = 468;
const DG_MAX_H = 620;
const DG_FILLS = { white: '#ffffff', light: '#e6e6e6', mid: '#bfbfbf' };
const DG_FONTS = ['Arial', 'Calibri', 'Lucida Sans Unicode'];
const DG_SHAPES = {
    rect: { label: 'Box', w: 120, h: 50 },
    round: { label: 'Rounded box', w: 120, h: 50 },
    oval: { label: 'Oval', w: 120, h: 56 },
    diamond: { label: 'Decision', w: 130, h: 80 },
    text: { label: 'Label', w: 110, h: 28 }
};

// Helvetica/Arial advance widths (1000 units per em) for ASCII 32-126; the same table drives wrapping,
// the PDF export and the editor so line breaks match everywhere.
const DG_HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

function dgTextWidth(text, size, bold = false) {
    let total = 0;
    for (const ch of String(text)) {
        const c = ch.charCodeAt(0);
        total += c >= 32 && c <= 126 ? DG_HELV[c - 32] : (c === 160 ? 278 : 556);
    }
    return total * size / 1000 * (bold ? 1.06 : 1);
}

function dgWrap(text, maxWidth, size, bold = false) {
    const out = [];
    String(text).split('\n').forEach(para => {
        const words = para.split(/[ \t]+/).filter(Boolean); // non-breaking spaces keep "(n = )" together
        if (!words.length) { out.push(''); return; }
        let line = '';
        words.forEach(w => {
            const trial = line ? `${line} ${w}` : w;
            if (line && dgTextWidth(trial, size, bold) > maxWidth) { out.push(line); line = w; }
            else line = trial;
        });
        out.push(line);
    });
    return out;
}

// ── State ──────────────────────────────────────────────────────────────
function dgNewState() {
    return { nodes: [], edges: [], meta: { number: '1', title: '', note: '', alt: '', font: 'Arial', size: 12 } };
}

function dgClone(state) { return JSON.parse(JSON.stringify(state)); }

// Line style is 'solid', 'dashed' or 'dotted'. Projects saved before dotted lines existed used a dashed flag.
const DG_STYLES = ['solid', 'dashed', 'dotted'];
function dgLineStyle(item) {
    if (DG_STYLES.includes(item.style)) return item.style;
    return item.dashed ? 'dashed' : 'solid';
}
function dgNormalize(state) {
    [...(state.nodes || []), ...(state.edges || [])].forEach(it => { it.style = dgLineStyle(it); delete it.dashed; });
    return state;
}

let dgIdSeq = 0;
function dgNextId(prefix) { return `${prefix}${++dgIdSeq}_${Math.random().toString(36).slice(2, 6)}`; }

function dgMakeNode(type, x, y, text = '') {
    const d = DG_SHAPES[type] || DG_SHAPES.rect;
    return { id: dgNextId('n'), type, x, y, w: d.w, h: d.h, text, fill: type === 'text' ? 'white' : 'white', bold: false, style: 'solid' };
}

function dgMakeEdge(from, to, label = '') {
    return { id: dgNextId('e'), from, to, label, style: 'solid', arrow: 'end', route: 'straight' };
}

// ── Geometry ───────────────────────────────────────────────────────────
const dgCenter = n => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

// Where the line from the node centre toward (px, py) leaves the node's outline.
function dgBorderPoint(n, px, py) {
    const c = dgCenter(n);
    const dx = px - c.x;
    const dy = py - c.y;
    if (!dx && !dy) return c;
    const hw = n.w / 2, hh = n.h / 2;
    let t;
    if (n.type === 'oval') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
    else if (n.type === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: c.x + dx * t, y: c.y + dy * t };
}

function dgEdgePoints(e, byId) {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return null;
    const ca = dgCenter(a), cb = dgCenter(b);
    if (e.route === 'elbow') {
        // Side by side (a clear horizontal gap, little vertical separation): leave left/right. Otherwise,
        // as in a tree, leave the bottom/top and enter the top/bottom.
        const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
        const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
        const horizontal = gapX > gapY;
        if (horizontal) {
            const sx = cb.x >= ca.x ? a.x + a.w : a.x;
            const ex = cb.x >= ca.x ? b.x : b.x + b.w;
            const mx = (sx + ex) / 2;
            return [[sx, ca.y], [mx, ca.y], [mx, cb.y], [ex, cb.y]];
        }
        const sy = cb.y >= ca.y ? a.y + a.h : a.y;
        const ey = cb.y >= ca.y ? b.y : b.y + b.h;
        const my = (sy + ey) / 2;
        return [[ca.x, sy], [ca.x, my], [cb.x, my], [cb.x, ey]];
    }
    const s = dgBorderPoint(a, cb.x, cb.y);
    const t = dgBorderPoint(b, ca.x, ca.y);
    return [[s.x, s.y], [t.x, t.y]];
}

// Text area available inside a shape.
function dgInnerWidth(n) {
    switch (n.type) {
        case 'oval': return n.w * 0.74 - 8;
        case 'diamond': return n.w * 0.58 - 4;
        case 'round': return n.w - 24;
        case 'text': return n.w;
        default: return n.w - 16;
    }
}

// Grows a node's height so its text fits (never shrinks it).
function dgFitNode(n, meta) {
    const lh = meta.size * 1.2;
    const lines = dgWrap(n.text, dgInnerWidth(n), meta.size, n.bold);
    const needed = lines.length * lh + (n.type === 'diamond' ? n.h * 0.4 : 16);
    const target = n.type === 'diamond' ? Math.max(n.h, lines.length * lh / 0.55) : needed;
    if (n.type === 'text') n.h = Math.max(20, Math.ceil(lines.length * lh + 6));
    else if (target > n.h) n.h = Math.ceil(target / DG_GRID) * DG_GRID;
}

// ── Primitives (shared by SVG, PDF and Word) ───────────────────────────
function dgPrimitives(state) {
    const { meta } = state;
    const size = meta.size;
    const lh = size * 1.2;
    const byId = Object.fromEntries(state.nodes.map(n => [n.id, n]));
    const shapes = state.nodes.map(n => {
        const lines = dgWrap(n.text, dgInnerWidth(n), size, n.bold);
        const blockH = lines.length * lh;
        const top = n.y + (n.h - blockH) / 2;
        return {
            id: n.id, type: n.type, x: n.x, y: n.y, w: n.w, h: n.h, fill: DG_FILLS[n.fill] || '#ffffff', fillName: n.fill, style: dgLineStyle(n), bold: n.bold,
            lines: lines.map((text, i) => ({ text, x: n.x + n.w / 2, y: top + i * lh + size * 0.92, width: dgTextWidth(text, size, n.bold) }))
        };
    });
    const edges = [];
    state.edges.forEach(e => {
        const pts = dgEdgePoints(e, byId);
        if (!pts) return;
        let label = null;
        if (e.label && e.label.trim()) {
            const a = pts.length === 2 ? pts[0] : pts[1];
            const b = pts.length === 2 ? pts[1] : pts[2];
            const mid = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
            const w = dgTextWidth(e.label, size) + 8;
            // On a vertical segment the label sits beside the line so it never hides the arrowhead.
            const vertical = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
            const cx = vertical ? mid.x + w / 2 + 5 : mid.x;
            label = { text: e.label, x: cx, y: mid.y, w, h: lh + 4, baseline: mid.y + size * 0.35 };
        }
        edges.push({ id: e.id, points: pts, style: dgLineStyle(e), startArrow: e.arrow === 'both', endArrow: e.arrow === 'end' || e.arrow === 'both', label });
    });
    // Bounding box over everything drawn, with a small margin.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    shapes.forEach(s => { grow(s.x, s.y); grow(s.x + s.w, s.y + s.h); });
    edges.forEach(e => { e.points.forEach(p => grow(p[0], p[1])); if (e.label) { grow(e.label.x - e.label.w / 2, e.label.y - e.label.h / 2); grow(e.label.x + e.label.w / 2, e.label.y + e.label.h / 2); } });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 200; maxY = 100; }
    const pad = 12;
    const bbox = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    return { shapes, edges, bbox, font: meta.font, size, lh };
}

// Scale applied when the figure is placed on the page (never enlarges).
function dgExportScale(bbox) {
    return Math.min(1, DG_MAX_W / bbox.w, DG_MAX_H / bbox.h);
}

// ── SVG ────────────────────────────────────────────────────────────────
const dgEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dgNum = n => Math.round(n * 100) / 100;

function dgShapePath(s) {
    const { x, y, w, h } = s;
    if (s.type === 'diamond') return `<polygon points="${dgNum(x + w / 2)},${dgNum(y)} ${dgNum(x + w)},${dgNum(y + h / 2)} ${dgNum(x + w / 2)},${dgNum(y + h)} ${dgNum(x)},${dgNum(y + h / 2)}"`;
    if (s.type === 'oval') return `<ellipse cx="${dgNum(x + w / 2)}" cy="${dgNum(y + h / 2)}" rx="${dgNum(w / 2)}" ry="${dgNum(h / 2)}"`;
    if (s.type === 'round') return `<rect x="${dgNum(x)}" y="${dgNum(y)}" width="${dgNum(w)}" height="${dgNum(h)}" rx="14" ry="14"`;
    return `<rect x="${dgNum(x)}" y="${dgNum(y)}" width="${dgNum(w)}" height="${dgNum(h)}"`;
}

// Dashed lines use 6-on 4-off; dotted lines are zero-length dashes with round caps, which draw true dots.
function dgSvgDash(style) {
    if (style === 'dashed') return ' stroke-dasharray="6 4"';
    if (style === 'dotted') return ' stroke-dasharray="0.1 4.2" stroke-linecap="round"';
    return '';
}

// Inner SVG markup. `ids` adds data-* attributes the editor uses for hit testing.
function dgSvgBody(prim, { ids = false, uid = 'f' } = {}) {
    const defs = `<defs><marker id="${uid}-ae" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker>`
        + `<marker id="${uid}-as" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="#000"/></marker></defs>`;
    const edgeSvg = prim.edges.map(e => {
        const d = e.points.map((p, i) => `${i ? 'L' : 'M'}${dgNum(p[0])},${dgNum(p[1])}`).join(' ');
        const attrs = `fill="none" stroke="#000" stroke-width="1.5"${dgSvgDash(e.style)}${e.endArrow ? ` marker-end="url(#${uid}-ae)"` : ''}${e.startArrow ? ` marker-start="url(#${uid}-as)"` : ''}`;
        const hit = ids ? `<path d="${d}" fill="none" stroke="transparent" stroke-width="16" data-edge="${e.id}" style="cursor:pointer"/>` : '';
        let label = '';
        if (e.label) {
            label = `<rect x="${dgNum(e.label.x - e.label.w / 2)}" y="${dgNum(e.label.y - e.label.h / 2)}" width="${dgNum(e.label.w)}" height="${dgNum(e.label.h)}" fill="#fff"${ids ? ` data-edge="${e.id}"` : ''}/>`
                + `<text x="${dgNum(e.label.x)}" y="${dgNum(e.label.baseline)}" text-anchor="middle"${ids ? ` data-edge="${e.id}"` : ''}>${dgEsc(e.label.text)}</text>`;
        }
        return `<g><path d="${d}" ${attrs}/>${hit}${label}</g>`;
    }).join('');
    const nodeSvg = prim.shapes.map(s => {
        const hasBox = s.type !== 'text';
        const box = hasBox ? `${dgShapePath(s)} fill="${s.fill}" stroke="#000" stroke-width="1.5"${dgSvgDash(s.style)}/>`
            : `<rect x="${dgNum(s.x)}" y="${dgNum(s.y)}" width="${dgNum(s.w)}" height="${dgNum(s.h)}" fill="${ids ? 'rgba(0,0,0,0)' : 'none'}"/>`;
        const text = s.lines.map(l => `<text x="${dgNum(l.x)}" y="${dgNum(l.y)}" text-anchor="middle"${s.bold ? ' font-weight="bold"' : ''}>${dgEsc(l.text)}</text>`).join('');
        return `<g${ids ? ` data-node="${s.id}" style="cursor:move"` : ''}>${box}${text}</g>`;
    }).join('');
    return defs + edgeSvg + nodeSvg;
}

// A complete, standalone SVG of the figure cropped to its content.
function dgFigureSvg(state) {
    const prim = dgPrimitives(state);
    const b = prim.bbox;
    return {
        prim,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${dgNum(b.x)} ${dgNum(b.y)} ${dgNum(b.w)} ${dgNum(b.h)}" width="${dgNum(b.w * dgExportScale(b))}pt" height="${dgNum(b.h * dgExportScale(b))}pt" font-family="${dgEsc(prim.font)}, Arial, Helvetica, sans-serif" font-size="${prim.size}">`
            + `<rect x="${dgNum(b.x)}" y="${dgNum(b.y)}" width="${dgNum(b.w)}" height="${dgNum(b.h)}" fill="#fff"/>${dgSvgBody(prim)}</svg>`
    };
}

// ── APA checks ─────────────────────────────────────────────────────────
function dgIsTitleCase(title) {
    const minor = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'via', 'with']);
    const words = title.trim().split(/\s+/).filter(w => /[A-Za-z]/.test(w));
    return words.every((w, i) => {
        const clean = w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
        if (!clean) return true;
        if (i > 0 && i < words.length - 1 && minor.has(clean.toLowerCase())) return true;
        return /^[A-Z0-9]/.test(clean);
    });
}

function dgChecks(state) {
    const out = [];
    const m = state.meta;
    const add = (level, text) => out.push({ level, text });
    if (!state.nodes.length) { add('info', 'Add a shape to start your figure.'); return out; }
    if (!String(m.number).trim()) add('warn', 'Give the figure a number (APA numbers figures 1, 2, 3 in order of appearance).');
    if (!m.title.trim()) add('warn', 'Add a figure title: a brief, descriptive phrase in italic title case.');
    else if (!dgIsTitleCase(m.title)) add('warn', 'The figure title should be in title case (capitalize the main words).');
    if (!m.alt.trim()) add('warn', 'Add alternative text so screen-reader users can understand the figure (describe what it shows).');
    if (m.size < 8 || m.size > 14) add('warn', 'APA recommends 8 to 14 pt sans-serif text inside figures.');
    const bb = dgPrimitives(state).bbox;
    const printed = m.size * dgExportScale(bb);
    if (printed < 7.95) add('warn', `At this width the text will print at about ${Math.round(printed * 10) / 10} pt. Make the diagram narrower or use fewer shapes so text stays at 8 pt or more.`);
    const byId = Object.fromEntries(state.nodes.map(n => [n.id, n]));
    const linked = new Set();
    state.edges.forEach(e => { linked.add(e.from); linked.add(e.to); });
    const isolated = state.nodes.filter(n => n.type !== 'text' && !linked.has(n.id));
    if (state.nodes.filter(n => n.type !== 'text').length > 1 && isolated.length) add('warn', `${isolated.length} shape${isolated.length === 1 ? ' is' : 's are'} not connected to anything.`);
    const empty = state.nodes.filter(n => n.type !== 'text' && !n.text.trim());
    if (empty.length) add('warn', `${empty.length} shape${empty.length === 1 ? ' has' : 's have'} no text.`);
    let overlaps = 0;
    for (let i = 0; i < state.nodes.length; i++) for (let j = i + 1; j < state.nodes.length; j++) {
        const a = state.nodes[i], b = state.nodes[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps++;
    }
    if (overlaps) add('warn', `${overlaps} pair${overlaps === 1 ? '' : 's'} of shapes overlap.`);
    const usesGray = state.nodes.some(n => n.fill !== 'white');
    if (usesGray) add('info', 'Gray fills are fine, but keep enough contrast for black-and-white printing.');
    if (!out.some(c => c.level === 'warn')) add('ok', 'Looks good: black-and-white, sans-serif, numbered, titled and described.');
    void byId;
    return out;
}

// ── Templates ──────────────────────────────────────────────────────────
function dgTemplate(name) {
    const s = dgNewState();
    const K = 0.6; // templates were laid out on a 1000-wide grid
    const snap = v => Math.round(v / (DG_GRID / 2)) * (DG_GRID / 2);
    const N = (type, x, y, text, extra = {}) => { const n = dgMakeNode(type, snap(x * K), snap(y * K), text); Object.assign(n, extra); s.nodes.push(n); return n; };
    const E = (a, b, label = '', extra = {}) => { const e = dgMakeEdge(a.id, b.id, label); Object.assign(e, extra); s.edges.push(e); return e; };
    if (name === 'mediation') {
        s.meta.title = 'Mediation Model of the Relationship Between Study Hours and Exam Performance';
        const iv = N('rect', 80, 360, 'Study hours'), med = N('rect', 420, 120, 'Sleep quality'), dv = N('rect', 760, 360, 'Exam performance');
        E(iv, med, 'a'); E(med, dv, 'b'); E(iv, dv, 'c');
    } else if (name === 'moderation') {
        s.meta.title = 'Moderation Model of Social Support on Stress and Well-Being';
        const iv = N('rect', 80, 330, 'Perceived stress'), dv = N('rect', 760, 330, 'Well-being'), mod = N('rect', 420, 80, 'Social support');
        const anchor = N('text', 0, 0, ''); // invisible point on the stress -> well-being path
        anchor.w = 6; anchor.h = 6;
        anchor.x = Math.round((iv.x + iv.w + dv.x) / 2) - 3; anchor.y = iv.y + iv.h / 2 - 3;
        mod.x = Math.round(anchor.x + 3 - mod.w / 2);
        E(iv, dv); E(mod, anchor);
    } else if (name === 'flow') {
        const NN = '(n\u00a0=\u00a0)';
        s.meta.title = 'Participant Flow Through the Study';
        const a = N('rect', 380, 20, `Assessed for eligibility ${NN}`), x = N('rect', 700, 120, `Excluded ${NN}\nDid not meet criteria`), r = N('rect', 380, 200, `Randomized ${NN}`);
        const g1 = N('rect', 160, 340, `Intervention group ${NN}`), g2 = N('rect', 600, 340, `Control group ${NN}`);
        const f1 = N('rect', 160, 470, `Analyzed ${NN}`), f2 = N('rect', 600, 470, `Analyzed ${NN}`);
        E(a, r); E(a, x, '', { route: 'elbow' }); E(r, g1, '', { route: 'elbow' }); E(r, g2, '', { route: 'elbow' }); E(g1, f1); E(g2, f2);
    } else if (name === 'process') {
        s.meta.title = 'Procedure for Screening and Referral';
        const st = N('oval', 380, 0, 'Start'), p1 = N('rect', 380, 150, 'Screen participant'), d = N('diamond', 365, 290, 'Meets criteria?'), p2 = N('rect', 380, 470, 'Enroll participant'), no = N('oval', 700, 310, 'Refer elsewhere'), end = N('oval', 380, 600, 'End');
        [st, p1, p2, end].forEach(n => { n.x = d.x + (d.w - n.w) / 2; });
        no.y = d.y + (d.h - no.h) / 2;
        E(st, p1); E(p1, d); E(d, p2, 'Yes'); E(d, no, 'No'); E(p2, end);
    } else if (name === 'framework') {
        s.meta.title = 'Conceptual Framework of the Study';
        const i1 = N('rect', 60, 100, 'Teacher training'), i2 = N('rect', 60, 260, 'School resources'), i3 = N('rect', 60, 420, 'Community support');
        const o = N('round', 420, 250, 'Learner outcomes', { fill: 'light' }), c = N('rect', 760, 250, 'Long-term wellbeing');
        o.y = i2.y + (i2.h - o.h) / 2; c.y = o.y + (o.h - c.h) / 2;
        E(i1, o, '', { route: 'elbow' }); E(i2, o); E(i3, o, '', { route: 'elbow' }); E(o, c);
    } else if (name === 'cycle') {
        s.meta.title = 'Action Research Cycle';
        const p = N('rect', 400, 40, 'Plan'), a = N('rect', 700, 250, 'Act'), o = N('rect', 400, 460, 'Observe'), r = N('rect', 100, 250, 'Reflect');
        E(p, a, '', { route: 'elbow' }); E(a, o, '', { route: 'elbow' }); E(o, r, '', { route: 'elbow' }); E(r, p, '', { route: 'elbow' });
    }
    s.nodes.forEach(n => { if (!(n.type === 'text' && n.w === 6)) dgFitNode(n, s.meta); });
    return s;
}

if (typeof module !== 'undefined') module.exports = { dgNormalize, dgLineStyle, dgTextWidth, dgWrap, dgPrimitives, dgFigureSvg, dgChecks, dgTemplate, dgNewState };
