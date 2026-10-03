// This script is injected into the page via WebContents.executeJavaScript.
// It runs in the page's main world and has full DOM access.
export function getAnnotationScript(): string {
  return `(function() {
  if (window.__annotationScriptLoaded) return;
  window.__annotationScriptLoaded = true;

  var bridge = window.__annotationBridge__;
  if (!bridge) return;

  var isMac = /Mac/.test(navigator.platform);
  var enabled = false;
  var host = null;
  var root = null;
  var layer = null;
  var highlight = null;
  var selection = null;
  var dragBox = null;
  var popover = null;
  var popoverMoved = false;
  var pending = null;
  var markers = {};
  var markerOrder = [];
  var dragStartX = 0;
  var dragStartY = 0;
  var isDragging = false;
  var skipClick = false;
  var bar = null;
  var barLabel = null;
  var barSend = null;
  var barClear = null;

  var STYLE = [
    ':host{all:initial}',
    '.layer{position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '.box{position:fixed;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.08);border-radius:3px;box-sizing:border-box;z-index:2147483646}',
    '.box.drag{border-style:dashed}',
    '.mark{position:absolute;pointer-events:none;border:1.5px solid rgba(59,130,246,0.7);border-radius:3px;box-sizing:border-box}',
    '.badge{position:absolute;top:-10px;left:-10px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:10px;background:#3b82f6;color:#fff;font-weight:600;font-size:11px;line-height:20px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.3)}',
    '.pop{position:fixed;z-index:2147483647;pointer-events:auto;width:300px;box-sizing:border-box;padding:8px;cursor:move;border-radius:10px;background:#fff;color:#111;border:1px solid rgba(0,0,0,0.12);box-shadow:0 8px 24px rgba(0,0,0,0.18)}',
    '.pop textarea{display:block;flex:1;width:100%;min-height:56px;max-height:160px;box-sizing:border-box;resize:none;border:0;outline:0;background:transparent;color:inherit;font:inherit}',
    '.row{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:6px}',
    '.row button{font:inherit;font-size:12px;border-radius:6px;padding:3px 8px;cursor:pointer;border:1px solid rgba(0,0,0,0.12);background:#fff;color:#111}',
    '.row button.primary{background:#111;color:#fff;border-color:#111}',
    '.head{display:flex;gap:6px;align-items:flex-start}',
    '.tog{flex:none;width:28px;height:28px;padding:0;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.tog.on{background:rgba(59,130,246,0.15);border-color:#3b82f6;color:#3b82f6}',
    '.tog:disabled{opacity:0.35;cursor:default}',
    '.panel{margin-top:6px;padding-top:6px;border-top:1px solid rgba(127,127,127,0.25);max-height:240px;overflow:auto;display:grid;grid-template-columns:1fr 120px;gap:6px 8px;align-items:center;font-size:12px}',
    '.panel .tag{grid-column:1/-1;font-family:ui-monospace,SFMono-Regular,monospace;opacity:0.7}',
    '.panel input,.panel select{font:inherit;font-size:12px;width:100%;box-sizing:border-box;padding:3px 6px;border-radius:6px;border:1px solid rgba(127,127,127,0.35);background:transparent;color:inherit}',
    '.panel input[type=color]{padding:1px 2px;height:24px;cursor:pointer}',
    '.field{display:flex;gap:4px;align-items:center}',
    '.field span{opacity:0.6}',
    '.hint{margin-right:auto;font-size:11px;opacity:0.55}',
    '.bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;pointer-events:auto;display:flex;align-items:center;gap:4px;padding:6px 6px 6px 14px;border-radius:12px;background:#1f1f22;color:#eee;box-shadow:0 8px 24px rgba(0,0,0,0.25);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap}',
    '.bar .label{margin-right:8px}',
    '.bar button{font:inherit;border:0;border-radius:8px;padding:5px 10px;cursor:pointer;background:transparent;color:#eee}',
    '.bar button:hover:not(:disabled){background:rgba(255,255,255,0.1)}',
    '.bar button:disabled{opacity:0.4;cursor:default}',
    '.bar button.send{background:#3b82f6;color:#fff}',
    '.bar button.send:hover:not(:disabled){background:#2563eb}',
    '@media (prefers-color-scheme: dark){.pop{background:#1f1f22;color:#eee;border-color:rgba(255,255,255,0.14)}.row button{background:#2a2a2e;color:#eee;border-color:rgba(255,255,255,0.14)}.row button.primary{background:#eee;color:#111;border-color:#eee}}'
  ].join('');

  function mount() {
    if (host && host.isConnected) return;
    host = document.createElement('cocurdex-annotations');
    root = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = STYLE;
    layer = document.createElement('div');
    layer.className = 'layer';
    root.appendChild(style);
    root.appendChild(layer);
    document.documentElement.appendChild(host);
    for (var i = 0; i < markerOrder.length; i++) layer.appendChild(markers[markerOrder[i]].node);
  }

  function isOwn(e) {
    return host && e.composedPath().indexOf(host) !== -1;
  }

  function place(node, rect) {
    node.style.left = rect.left + 'px';
    node.style.top = rect.top + 'px';
    node.style.width = rect.width + 'px';
    node.style.height = rect.height + 'px';
  }

  function box(extra) {
    var node = document.createElement('div');
    node.className = 'box' + (extra ? ' ' + extra : '');
    root.appendChild(node);
    return node;
  }

  function removeNode(node) {
    if (node) node.remove();
    return null;
  }

  function generateSelector(el) {
    if (el.id) return '#' + el.id;
    var path = [];
    var current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      var tag = current.tagName.toLowerCase();
      if (current.id) {
        path.unshift('#' + current.id);
        break;
      }
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
        if (siblings.length > 1) tag += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      path.unshift(tag);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  function currentRect() {
    if (!pending) return null;
    if (pending.element) return pending.element.getBoundingClientRect();
    return {
      left: pending.page.left - window.scrollX,
      top: pending.page.top - window.scrollY,
      width: pending.page.width,
      height: pending.page.height
    };
  }

  var STYLE_FIELDS = [
    { prop: 'color', label: 'Text color', kind: 'color' },
    { prop: 'background-color', label: 'Background', kind: 'color' },
    { prop: 'opacity', label: 'Opacity', kind: 'number', step: '0.05', min: '0', max: '1' },
    { prop: 'font-size', label: 'Font size', kind: 'px' },
    { prop: 'font-weight', label: 'Font weight', kind: 'select', options: ['100', '200', '300', '400', '500', '600', '700', '800', '900'] },
    { prop: 'line-height', label: 'Line height', kind: 'px' },
    { prop: 'letter-spacing', label: 'Letter spacing', kind: 'px' },
    { prop: 'border-radius', label: 'Border radius', kind: 'px' }
  ];
  var SLIDERS_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>';
  var previews = {};

  function toHex(value) {
    var m = String(value).match(/\\d+(\\.\\d+)?/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(function(n) {
      var h = Math.round(Number(n)).toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  }

  function previewStyle(preview, prop, value) {
    var el = preview.el;
    if (!(prop in preview.originals)) {
      preview.originals[prop] = { value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) };
    }
    if (!(prop in preview.changes)) {
      preview.changes[prop] = { from: getComputedStyle(el).getPropertyValue(prop), to: value };
    }
    preview.changes[prop].to = value;
    el.style.setProperty(prop, value, 'important');
    if (selection) place(selection, el.getBoundingClientRect());
  }

  function restorePreview(preview) {
    if (!preview) return;
    for (var prop in preview.originals) {
      var original = preview.originals[prop];
      if (original.value) preview.el.style.setProperty(prop, original.value, original.priority);
      else preview.el.style.removeProperty(prop);
    }
  }

  function styleChanges(preview) {
    if (!preview) return [];
    var list = [];
    for (var prop in preview.changes) {
      var change = preview.changes[prop];
      if (change.from.trim() !== change.to.trim()) list.push({ property: prop, from: change.from.trim(), to: change.to.trim() });
    }
    return list;
  }

  function buildPanel(preview) {
    var panel = document.createElement('div');
    panel.className = 'panel';
    var tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = '<' + preview.el.tagName.toLowerCase() + '>';
    panel.appendChild(tag);
    var computed = getComputedStyle(preview.el);
    STYLE_FIELDS.forEach(function(field) {
      var label = document.createElement('label');
      label.textContent = field.label;
      var current = computed.getPropertyValue(field.prop);
      var control;
      if (field.kind === 'color') {
        control = document.createElement('input');
        control.type = 'color';
        control.value = toHex(current);
        control.title = current;
        control.addEventListener('input', function() { previewStyle(preview, field.prop, control.value); });
      } else if (field.kind === 'select') {
        control = document.createElement('select');
        field.options.forEach(function(option) {
          var node = document.createElement('option');
          node.value = option;
          node.textContent = option;
          control.appendChild(node);
        });
        control.value = String(current);
        control.addEventListener('change', function() { previewStyle(preview, field.prop, control.value); });
      } else {
        control = document.createElement('div');
        control.className = 'field';
        var input = document.createElement('input');
        input.type = 'number';
        var parsed = parseFloat(current);
        input.value = isNaN(parsed) ? '' : String(Math.round(parsed * 100) / 100);
        input.placeholder = current;
        if (field.step) input.step = field.step;
        if (field.min) input.min = field.min;
        if (field.max) input.max = field.max;
        input.addEventListener('input', function() {
          if (input.value === '') return;
          previewStyle(preview, field.prop, field.kind === 'px' ? input.value + 'px' : input.value);
        });
        control.appendChild(input);
        if (field.kind === 'px') {
          var unit = document.createElement('span');
          unit.textContent = 'px';
          control.appendChild(unit);
        }
      }
      panel.appendChild(label);
      panel.appendChild(control);
    });
    return panel;
  }

  function clampPopover(left, top) {
    var maxLeft = window.innerWidth - popover.offsetWidth - 8;
    var maxTop = window.innerHeight - popover.offsetHeight - 8;
    popover.style.left = Math.max(8, Math.min(left, maxLeft)) + 'px';
    popover.style.top = Math.max(8, Math.min(top, maxTop)) + 'px';
  }

  function enablePopoverDrag() {
    popover.addEventListener('pointerdown', function(e) {
      if (e.button !== 0 || e.target.closest('textarea,input,select,button')) return;
      e.preventDefault();
      var node = popover;
      var offsetX = e.clientX - node.offsetLeft;
      var offsetY = e.clientY - node.offsetTop;
      node.setPointerCapture(e.pointerId);
      function move(ev) {
        popoverMoved = true;
        clampPopover(ev.clientX - offsetX, ev.clientY - offsetY);
      }
      function end() {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', end);
        node.removeEventListener('pointercancel', end);
      }
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
    });
  }

  function positionPopover() {
    if (!popover || !pending) return;
    if (popoverMoved) {
      clampPopover(popover.offsetLeft, popover.offsetTop);
      return;
    }
    var rect = currentRect();
    var height = popover.offsetHeight;
    var top = rect.top + rect.height + 8;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 8;
    if (top < 8) top = Math.max(8, window.innerHeight - height - 8);
    var left = Math.min(Math.max(8, rect.left), window.innerWidth - popover.offsetWidth - 8);
    popover.style.top = top + 'px';
    popover.style.left = Math.max(8, left) + 'px';
  }

  function openPopover(target) {
    closePopover();
    pending = target;
    if (target.element) pending.preview = { el: target.element, originals: {}, changes: {} };
    var rect = currentRect();
    selection = box();
    place(selection, rect);
    popover = document.createElement('div');
    popover.className = 'pop';
    var head = document.createElement('div');
    head.className = 'head';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tog';
    toggle.title = 'Adjust styles';
    toggle.innerHTML = SLIDERS_ICON;
    toggle.disabled = !target.element;
    var input = document.createElement('textarea');
    input.placeholder = 'Describe the change…';
    head.appendChild(toggle);
    head.appendChild(input);
    var panel = null;
    var row = document.createElement('div');
    row.className = 'row';
    var hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = '↵ save · ' + (isMac ? '⌘↵' : 'Ctrl+↵') + ' send';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'primary';
    save.textContent = 'Save';
    row.appendChild(hint);
    row.appendChild(cancel);
    row.appendChild(save);
    popover.appendChild(head);
    popover.appendChild(row);
    root.appendChild(popover);
    positionPopover();
    enablePopoverDrag();
    toggle.addEventListener('click', function() {
      if (panel) {
        panel = removeNode(panel);
        toggle.classList.remove('on');
      } else {
        panel = buildPanel(pending.preview);
        popover.insertBefore(panel, row);
        toggle.classList.add('on');
      }
      positionPopover();
    });
    cancel.addEventListener('click', function() { closePopover(); });
    save.addEventListener('click', function() { commit(input.value, false); });
    ['keydown', 'keyup', 'keypress'].forEach(function(type) {
      popover.addEventListener(type, function(e) { if (e.key !== 'Escape') e.stopPropagation(); });
    });
    input.addEventListener('keydown', function(e) {
      if (e.isComposing) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit(input.value, true);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit(input.value, false);
      }
    });
    setTimeout(function() { input.focus(); }, 0);
  }

  function closePopover(keepPreview) {
    if (pending && !keepPreview) restorePreview(pending.preview);
    popover = removeNode(popover);
    popoverMoved = false;
    selection = removeNode(selection);
    pending = null;
  }

  function addMarker(id, rect) {
    var node = document.createElement('div');
    node.className = 'mark';
    node.style.left = rect.left + window.scrollX + 'px';
    node.style.top = rect.top + window.scrollY + 'px';
    node.style.width = rect.width + 'px';
    node.style.height = rect.height + 'px';
    var badge = document.createElement('div');
    badge.className = 'badge';
    node.appendChild(badge);
    layer.appendChild(node);
    markers[id] = { node: node, badge: badge };
    markerOrder.push(id);
    renumber();
  }

  function renumber() {
    for (var i = 0; i < markerOrder.length; i++) markers[markerOrder[i]].badge.textContent = String(i + 1);
    updateBar();
  }

  function commit(note, submit) {
    if (!pending) return;
    var target = pending;
    var rect = currentRect();
    closePopover(true);
    var id = crypto.randomUUID();
    if (target.preview) previews[id] = target.preview;
    addMarker(id, rect);
    var annotation = {
      id: id,
      type: target.element ? 'element' : 'region',
      boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
      pageUrl: window.location.href,
      capturedAt: new Date().toISOString()
    };
    var text = note.trim();
    if (text) annotation.note = text;
    var changes = styleChanges(target.preview);
    if (changes.length) annotation.styleChanges = changes;
    if (target.element) {
      annotation.selector = generateSelector(target.element);
      annotation.tagName = target.element.tagName.toLowerCase();
      var content = (target.element.innerText || target.element.textContent || '').trim().replace(/\\s+/g, ' ');
      if (content) annotation.textContent = content.slice(0, 200);
    }
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { bridge.sendAnnotation(annotation, submit); });
    });
  }

  function syncMarkers(ids) {
    var keep = {};
    for (var i = 0; i < ids.length; i++) keep[ids[i]] = true;
    markerOrder = markerOrder.filter(function(id) {
      if (keep[id]) return true;
      restorePreview(previews[id]);
      delete previews[id];
      markers[id].node.remove();
      delete markers[id];
      return false;
    });
    markerOrder.sort(function(a, b) { return ids.indexOf(a) - ids.indexOf(b); });
    renumber();
  }

  function handleMouseMove(e) {
    if (isDragging) {
      updateDragBox(e);
      return;
    }
    if (popover || isOwn(e)) {
      highlight = removeNode(highlight);
      return;
    }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) return;
    if (!highlight) highlight = box();
    place(highlight, el.getBoundingClientRect());
  }

  function swallow(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleClick(e) {
    if (isOwn(e)) return;
    swallow(e);
    if (popover) {
      closePopover();
      return;
    }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) return;
    highlight = removeNode(highlight);
    openPopover({ element: el });
  }

  function handleMouseDown(e) {
    if (isOwn(e)) return;
    swallow(e);
    skipClick = false;
    if (!e.shiftKey || popover) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    highlight = removeNode(highlight);
    dragBox = box('drag');
    updateDragBox(e);
  }

  function dragRect(e) {
    return {
      left: Math.min(e.clientX, dragStartX),
      top: Math.min(e.clientY, dragStartY),
      width: Math.abs(e.clientX - dragStartX),
      height: Math.abs(e.clientY - dragStartY)
    };
  }

  function updateDragBox(e) {
    if (dragBox) place(dragBox, dragRect(e));
  }

  function handleMouseUp(e) {
    if (isOwn(e)) return;
    swallow(e);
    if (!isDragging) return;
    isDragging = false;
    var rect = dragRect(e);
    dragBox = removeNode(dragBox);
    if (rect.width < 4 || rect.height < 4) return;
    openPopover({
      page: { left: rect.left + window.scrollX, top: rect.top + window.scrollY, width: rect.width, height: rect.height }
    });
    skipClick = true;
  }

  function handleClickAfterDrag(e) {
    if (skipClick && !isOwn(e)) {
      swallow(e);
      skipClick = false;
      return;
    }
    handleClick(e);
  }

  function handleKeyDown(e) {
    if (e.key !== 'Escape') return;
    swallow(e);
    if (popover) closePopover();
    else bridge.sendAction('exit');
  }

  function mountBar() {
    if (bar) return;
    bar = document.createElement('div');
    bar.className = 'bar';
    barLabel = document.createElement('span');
    barLabel.className = 'label';
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear';
    barSend = document.createElement('button');
    barSend.type = 'button';
    barSend.className = 'send';
    barSend.textContent = 'Send';
    var exit = document.createElement('button');
    exit.type = 'button';
    exit.textContent = '✕';
    exit.title = 'Exit annotation mode';
    clear.addEventListener('click', function() { bridge.sendAction('clear'); });
    barSend.addEventListener('click', function() { bridge.sendAction('send'); });
    exit.addEventListener('click', function() { bridge.sendAction('exit'); });
    bar.appendChild(barLabel);
    bar.appendChild(clear);
    bar.appendChild(barSend);
    bar.appendChild(exit);
    barClear = clear;
    root.appendChild(bar);
    updateBar();
  }

  function updateBar() {
    if (!bar) return;
    var count = markerOrder.length;
    barLabel.textContent = count ? 'Annotating · ' + count : 'Click an element or shift-drag an area';
    barSend.disabled = count === 0;
    barClear.disabled = count === 0;
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    mount();
    mountBar();
    document.documentElement.style.cursor = 'crosshair';
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClickAfterDrag, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    closePopover();
    bar = removeNode(bar);
    highlight = removeNode(highlight);
    dragBox = removeNode(dragBox);
    isDragging = false;
    document.documentElement.style.cursor = '';
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClickAfterDrag, true);
    document.removeEventListener('mousedown', handleMouseDown, true);
    document.removeEventListener('mouseup', handleMouseUp, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  }

  bridge.onToggle(function(next) {
    if (next) enable();
    else disable();
  });
  bridge.onMarkers(syncMarkers);
})();`;
}
