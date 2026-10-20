/* Renders a screen written in the Stackroost canvas markup (x-import tags) with the real components. */
(function () {
  var S = window.Stackroost;
  var h = React.createElement;
  var key = 0;
  var VOID = { img: 1, br: 1, hr: 1, input: 1, meta: 1, link: 1 };

  function camel(s) {
    return s.replace(/-([a-z])/g, function (_, c) {
      return c.toUpperCase();
    });
  }
  function styleObj(str) {
    var o = {};
    str.split(';').forEach(function (d) {
      var i = d.indexOf(':');
      if (i < 0) return;
      var k = d.slice(0, i).trim(),
        v = d.slice(i + 1).trim();
      if (k) o[k.indexOf('--') === 0 ? k : camel(k)] = v;
    });
    return o;
  }
  function val(v, V) {
    var m = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(v);
    if (!m) return v;
    return m[1].split('.').reduce(function (a, k) {
      return a == null ? a : a[k];
    }, V);
  }
  function conv(node, V) {
    if (node.nodeType === 3) return /^\s*$/.test(node.nodeValue) ? null : node.nodeValue;
    if (node.nodeType !== 1) return null;
    var tag = node.tagName.toLowerCase();
    var kids = [];
    node.childNodes.forEach(function (c) {
      var r = conv(c, V);
      if (r != null) kids.push(r);
    });
    if (tag === 'x-import') {
      var name = (node.getAttribute('component-from-global-scope') || '').replace(
        /^Stackroost\./,
        '',
      );
      var props = { key: key++ },
        wrap = null;
      Array.prototype.forEach.call(node.attributes, function (a) {
        if (a.name === 'component-from-global-scope') return;
        if (a.name === 'style') {
          wrap = styleObj(a.value);
          return;
        }
        var k = /^(aria|data)-/.test(a.name) ? a.name : camel(a.name);
        props[k] = val(a.value, V);
      });
      var el = S[name] ? h.apply(null, [S[name], props].concat(kids)) : null;
      return wrap ? h('div', { key: key++, style: wrap }, el) : el;
    }
    var p = { key: key++ };
    Array.prototype.forEach.call(node.attributes, function (a) {
      if (a.name === 'class') p.className = a.value;
      else if (a.name === 'style') p.style = styleObj(a.value);
      else if (a.name === 'for') p.htmlFor = a.value;
      else p[a.name] = val(a.value, V);
    });
    return VOID[tag] ? h(tag, p) : h.apply(null, [tag, p].concat(kids));
  }
  window.renderScreen = function (V) {
    var nodes = [];
    document.getElementById('src').content.childNodes.forEach(function (c) {
      var r = conv(c, V);
      if (r != null) nodes.push(r);
    });
    ReactDOM.createRoot(document.getElementById('root')).render(h(React.Fragment, null, nodes));
  };
})();
