// Diagram Maker UI: an interactive SVG canvas for APA-style figures (flowcharts, conceptual frameworks).
// Geometry and exports live in diagram-core.js and diagram-export.js.

const DG_STORE_KEY = 'apastudio.diagram.v1';
const dg = {
    state: dgNewState(), sel: null, tool: 'select', connectFrom: null, snap: true,
    history: [], hIndex: -1, drag: null, ready: false, saveTimer: null
};
const dgEl = id => document.getElementById(id);
const dgSnapVal = v => (dg.snap ? Math.round(v / DG_GRID) * DG_GRID : Math.round(v));

// ── Open / lifecycle ───────────────────────────────────────────────────
function loadDiagramMaker() {
    ['home-view', 'editor-view', 'paper-view'].forEach(id => { dgEl(id).style.display = 'none'; });
    dgEl('diagram-view').style.display = 'block';
    dgEl('btn-home').style.display = 'flex';
    dgEl('btn-export').style.display = 'none';
    dgEl('btn-copy').style.display = 'none';
    if (!dg.ready) dgInit();
    dgRenderAll();
    if (window.lucide) lucide.createIcons();
}

function dgInit() {
    dg.ready = true;
    let restored = false;
    try {
        const saved = JSON.parse(localStorage.getItem(DG_STORE_KEY) || 'null');
        if (saved && Array.isArray(saved.nodes)) { dg.state = dgNormalize({ ...dgNewState(), ...saved, meta: { ...dgNewState().meta, ...saved.meta } }); restored = true; }
    } catch (e) { /* storage unavailable or corrupt: start empty */ }
    if (!restored) dg.state = dgTemplate('mediation');
    dg.history = [JSON.stringify(dg.state)];
    dg.hIndex = 0;
    const host = dgEl('dg-canvas');
    host.addEventListener('pointerdown', dgPointerDown);
    window.addEventListener('pointermove', dgPointerMove);
    window.addEventListener('pointerup', dgPointerUp);
    host.addEventListener('dblclick', e => { if (e.target.closest('[data-node]')) { const t = dgEl('dg-prop-text'); if (t) { t.focus(); t.select(); } } });
    document.addEventListener('keydown', dgKeyDown);
    dgEl('dg-file-input').addEventListener('change', dgOpenFile);
    ['dg-number', 'dg-title', 'dg-note', 'dg-alt'].forEach(id => dgEl(id).addEventListener('input', dgMetaChanged));
    ['dg-font', 'dg-size'].forEach(id => dgEl(id).addEventListener('change', dgMetaChanged));
    dgEl('dg-font').innerHTML = DG_FONTS.map(f => `<option>${f}</option>`).join('');
    dgEl('dg-size').innerHTML = [8, 9, 10, 11, 12, 13, 14].map(n => `<option value="${n}">${n} pt</option>`).join('');
    dgEl('dg-snap').addEventListener('change', e => { dg.snap = e.target.checked; dgRenderCanvas(); });
    dgSyncMetaInputs();
}

function dgSyncMetaInputs() {
    const m = dg.state.meta;
    dgEl('dg-number').value = m.number;
    dgEl('dg-title').value = m.title;
    dgEl('dg-note').value = m.note;
    dgEl('dg-alt').value = m.alt;
    dgEl('dg-font').value = m.font;
    dgEl('dg-size').value = String(m.size);
}

function dgMetaChanged() {
    const m = dg.state.meta;
    m.number = dgEl('dg-number').value;
    m.title = dgEl('dg-title').value;
    m.note = dgEl('dg-note').value;
    m.alt = dgEl('dg-alt').value;
    m.font = dgEl('dg-font').value;
    m.size = parseInt(dgEl('dg-size').value, 10) || 12;
    dg.state.nodes.forEach(n => dgFitNode(n, m));
    dgRenderCanvas();
    dgRenderPreview();
    dgRenderChecks();
    dgScheduleCommit();
}

// ── History ────────────────────────────────────────────────────────────
function dgCommit() {
    const json = JSON.stringify(dg.state);
    if (json === dg.history[dg.hIndex]) return;
    dg.history = dg.history.slice(0, dg.hIndex + 1);
    dg.history.push(json);
    if (dg.history.length > 80) dg.history.shift();
    dg.hIndex = dg.history.length - 1;
    dgPersist();
    dgRenderHistoryButtons();
}

let dgCommitTimer = null;
function dgScheduleCommit() {
    clearTimeout(dgCommitTimer);
    dgCommitTimer = setTimeout(dgCommit, 500);
}

function dgPersist() {
    clearTimeout(dg.saveTimer);
    dg.saveTimer = setTimeout(() => {
        try { localStorage.setItem(DG_STORE_KEY, JSON.stringify(dg.state)); } catch (e) { /* private mode */ }
    }, 300);
}

function dgRestore(index) {
    if (index < 0 || index >= dg.history.length) return;
    dg.hIndex = index;
    dg.state = dgNormalize(JSON.parse(dg.history[index]));
    if (dg.sel && !dgFind(dg.sel)) dg.sel = null;
    dgSyncMetaInputs();
    dgRenderAll();
    dgPersist();
}

function dgUndo() { dgCommit(); dgRestore(dg.hIndex - 1); }
function dgRedo() { dgRestore(dg.hIndex + 1); }

function dgRenderHistoryButtons() {
    const u = dgEl('dg-undo'), r = dgEl('dg-redo');
    if (u) u.disabled = dg.hIndex <= 0;
    if (r) r.disabled = dg.hIndex >= dg.history.length - 1;
}

// ── Model helpers ──────────────────────────────────────────────────────
function dgFind(sel) {
    if (!sel) return null;
    return (sel.kind === 'node' ? dg.state.nodes : dg.state.edges).find(x => x.id === sel.id) || null;
}

function dgSelect(sel) {
    dg.sel = sel;
    dgRenderCanvas();
    dgRenderProps();
}

function dgAddNode(type) {
    const count = dg.state.nodes.length;
    const step = (count % 8) * 30;
    const n = dgMakeNode(type, dgSnapVal(40 + step), dgSnapVal(40 + step), type === 'text' ? 'Label' : DG_SHAPES[type].label);
    dgFitNode(n, dg.state.meta);
    dg.state.nodes.push(n);
    dgCommit();
    dgSelect({ kind: 'node', id: n.id });
    dgRenderAll();
    const t = dgEl('dg-prop-text');
    if (t) { t.focus(); t.select(); }
}

function dgDeleteSelected() {
    if (!dg.sel) return;
    if (dg.sel.kind === 'node') {
        dg.state.nodes = dg.state.nodes.filter(n => n.id !== dg.sel.id);
        dg.state.edges = dg.state.edges.filter(e => e.from !== dg.sel.id && e.to !== dg.sel.id);
    } else dg.state.edges = dg.state.edges.filter(e => e.id !== dg.sel.id);
    dg.sel = null;
    dgCommit();
    dgRenderAll();
}

function dgDuplicateSelected() {
    const n = dg.sel && dg.sel.kind === 'node' && dgFind(dg.sel);
    if (!n) return;
    const copy = { ...n, id: dgNextId('n'), x: Math.min(DG_W - n.w, n.x + 20), y: Math.min(DG_H - n.h, n.y + 20) };
    dg.state.nodes.push(copy);
    dgCommit();
    dgSelect({ kind: 'node', id: copy.id });
    dgRenderAll();
}

function dgSetTool(tool) {
    dg.tool = tool;
    dg.connectFrom = null; // the first click picks the arrow's start; "Draw arrow from here" pre-arms it instead
    dgRenderCanvas();
    dgRenderToolbar();
}

function dgConnect(fromId, toId) {
    if (fromId === toId) return;
    if (dg.state.edges.some(e => e.from === fromId && e.to === toId)) return;
    const e = dgMakeEdge(fromId, toId);
    dg.state.edges.push(e);
    dgCommit();
    dgSelect({ kind: 'edge', id: e.id });
    dgRenderAll();
}

function dgClearAll() {
    if (dg.state.nodes.length && !confirm('Clear the whole diagram? You can undo this.')) return;
    dg.state = dgNewState();
    dg.sel = null;
    dgCommit();
    dgSyncMetaInputs();
    dgRenderAll();
}

function dgLoadTemplate(name) {
    if (!name) return;
    if (dg.state.nodes.length && !confirm('Replace the current diagram with this template? You can undo this.')) { dgEl('dg-template').value = ''; return; }
    const keep = dg.state.meta;
    dg.state = dgTemplate(name);
    dg.state.meta.number = keep.number || '1';
    dg.state.meta.font = keep.font;
    dg.state.meta.size = keep.size;
    dg.sel = null;
    dgCommit();
    dgSyncMetaInputs();
    dgRenderAll();
    dgEl('dg-template').value = '';
}

// ── Pointer interaction ────────────────────────────────────────────────
function dgToSvg(e) {
    const svg = dgEl('dg-canvas').querySelector('svg');
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
}

function dgPointerDown(e) {
    const handle = e.target.closest('[data-handle]');
    const nodeEl = e.target.closest('[data-node]');
    const edgeEl = e.target.closest('[data-edge]');
    const p = dgToSvg(e);
    if (handle) {
        const n = dgFind(dg.sel);
        if (n) dg.drag = { mode: 'resize', node: n, start: p, w: n.w, h: n.h, moved: false };
        e.preventDefault();
        return;
    }
    if (nodeEl) {
        const id = nodeEl.dataset.node;
        if (dg.tool === 'connect') {
            if (!dg.connectFrom) { dg.connectFrom = id; dgSelect({ kind: 'node', id }); }
            else { dgConnect(dg.connectFrom, id); dg.connectFrom = null; }
            dgRenderCanvas();
            return;
        }
        dgSelect({ kind: 'node', id });
        const n = dgFind({ kind: 'node', id });
        dg.drag = { mode: 'move', node: n, start: p, x: n.x, y: n.y, moved: false };
        e.preventDefault();
        return;
    }
    if (edgeEl) { dgSelect({ kind: 'edge', id: edgeEl.dataset.edge }); return; }
    dg.connectFrom = null;
    dgSelect(null);
}

function dgPointerMove(e) {
    const d = dg.drag;
    if (!d) return;
    const p = dgToSvg(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 2) return;
    d.moved = true;
    if (d.mode === 'move') {
        d.node.x = Math.max(0, Math.min(DG_W - d.node.w, dgSnapVal(d.x + dx)));
        d.node.y = Math.max(0, Math.min(DG_H - d.node.h, dgSnapVal(d.y + dy)));
    } else {
        d.node.w = Math.max(40, Math.min(DG_W - d.node.x, dgSnapVal(d.w + dx)));
        d.node.h = Math.max(24, Math.min(DG_H - d.node.y, dgSnapVal(d.h + dy)));
        dgFitNode(d.node, dg.state.meta);
    }
    dgRenderCanvas();
    dgRenderPreview();
}

function dgPointerUp() {
    const d = dg.drag;
    dg.drag = null;
    if (d && d.moved) { dgCommit(); dgRenderChecks(); dgRenderProps(); }
}

function dgKeyDown(e) {
    if (dgEl('diagram-view').style.display === 'none') return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? dgRedo() : dgUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); dgRedo(); return; }
    if (typing) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && dg.sel) { e.preventDefault(); dgDeleteSelected(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); dgDuplicateSelected(); }
    else if (e.key === 'Escape') { dg.connectFrom = null; dgSetTool('select'); dgSelect(null); }
    else if (e.key.startsWith('Arrow') && dg.sel && dg.sel.kind === 'node') {
        e.preventDefault();
        const n = dgFind(dg.sel);
        const step = e.shiftKey ? DG_GRID : 2;
        if (e.key === 'ArrowLeft') n.x = Math.max(0, n.x - step);
        if (e.key === 'ArrowRight') n.x = Math.min(DG_W - n.w, n.x + step);
        if (e.key === 'ArrowUp') n.y = Math.max(0, n.y - step);
        if (e.key === 'ArrowDown') n.y = Math.min(DG_H - n.h, n.y + step);
        dgRenderCanvas(); dgRenderPreview(); dgScheduleCommit();
    }
}

// ── Rendering ──────────────────────────────────────────────────────────
function dgRenderAll() {
    dgRenderToolbar();
    dgRenderCanvas();
    dgRenderProps();
    dgRenderPreview();
    dgRenderChecks();
    dgRenderHistoryButtons();
}

function dgRenderToolbar() {
    ['select', 'connect'].forEach(t => {
        const b = dgEl('dg-tool-' + t);
        if (!b) return;
        const on = dg.tool === t;
        b.classList.toggle('bg-teal-600', on);
        b.classList.toggle('text-white', on);
        b.classList.toggle('bg-white', !on);
        b.classList.toggle('text-slate-700', !on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const hint = dgEl('dg-hint');
    if (hint) hint.innerText = dg.tool === 'connect'
        ? (dg.connectFrom ? 'Now click the shape this arrow should point to.' : 'Click the shape the arrow starts from, then the shape it points to.')
        : 'Click a shape to select it. Drag to move. Use the corner handle to resize. Double-click to edit text.';
}

function dgRenderCanvas() {
    const prim = dgPrimitives(dg.state);
    const sel = dg.sel && dgFind(dg.sel) ? dg.sel : null;
    let ui = '';
    if (sel && sel.kind === 'node') {
        const n = dgFind(sel);
        ui += `<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" fill="none" stroke="#0d9488" stroke-width="1.5" stroke-dasharray="4 3" pointer-events="none"/>`
            + `<rect data-handle="resize" x="${n.x + n.w - 5}" y="${n.y + n.h - 5}" width="12" height="12" rx="2" fill="#0d9488" stroke="#fff" stroke-width="1.5" style="cursor:nwse-resize"/>`;
    }
    if (dg.connectFrom) {
        const n = dg.state.nodes.find(x => x.id === dg.connectFrom);
        if (n) ui += `<rect x="${n.x - 5}" y="${n.y - 5}" width="${n.w + 10}" height="${n.h + 10}" fill="none" stroke="#0d9488" stroke-width="2.5" pointer-events="none"/>`;
    }
    if (sel && sel.kind === 'edge') {
        const e = prim.edges.find(x => x.id === sel.id);
        if (e) ui += `<path d="${e.points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')}" fill="none" stroke="#0d9488" stroke-width="5" stroke-opacity="0.35" pointer-events="none"/>`;
    }
    const grid = dg.snap ? `<defs><pattern id="dg-grid" width="${DG_GRID}" height="${DG_GRID}" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.6" fill="#cbd5e1"/></pattern></defs><rect width="${DG_W}" height="${DG_H}" fill="url(#dg-grid)"/>` : '';
    dgEl('dg-canvas').innerHTML = `<svg viewBox="0 0 ${DG_W} ${DG_H}" width="100%" style="display:block;touch-action:pan-y;background:#fff" font-family="${dgEsc(dg.state.meta.font)}, Arial, Helvetica, sans-serif" font-size="${dg.state.meta.size}" role="img" aria-label="Diagram canvas">`
        + `<rect width="${DG_W}" height="${DG_H}" fill="#fff"/>${grid}<g>${dgSvgBody(prim, { ids: true, uid: 'ed' })}</g>${ui}</svg>`;
}

function dgRenderPreview() {
    const m = dg.state.meta;
    const { svg } = dgFigureSvg(dg.state);
    const empty = !dg.state.nodes.length;
    dgEl('dg-preview').innerHTML = `
        <p style="font-weight:bold;margin:0">Figure ${dgEsc(m.number || '')}</p>
        <p style="font-style:italic;margin:0 0 8px">${dgEsc(m.title || 'Figure title')}</p>
        <div style="max-width:100%;overflow-x:auto">${empty ? '<p style="color:#94a3b8">Add shapes to see your figure.</p>' : svg.replace(/width="[^"]+pt" height="[^"]+pt"/, 'style="max-width:100%;height:auto"')}</div>
        ${m.note && m.note.trim() ? `<p style="margin:8px 0 0"><i>Note.</i> ${dgEsc(m.note.trim())}</p>` : ''}`;
}

function dgRenderChecks() {
    const icons = { ok: '✓', warn: '!', info: 'i' };
    const tones = { ok: 'text-emerald-700', warn: 'text-amber-800', info: 'text-slate-600' };
    dgEl('dg-checks').innerHTML = dgChecks(dg.state).map(c => `<li class="flex gap-2 ${tones[c.level]}"><span class="font-bold w-3 shrink-0 text-center">${icons[c.level]}</span><span>${dgEsc(c.text)}</span></li>`).join('');
}

function dgRenderProps() {
    const host = dgEl('dg-props');
    const item = dgFind(dg.sel);
    const field = 'w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white';
    if (!item) {
        host.innerHTML = '<p class="text-xs text-slate-500">Select a shape or an arrow to edit it. Press <kbd class="bg-white border border-slate-200 px-1 rounded">Delete</kbd> to remove it and <kbd class="bg-white border border-slate-200 px-1 rounded">Ctrl/Cmd+Z</kbd> to undo.</p>';
        return;
    }
    if (dg.sel.kind === 'node') {
        const n = item;
        host.innerHTML = `
            <div class="space-y-3">
                <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-text">Text</label>
                    <textarea id="dg-prop-text" rows="3" class="${field}">${dgEsc(n.text)}</textarea></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-type">Shape</label>
                        <select id="dg-prop-type" class="${field}">${Object.entries(DG_SHAPES).map(([k, v]) => `<option value="${k}"${k === n.type ? ' selected' : ''}>${v.label}</option>`).join('')}</select></div>
                    <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-fill">Fill</label>
                        <select id="dg-prop-fill" class="${field}"><option value="white"${n.fill === 'white' ? ' selected' : ''}>White</option><option value="light"${n.fill === 'light' ? ' selected' : ''}>Light gray</option><option value="mid"${n.fill === 'mid' ? ' selected' : ''}>Gray</option></select></div>
                    <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-style">Outline</label>
                        <select id="dg-prop-style" class="${field}"><option value="solid"${dgLineStyle(n) === 'solid' ? ' selected' : ''}>Solid</option><option value="dashed"${dgLineStyle(n) === 'dashed' ? ' selected' : ''}>Dashed</option><option value="dotted"${dgLineStyle(n) === 'dotted' ? ' selected' : ''}>Dotted</option></select></div>
                    <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-w">Width (pt)</label><input id="dg-prop-w" type="number" min="40" max="${DG_W}" step="10" value="${Math.round(n.w)}" class="${field}"></div>
                    <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-h">Height (pt)</label><input id="dg-prop-h" type="number" min="24" max="${DG_H}" step="10" value="${Math.round(n.h)}" class="${field}"></div>
                </div>
                <div class="flex flex-wrap gap-4 text-xs text-slate-700">
                    <label class="flex items-center gap-1.5"><input id="dg-prop-bold" type="checkbox" ${n.bold ? 'checked' : ''}> Bold text</label>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" id="dg-prop-connect" class="text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">Draw arrow from here</button>
                    <button type="button" id="dg-prop-dup" class="text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">Duplicate</button>
                    <button type="button" id="dg-prop-del" class="text-xs font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 px-3 py-2 rounded-lg">Delete</button>
                </div>
            </div>`;
        const upd = fn => ev => { fn(ev.target); dgFitNode(n, dg.state.meta); dgRenderCanvas(); dgRenderPreview(); dgRenderChecks(); dgScheduleCommit(); };
        dgEl('dg-prop-text').addEventListener('input', upd(t => { n.text = t.value; }));
        dgEl('dg-prop-type').addEventListener('change', upd(t => { n.type = t.value; if (t.value === 'text') n.fill = 'white'; }));
        dgEl('dg-prop-fill').addEventListener('change', upd(t => { n.fill = t.value; }));
        dgEl('dg-prop-bold').addEventListener('change', upd(t => { n.bold = t.checked; }));
        dgEl('dg-prop-style').addEventListener('change', upd(t => { n.style = t.value; delete n.dashed; }));
        dgEl('dg-prop-w').addEventListener('change', upd(t => { n.w = Math.max(40, Math.min(DG_W - n.x, +t.value || n.w)); }));
        dgEl('dg-prop-h').addEventListener('change', upd(t => { n.h = Math.max(24, Math.min(DG_H - n.y, +t.value || n.h)); }));
        dgEl('dg-prop-connect').addEventListener('click', () => { dg.tool = 'connect'; dg.connectFrom = n.id; dgRenderToolbar(); dgRenderCanvas(); });
        dgEl('dg-prop-dup').addEventListener('click', dgDuplicateSelected);
        dgEl('dg-prop-del').addEventListener('click', dgDeleteSelected);
    } else {
        const e = item;
        host.innerHTML = `
            <div class="space-y-3">
                <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-label">Arrow label (optional)</label>
                    <input id="dg-prop-label" type="text" value="${dgEsc(e.label)}" placeholder="e.g. a, Yes, β = .32" class="${field}"></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-arrow">Arrowheads</label>
                        <select id="dg-prop-arrow" class="${field}"><option value="end"${e.arrow === 'end' ? ' selected' : ''}>One way</option><option value="both"${e.arrow === 'both' ? ' selected' : ''}>Both ways</option><option value="none"${e.arrow === 'none' ? ' selected' : ''}>None</option></select></div>
                    <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-route">Line</label>
                        <select id="dg-prop-route" class="${field}"><option value="straight"${e.route === 'straight' ? ' selected' : ''}>Straight</option><option value="elbow"${e.route === 'elbow' ? ' selected' : ''}>Elbow</option></select></div>
                </div>
                <div><label class="block text-xs font-semibold text-slate-600 mb-1" for="dg-prop-estyle">Line style</label>
                    <select id="dg-prop-estyle" class="${field}"><option value="solid"${dgLineStyle(e) === 'solid' ? ' selected' : ''}>Solid</option><option value="dashed"${dgLineStyle(e) === 'dashed' ? ' selected' : ''}>Dashed</option><option value="dotted"${dgLineStyle(e) === 'dotted' ? ' selected' : ''}>Dotted</option></select></div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" id="dg-prop-swap" class="text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">Reverse direction</button>
                    <button type="button" id="dg-prop-del" class="text-xs font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 px-3 py-2 rounded-lg">Delete</button>
                </div>
            </div>`;
        const upd = fn => ev => { fn(ev.target); dgRenderCanvas(); dgRenderPreview(); dgRenderChecks(); dgScheduleCommit(); };
        dgEl('dg-prop-label').addEventListener('input', upd(t => { e.label = t.value; }));
        dgEl('dg-prop-arrow').addEventListener('change', upd(t => { e.arrow = t.value; }));
        dgEl('dg-prop-route').addEventListener('change', upd(t => { e.route = t.value; }));
        dgEl('dg-prop-estyle').addEventListener('change', upd(t => { e.style = t.value; delete e.dashed; }));
        dgEl('dg-prop-swap').addEventListener('click', () => { [e.from, e.to] = [e.to, e.from]; dgCommit(); dgRenderCanvas(); dgRenderPreview(); });
        dgEl('dg-prop-del').addEventListener('click', dgDeleteSelected);
    }
}

// ── Export ─────────────────────────────────────────────────────────────
const dgSafeName = () => `APA_Figure_${String(dg.state.meta.number || '1').replace(/[^\w.-]+/g, '_')}`;

function dgRequireContent() {
    if (!dg.state.nodes.length) { showToast('Add a shape first.'); return false; }
    return true;
}

// Renders the figure (without caption) to PNG at about 300 dpi. Resolves to a Blob.
function dgPngBlob() {
    return new Promise((resolve, reject) => {
        const { prim, svg } = dgFigureSvg(dg.state);
        const s = dgExportScale(prim.bbox);
        const pxPerPt = 300 / 72;
        const w = Math.round(prim.bbox.w * s * pxPerPt), h = Math.round(prim.bbox.h * s * pxPerPt);
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svg.replace(/width="[^"]+pt" height="[^"]+pt"/, `width="${w}" height="${h}"`)], { type: 'image/svg+xml;charset=utf-8' }));
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not draw the figure.')); };
        img.src = url;
    });
}

async function dgExportPng() {
    if (!dgRequireContent()) return;
    try { downloadBlob(await dgPngBlob(), dgSafeName() + '.png'); showToast('PNG saved (300 dpi, figure only).'); }
    catch (e) { showToast(e.message); }
}

function dgExportSvg() {
    if (!dgRequireContent()) return;
    downloadBlob(new Blob([dgFigureSvg(dg.state).svg], { type: 'image/svg+xml' }), dgSafeName() + '.svg');
    showToast('SVG saved (figure only).');
}

function dgExportPdf() {
    if (!dgRequireContent()) return;
    downloadBlob(dgPdfBlob(dg.state), dgSafeName() + '.pdf');
    showToast('PDF saved: caption and figure on one APA page.');
}

async function dgExportWord() {
    if (!dgRequireContent()) return;
    let png = null;
    try { png = new Uint8Array(await (await dgPngBlob()).arrayBuffer()); } catch (e) { /* shapes still export without a fallback picture */ }
    downloadBlob(dgWordBlob(dg.state, png), dgSafeName() + '.docx');
    showToast('Word figure saved. Click it in Word to edit the shapes.');
}

function dgSaveJson() {
    downloadBlob(new Blob([JSON.stringify(dg.state, null, 2)], { type: 'application/json' }), dgSafeName() + '.diagram.json');
    showToast('Diagram project saved.');
}

function dgOpenFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    file.text().then(text => {
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('not a diagram');
        dg.state = dgNormalize({ ...dgNewState(), ...data, meta: { ...dgNewState().meta, ...data.meta } });
        dg.sel = null;
        dgCommit();
        dgSyncMetaInputs();
        dgRenderAll();
        showToast('Diagram opened.');
    }).catch(() => showToast('That file is not a diagram saved from this tool.'));
}
