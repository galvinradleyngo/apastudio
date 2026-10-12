// Diagram Maker, part 2: exports. A vector PDF written by hand (no library) and a Word figure made of
// real, editable shapes grouped together, with a picture fallback for programs that cannot read shapes.
// Uses diagram-core.js (dgPrimitives etc.) and docx-io.js (buildDocxPackage, xmlEscape via export.js).

// ── PDF ────────────────────────────────────────────────────────────────
const PDF_WIN_ANSI = { 8211: 150, 8212: 151, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8230: 133, 8364: 128 };

function pdfEscape(text) {
    let out = '';
    for (const ch of String(text)) {
        let c = ch.charCodeAt(0);
        if (PDF_WIN_ANSI[c]) c = PDF_WIN_ANSI[c];
        if (c === 40 || c === 41 || c === 92) out += '\\' + ch;
        else if (c >= 32 && c < 127) out += ch;
        else if (c >= 128 && c <= 255) out += '\\' + c.toString(8).padStart(3, '0');
        else out += '?';
    }
    return out;
}

// Times is narrower than Helvetica; scaling Helvetica widths keeps wrapped caption lines safely inside the margins.
const pdfTimesWidth = (text, size, bold) => dgTextWidth(text, size, bold) * 0.93;

function pdfWrapTimes(text, maxWidth, size, bold) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(w => {
        const trial = line ? `${line} ${w}` : w;
        if (line && pdfTimesWidth(trial, size, bold) > maxWidth) { lines.push(line); line = w; } else line = trial;
    });
    if (line) lines.push(line);
    return lines;
}

// Returns a Blob (application/pdf): letter page, 1 inch margins, APA figure label, italic title, figure, note.
function dgPdfBlob(state) {
    const prim = dgPrimitives(state);
    const m = state.meta;
    const PAGE_W = 612, PAGE_H = 792, MARGIN = 72, CW = PAGE_W - MARGIN * 2;
    const ops = [];
    const f = v => (Math.round(v * 100) / 100).toString();
    let cursor = PAGE_H - MARGIN;

    const text = (font, size, x, y, str) => ops.push(`BT /${font} ${f(size)} Tf ${f(x)} ${f(y)} Td (${pdfEscape(str)}) Tj ET`);

    // Caption block.
    text('F4', 12, MARGIN, cursor - 11, `Figure ${m.number || ''}`.trim());
    cursor -= 20;
    pdfWrapTimes(m.title || '', CW, 12, false).forEach(line => { text('F5', 12, MARGIN, cursor - 11, line); cursor -= 16; });
    cursor -= 8;

    // Figure.
    const s = dgExportScale(prim.bbox);
    const top = cursor;
    const X = x => MARGIN + (x - prim.bbox.x) * s;
    const Y = y => top - (y - prim.bbox.y) * s;
    const set = (c, g) => ops.push(`${f(g)} ${c}`);
    ops.push(`${f(1.5 * s)} w 0 G 1 J 1 j`);

    const path = {
        rect: sh => `${f(X(sh.x))} ${f(Y(sh.y + sh.h))} ${f(sh.w * s)} ${f(sh.h * s)} re`,
        round: sh => {
            const r = 14 * s, x0 = X(sh.x), x1 = X(sh.x + sh.w), y0 = Y(sh.y + sh.h), y1 = Y(sh.y), k = 0.5523 * r;
            return `${f(x0 + r)} ${f(y0)} m ${f(x1 - r)} ${f(y0)} l ${f(x1 - r + k)} ${f(y0)} ${f(x1)} ${f(y0 + r - k)} ${f(x1)} ${f(y0 + r)} c `
                + `${f(x1)} ${f(y1 - r)} l ${f(x1)} ${f(y1 - r + k)} ${f(x1 - r + k)} ${f(y1)} ${f(x1 - r)} ${f(y1)} c `
                + `${f(x0 + r)} ${f(y1)} l ${f(x0 + r - k)} ${f(y1)} ${f(x0)} ${f(y1 - r + k)} ${f(x0)} ${f(y1 - r)} c `
                + `${f(x0)} ${f(y0 + r)} l ${f(x0)} ${f(y0 + r - k)} ${f(x0 + r - k)} ${f(y0)} ${f(x0 + r)} ${f(y0)} c h`;
        },
        oval: sh => {
            const cx = X(sh.x + sh.w / 2), cy = Y(sh.y + sh.h / 2), rx = sh.w / 2 * s, ry = sh.h / 2 * s, k = 0.5523;
            return `${f(cx + rx)} ${f(cy)} m ${f(cx + rx)} ${f(cy + ry * k)} ${f(cx + rx * k)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} c `
                + `${f(cx - rx * k)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ry * k)} ${f(cx - rx)} ${f(cy)} c `
                + `${f(cx - rx)} ${f(cy - ry * k)} ${f(cx - rx * k)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} c `
                + `${f(cx + rx * k)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ry * k)} ${f(cx + rx)} ${f(cy)} c h`;
        },
        diamond: sh => `${f(X(sh.x + sh.w / 2))} ${f(Y(sh.y))} m ${f(X(sh.x + sh.w))} ${f(Y(sh.y + sh.h / 2))} l ${f(X(sh.x + sh.w / 2))} ${f(Y(sh.y + sh.h))} l ${f(X(sh.x))} ${f(Y(sh.y + sh.h / 2))} l h`
    };
    const gray = hex => parseInt(hex.slice(1, 3), 16) / 255;
    // Dotted = zero-length dashes; the round line cap (1 J, set above) turns them into dots.
    const pdfDash = (style, k) => (style === 'dashed' ? `[${f(6 * k)} ${f(4 * k)}] 0 d` : style === 'dotted' ? `[0 ${f(4.2 * k)}] 0 d` : '[] 0 d');

    // Connectors first, so shapes sit on top.
    prim.edges.forEach(e => {
        const pts = e.points.map(p => [X(p[0]), Y(p[1])]);
        ops.push(pdfDash(e.style, s));
        // Stop the line at the arrow base so the head is not drawn over by the line's width.
        const head = 9 * s;
        const trimmed = pts.map(p => p.slice());
        const pull = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1; a[0] += dx / len * head * 0.8; a[1] += dy / len * head * 0.8; };
        if (e.endArrow) pull(trimmed[trimmed.length - 1], trimmed[trimmed.length - 2]);
        if (e.startArrow) pull(trimmed[0], trimmed[1]);
        ops.push(trimmed.map((p, i) => `${f(p[0])} ${f(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' S');
        ops.push('[] 0 d');
        const arrow = (tip, from) => {
            const dx = tip[0] - from[0], dy = tip[1] - from[1], len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len, bx = tip[0] - ux * head, by = tip[1] - uy * head, w = head * 0.42;
            ops.push(`0 g ${f(tip[0])} ${f(tip[1])} m ${f(bx - uy * w)} ${f(by + ux * w)} l ${f(bx + uy * w)} ${f(by - ux * w)} l h f`);
        };
        if (e.endArrow) arrow(pts[pts.length - 1], pts[pts.length - 2]);
        if (e.startArrow) arrow(pts[0], pts[1]);
        if (e.label) {
            const l = e.label;
            ops.push(`1 g ${f(X(l.x - l.w / 2))} ${f(Y(l.y + l.h / 2))} ${f(l.w * s)} ${f(l.h * s)} re f 0 g`);
            text('F1', prim.size * s, X(l.x) - dgTextWidth(l.text, prim.size) * s / 2, Y(l.baseline), l.text);
        }
    });
    prim.shapes.forEach(sh => {
        if (sh.type !== 'text') {
            ops.push(pdfDash(sh.style, s));
            ops.push(`${f(gray(sh.fill))} g 0 G ${path[sh.type](sh)} B`);
            ops.push('[] 0 d 0 g');
        }
        sh.lines.forEach(l => text(sh.bold ? 'F2' : 'F1', prim.size * s, X(l.x) - l.width * s / 2, Y(l.y), l.text));
    });
    cursor = top - prim.bbox.h * s - 12;

    // Note.
    if (m.note && m.note.trim()) {
        const noteLines = pdfWrapTimes(`Note. ${m.note.trim()}`, CW, 12, false);
        noteLines.forEach((line, i) => {
            if (i === 0) {
                text('F5', 12, MARGIN, cursor - 11, 'Note.');
                text('F3', 12, MARGIN + pdfTimesWidth('Note. ', 12, false), cursor - 11, line.replace(/^Note\.\s*/, ''));
            } else text('F3', 12, MARGIN, cursor - 11, line);
            cursor -= 16;
        });
    }

    const stream = ops.join('\n');
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R /F5 9 0 R >> >> >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        ...['Helvetica', 'Helvetica-Bold', 'Times-Roman', 'Times-Bold', 'Times-Italic'].map(n => `<< /Type /Font /Subtype /Type1 /BaseFont /${n} /Encoding /WinAnsiEncoding >>`),
        `<< /Title (${pdfEscape(`Figure ${m.number}: ${m.title}`)}) /Producer (APA Formatting Studio) >>`
    ];
    let out = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return new Blob([bytes], { type: 'application/pdf' });
}

// ── Word: editable shapes ──────────────────────────────────────────────
const DGX_NS = {
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006'
};

function dgDocxTextBody(lines, { font, size, bold, center = true, color = '000000' }) {
    const paras = lines.map(t => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${center ? 'center' : 'left'}"/></w:pPr>`
        + `<w:r><w:rPr><w:rFonts w:ascii="${xmlEscape(font)}" w:hAnsi="${xmlEscape(font)}" w:cs="${xmlEscape(font)}"/>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(t)}</w:t></w:r></w:p>`);
    return `<wps:txbx><w:txbxContent>${paras.join('')}</w:txbxContent></wps:txbx>`;
}

// The group of shapes, as a DrawingML <w:drawing> (inline) element.
function dgGroupDrawing(prim, scale, alt, title) {
    const k = 12700 * scale;                       // EMU per canvas unit
    const E = v => Math.round(v * k);
    const bx = prim.bbox.x, by = prim.bbox.y;
    const cx = E(prim.bbox.w), cy = E(prim.bbox.h);
    const size = Math.max(1, Math.round(prim.size * scale * 2) / 2);
    let id = 10;
    const shapes = [];
    const ln = (style, extra = '') => `<a:ln w="${Math.round(1.5 * scale * 12700)}"${style === 'dotted' ? ' cap="rnd"' : ''}><a:solidFill><a:srgbClr val="000000"/></a:solidFill>${style === 'dashed' ? '<a:prstDash val="dash"/>' : style === 'dotted' ? '<a:prstDash val="sysDot"/>' : ''}<a:round/>${extra}</a:ln>`;

    // Connectors: every segment is its own editable line; the last one carries the arrowhead.
    prim.edges.forEach(e => {
        for (let i = 0; i < e.points.length - 1; i++) {
            const [x1, y1] = e.points[i], [x2, y2] = e.points[i + 1];
            const first = i === 0, last = i === e.points.length - 2;
            const flipH = x2 < x1 ? ' flipH="1"' : '';
            const flipV = y2 < y1 ? ' flipV="1"' : '';
            const ends = `${first && e.startArrow ? '<a:headEnd type="triangle" w="med" len="med"/>' : ''}${last && e.endArrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ''}`;
            shapes.push(`<wps:wsp><wps:cNvPr id="${++id}" name="Connector ${id}"/><wps:cNvCnPr/><wps:spPr><a:xfrm${flipH}${flipV}><a:off x="${E(Math.min(x1, x2) - bx)}" y="${E(Math.min(y1, y2) - by)}"/><a:ext cx="${E(Math.abs(x2 - x1))}" cy="${E(Math.abs(y2 - y1))}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom>${ln(e.style, ends)}</wps:spPr><wps:bodyPr/></wps:wsp>`);
        }
    });
    const bodyPr = '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="45720" tIns="0" rIns="45720" bIns="0" anchor="ctr" anchorCtr="0"><a:noAutofit/></wps:bodyPr>';
    prim.shapes.forEach(sh => {
        const geom = { rect: 'rect', round: 'roundRect', oval: 'ellipse', diamond: 'diamond', text: 'rect' }[sh.type];
        const av = sh.type === 'round' ? '<a:avLst><a:gd name="adj" fmla="val 25000"/></a:avLst>' : '<a:avLst/>';
        const fill = sh.type === 'text' ? '<a:noFill/>' : `<a:solidFill><a:srgbClr val="${sh.fill.slice(1).toUpperCase()}"/></a:solidFill>`;
        const line = sh.type === 'text' ? '<a:ln><a:noFill/></a:ln>' : ln(sh.style);
        const lines = sh.lines.map(l => l.text).filter((t, i, arr) => !(t === '' && i === arr.length - 1));
        const body = lines.length ? dgDocxTextBody(lines, { font: prim.font, size, bold: sh.bold }) : '';
        shapes.push(`<wps:wsp><wps:cNvPr id="${++id}" name="Shape ${id}"/><wps:cNvSpPr${sh.type === 'text' ? ' txBox="1"' : ''}/><wps:spPr><a:xfrm><a:off x="${E(sh.x - bx)}" y="${E(sh.y - by)}"/><a:ext cx="${E(sh.w)}" cy="${E(sh.h)}"/></a:xfrm><a:prstGeom prst="${geom}">${av}</a:prstGeom>${fill}${line}</wps:spPr>${body}${bodyPr}</wps:wsp>`);
    });
    // Connector labels sit on a white box so they read cleanly over the line.
    prim.edges.forEach(e => {
        if (!e.label) return;
        const l = e.label;
        shapes.push(`<wps:wsp><wps:cNvPr id="${++id}" name="Label ${id}"/><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="${E(l.x - l.w / 2 - bx)}" y="${E(l.y - l.h / 2 - by)}"/><a:ext cx="${E(l.w)}" cy="${E(l.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></wps:spPr>${dgDocxTextBody([l.text], { font: prim.font, size, bold: false })}${bodyPr.replace('lIns="45720"', 'lIns="0"').replace('rIns="45720"', 'rIns="0"')}</wps:wsp>`);
    });
    return `<w:drawing><wp:inline xmlns:wp="${DGX_NS.wp}" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
        + `<wp:docPr id="1" name="${xmlEscape(title)}" descr="${xmlEscape(alt)}"/><wp:cNvGraphicFramePr/>`
        + `<a:graphic xmlns:a="${DGX_NS.a}"><a:graphicData uri="${DGX_NS.wpg}"><wpg:wgp xmlns:wpg="${DGX_NS.wpg}" xmlns:wps="${DGX_NS.wps}"><wpg:cNvGrpSpPr/>`
        + `<wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/><a:chOff x="0" y="0"/><a:chExt cx="${cx}" cy="${cy}"/></a:xfrm></wpg:grpSpPr>`
        + `${shapes.join('')}</wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

// pngBytes (optional) is placed as a fallback picture inside mc:AlternateContent.
function dgWordBlob(state, pngBytes) {
    const prim = dgPrimitives(state);
    const m = state.meta;
    const scale = dgExportScale(prim.bbox);
    const alt = m.alt || `Figure ${m.number}: ${m.title}`;
    const name = `Figure ${m.number}`;
    const group = dgGroupDrawing(prim, scale, alt, name);
    let figureRun;
    const media = [];
    if (pngBytes) {
        const cx = Math.round(prim.bbox.w * 12700 * scale), cy = Math.round(prim.bbox.h * 12700 * scale);
        media.push({ name: 'figure.png', data: pngBytes, rid: 'rIdImg1', type: 'png' });
        const fallback = inlinePictureXml({ rid: 'rIdImg1', cx, cy, alt, name, id: 1 });
        figureRun = `<w:r><mc:AlternateContent xmlns:mc="${DGX_NS.mc}" xmlns:wpg="${DGX_NS.wpg}"><mc:Choice Requires="wpg">${group}</mc:Choice><mc:Fallback>${fallback.replace(/^<w:r>|<\/w:r>$/g, '')}</mc:Fallback></mc:AlternateContent></w:r>`;
    } else {
        figureRun = `<w:r>${group}</w:r>`;
    }
    const para = (inner, ppr = '') => `<w:p><w:pPr>${ppr}</w:pPr>${inner}</w:p>`;
    const run = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(t)}</w:t></w:r>`;
    const body = [
        para(run(`Figure ${m.number}`, '<w:b/><w:bCs/>'), '<w:keepNext/><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/>'),
        para(run(m.title || 'Figure title', '<w:i/><w:iCs/>'), '<w:keepNext/><w:spacing w:before="0" w:after="120" w:line="480" w:lineRule="auto"/>'),
        para(figureRun, '<w:keepLines/><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/>')
    ];
    if (m.note && m.note.trim()) body.push(para(run('Note.', '<w:i/><w:iCs/>') + run(' ' + m.note.trim()), '<w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/>'));
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
    return buildDocxPackage({ bodyXml: body.join(''), stylesXml: styles, headerXml: apaHeaderXml(), media });
}

if (typeof module !== 'undefined') module.exports = { dgPdfBlob, dgWordBlob, pdfEscape };
