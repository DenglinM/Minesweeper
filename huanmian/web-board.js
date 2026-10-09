// The cells are the existing page elements. This controller only adds public
// status badges and interaction; it never creates a second playable grid.
export function createWebBoard({ onAct, onInspect, onKey }) {
  let model = null;
  let selected = null;
  let frame = 0;
  const bindings = new Map();
  const attrs = ['role', 'tabindex', 'aria-label', 'aria-describedby', 'title', 'href', 'target'];
  const svg = document.getElementById('web-lines');
  const current = document.getElementById('web-current');
  const neighbors = document.getElementById('web-neighbors');
  const caption = document.getElementById('web-caption');

  function scheduleLines() {
    if (!model || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; drawLines(); });
  }
  function drawLines() {
    svg.replaceChildren();
    if (!model || !selected || document.querySelector('dialog[open]')) return;
    svg.setAttribute('viewBox', `0 0 ${document.documentElement.clientWidth} ${window.innerHeight}`);
    const origin = bindings.get(selected)?.el;
    if (!origin) return;
    const a = origin.getBoundingClientRect();
    for (const id of model.neighbors[selected] || []) {
      const el = bindings.get(id)?.el;
      if (!el) continue;
      const b = el.getBoundingClientRect();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.left + a.width / 2);
      line.setAttribute('y1', a.top + a.height / 2);
      line.setAttribute('x2', b.left + b.width / 2);
      line.setAttribute('y2', b.top + b.height / 2);
      svg.append(line);
    }
  }
  function stateText(cell) {
    if (cell.mine) return '已确认有雷';
    if (cell.opened) return `已确认安全，邻雷数 ${cell.clue}`;
    if (cell.mark) return '笔记：可能有雷';
    return '尚未调查';
  }
  function updateBadge(id) {
    const binding = bindings.get(id);
    const cell = model?.cells.find(c => c.id === id);
    if (!binding || !cell) return;
    const { el, badge } = binding;
    // Other renderers update the text of titles and rule paragraphs.
    if (!badge.isConnected) el.append(badge);
    const glyph = cell.mine ? '✳' : cell.opened ? String(cell.clue) : cell.mark ? '⚑' : '?';
    badge.textContent = `${String(cell.index + 1).padStart(2, '0')} · ${glyph}`;
    badge.setAttribute('aria-hidden', 'true');
    el.classList.toggle('web-opened', cell.opened);
    el.classList.toggle('web-mine', cell.mine);
    el.classList.toggle('web-marked', !!cell.mark);
    el.classList.toggle('web-hint', model.hintCells.includes(id));
    const originalText = [...el.childNodes].filter(node => node !== badge).map(node => node.textContent).join(' ').replace(/\s+/g, ' ').trim();
    el.setAttribute('aria-label', `网页节点 ${cell.index + 1}，${cell.label}，${stateText(cell)}。原文：${originalText}`);
    el.setAttribute('title', `${cell.label} · ${stateText(cell)} · 点击${model.tool === 'mark' ? '记笔记' : '调查'}；右键/F 标记`);
  }
  function inspect(id, notify = true) {
    if (!model) return;
    const cell = model.cells.find(c => c.id === id);
    if (!cell) return;
    selected = id;
    const ids = model.neighbors[id] || [];
    for (const [other, binding] of bindings) {
      binding.el.classList.toggle('web-selected', other === id);
      binding.el.classList.toggle('web-neighbor', ids.includes(other));
    }
    current.textContent = `${String(cell.index + 1).padStart(2, '0')} ${cell.label} · ${stateText(cell)}`;
    const safe = ids.filter(n => model.cells.find(c => c.id === n)?.opened).length;
    const mines = ids.filter(n => model.cells.find(c => c.id === n)?.mine).length;
    caption.textContent = `邻居 ${ids.length} 个 · 已确认安全 ${safe} 个 · 已确认雷 ${mines} 个。下方名称只定位邻居，不会打开它们。`;
    neighbors.replaceChildren();
    for (const neighborId of ids) {
      const other = model.cells.find(c => c.id === neighborId);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${String(other.index + 1).padStart(2, '0')} ${other.label}`;
      button.setAttribute('aria-label', `定位邻居：${other.label}`);
      button.addEventListener('click', () => locate(neighborId));
      neighbors.append(button);
    }
    if (notify) onInspect(id);
    scheduleLines();
  }
  function locate(id) {
    const el = bindings.get(id)?.el;
    if (!el) return;
    el.scrollIntoView({ behavior: 'auto', block: 'center' });
    el.focus({ preventScroll: true });
    inspect(id);
  }
  function bind(cell) {
    const el = document.getElementById(cell.domId);
    if (!el) throw new Error(`Missing page node: ${cell.domId}`);
    if (bindings.has(cell.id)) return;
    const original = Object.fromEntries(attrs.map(a => [a, el.getAttribute(a)]));
    const badge = document.createElement('span');
    badge.className = 'web-cell-badge';
    const click = event => {
      if (!model) return;
      event.preventDefault(); event.stopImmediatePropagation();
      onAct(cell.id, model.tool === 'mark' ? 'mark' : 'reveal');
    };
    const contextmenu = event => {
      if (!model) return;
      event.preventDefault(); event.stopImmediatePropagation(); onAct(cell.id, 'mark');
    };
    const keydown = event => {
      if (!model) return;
      if (['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.key.toLowerCase() === 'f') {
        event.preventDefault(); event.stopImmediatePropagation(); onKey(event, cell.id);
      }
    };
    const hover = () => inspect(cell.id);
    el.addEventListener('click', click, true);
    el.addEventListener('contextmenu', contextmenu, true);
    el.addEventListener('keydown', keydown, true);
    el.addEventListener('mouseenter', hover);
    el.addEventListener('focus', hover);
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-describedby', 'web-instructions');
    // In exploration mode these real navigation elements are cells. Remove the
    // native link target too, so middle-click cannot unexpectedly leave a puzzle.
    if (el.tagName === 'A') { el.removeAttribute('href'); el.removeAttribute('target'); }
    el.classList.add('web-cell');
    el.dataset.webNode = cell.id;
    bindings.set(cell.id, { el, badge, original, click, contextmenu, keydown, hover });
  }
  function show(next) {
    const entering = !model;
    model = next;
    document.body.classList.add('web-mode');
    const skip = document.querySelector('.skip-link');
    skip.href = '#web-session';
    skip.textContent = '跳到网页探索工具';
    for (const cell of model.cells) { bind(cell); updateBadge(cell.id); }
    document.getElementById('web-session').hidden = false;
    document.getElementById('web-progress').textContent = `${model.opened} / ${model.total} 安全 · ${model.mistakes} 误判`;
    document.getElementById('web-tool').textContent = model.tool === 'mark' ? '当前：标雷笔记' : '当前：调查元素';
    for (const name of ['open', 'mark']) {
      const active = model.tool === name;
      document.getElementById(`web-${name}`).setAttribute('aria-pressed', String(active));
    }
    document.getElementById('web-status').textContent = document.getElementById('message').textContent;
    if (next.selected && bindings.has(next.selected)) selected = next.selected;
    if (entering) selected = model.cells.find(c => c.opened)?.id || model.cells[0].id;
    inspect(selected, false);
  }
  function hide() {
    if (!model) return;
    model = null; selected = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    for (const { el, badge, original, click, contextmenu, keydown, hover } of bindings.values()) {
      el.removeEventListener('click', click, true);
      el.removeEventListener('contextmenu', contextmenu, true);
      el.removeEventListener('keydown', keydown, true);
      el.removeEventListener('mouseenter', hover);
      el.removeEventListener('focus', hover);
      for (const a of attrs) original[a] === null ? el.removeAttribute(a) : el.setAttribute(a, original[a]);
      el.classList.remove('web-cell', 'web-opened', 'web-mine', 'web-marked', 'web-hint', 'web-selected', 'web-neighbor');
      delete el.dataset.webNode;
      badge.remove();
    }
    bindings.clear(); svg.replaceChildren();
    document.body.classList.remove('web-mode');
    const skip = document.querySelector('.skip-link');
    skip.href = '#board';
    skip.textContent = '跳到棋盘';
    document.getElementById('web-session').hidden = true;
  }
  window.addEventListener('resize', scheduleLines);
  window.addEventListener('scroll', scheduleLines, { passive: true });
  document.addEventListener('toggle', scheduleLines, true);
  const dialogObserver = new MutationObserver(scheduleLines);
  document.querySelectorAll('dialog').forEach(dialog => dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  return { show, hide, inspect, locate, focus: id => bindings.get(id)?.el.focus({ preventScroll: true }), status: text => { if (model) document.getElementById('web-status').textContent = text; } };
}
