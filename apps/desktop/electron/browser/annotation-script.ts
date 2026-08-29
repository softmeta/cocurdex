// This script is injected into the page via WebContents.executeJavaScript.
// It runs in the page's main world and has full DOM access.
export function getAnnotationScript(): string {
  return `(function() {
  if (window.__annotationScriptLoaded) return;
  window.__annotationScriptLoaded = true;

  var bridge = window.__annotationBridge__;
  if (!bridge) return;

  var enabled = false;
  var overlay = null;
  var highlight = null;
  var dragBox = null;
  var dragStartX = 0;
  var dragStartY = 0;
  var isDragging = false;

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
        if (siblings.length > 1) {
          var index = siblings.indexOf(current) + 1;
          tag += ':nth-child(' + index + ')';
        }
      }
      path.unshift(tag);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = '__annotation_overlay__';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;';
    document.body.appendChild(overlay);
  }

  function createHighlight() {
    if (highlight) return;
    highlight = document.createElement('div');
    highlight.id = '__annotation_highlight__';
    highlight.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.08);border-radius:2px;display:none;';
    overlay.appendChild(highlight);
  }

  function showHighlight(rect) {
    if (!highlight) return;
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
  }

  function hideHighlight() {
    if (highlight) highlight.style.display = 'none';
  }

  function handleMouseMove(e) {
    if (!enabled) return;
    if (isDragging) {
      updateDragBox(e);
      return;
    }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === highlight || el === dragBox) return;
    var rect = el.getBoundingClientRect();
    showHighlight(rect);
  }

  function handleClick(e) {
    if (!enabled) return;
    if (isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === highlight || el === dragBox) return;
    var rect = el.getBoundingClientRect();
    var annotation = {
      id: crypto.randomUUID(),
      type: 'element',
      selector: generateSelector(el),
      tagName: el.tagName ? el.tagName.toLowerCase() : undefined,
      textContent: (el.textContent || '').trim().slice(0, 200) || undefined,
      boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
      pageUrl: window.location.href,
      capturedAt: new Date().toISOString()
    };
    bridge.sendAnnotation(annotation);
  }

  function handleMouseDown(e) {
    if (!enabled) return;
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    createDragBox();
    updateDragBox(e);
  }

  function handleMouseUp(e) {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
    var rect = dragBox.getBoundingClientRect();
    var annotation = {
      id: crypto.randomUUID(),
      type: 'region',
      boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
      pageUrl: window.location.href,
      capturedAt: new Date().toISOString()
    };
    bridge.sendAnnotation(annotation);
    removeDragBox();
  }

  function createDragBox() {
    if (dragBox) return;
    dragBox = document.createElement('div');
    dragBox.id = '__annotation_dragbox__';
    dragBox.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px dashed #f59e0b;background:rgba(245,158,11,0.1);border-radius:2px;display:none;';
    overlay.appendChild(dragBox);
  }

  function updateDragBox(e) {
    if (!dragBox) return;
    dragBox.style.display = 'block';
    var x = Math.min(e.clientX, dragStartX);
    var y = Math.min(e.clientY, dragStartY);
    var w = Math.abs(e.clientX - dragStartX);
    var h = Math.abs(e.clientY - dragStartY);
    dragBox.style.left = x + 'px';
    dragBox.style.top = y + 'px';
    dragBox.style.width = w + 'px';
    dragBox.style.height = h + 'px';
  }

  function removeDragBox() {
    if (dragBox) {
      dragBox.remove();
      dragBox = null;
    }
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    createOverlay();
    createHighlight();
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    hideHighlight();
    removeDragBox();
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('mousedown', handleMouseDown, true);
    document.removeEventListener('mouseup', handleMouseUp, true);
  }

  bridge.onToggle(function(next) {
    if (next) {
      enable();
    } else {
      disable();
    }
  });
})();`;
}
