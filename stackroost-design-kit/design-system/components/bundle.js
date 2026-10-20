/* @ds-bundle: {"format":4,"namespace":"Stackroost","components":[{"name":"Logo"},{"name":"Mark"},{"name":"Icon"},{"name":"Button"},{"name":"Badge"},{"name":"EnvBadge"},{"name":"Panel"},{"name":"Metric"},{"name":"Sparkline"},{"name":"Progress"},{"name":"Segmented"},{"name":"Switch"},{"name":"Input"},{"name":"SearchField"},{"name":"NavRail"},{"name":"ListRow"},{"name":"DialogSurface"},{"name":"Menu"},{"name":"Tooltip"},{"name":"CommandDial"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) out.push(arguments[i]);
    return out.join(' ');
  }
  function omit(p, keys) {
    var o = {};
    for (var k in p)
      if (Object.prototype.hasOwnProperty.call(p, k) && keys.indexOf(k) < 0) o[k] = p[k];
    return o;
  }
  function useMaybeControlled(value, defaultValue, onChange) {
    var st = React.useState(defaultValue);
    var controlled = value !== undefined;
    var current = controlled ? value : st[0];
    function set(v) {
      if (!controlled) st[1](v);
      if (onChange) onChange(v);
    }
    return [current, set];
  }

  /* Icons: a lucide-style subset (24 grid, 1.75 stroke) so previews need no package.
     In the app use lucide-react; the names map 1:1 in the README. */
  var PATHS = {
    home: ['M3 11 12 4l9 7', 'M5.5 9.5V20h13V9.5'],
    activity: ['M3 12h4l3-7 4 14 3-7h4'],
    package: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5 12 12l8-4.5', 'M12 12v9'],
    clock: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 7.5V12l3 2'],
    plug: ['M7 9h10v4a5 5 0 0 1-10 0z', 'M9.5 9V5', 'M14.5 9V5', 'M12 18v3'],
    server: [
      'M5 4h14a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 19 11H5a1.5 1.5 0 0 1-1.5-1.5v-4A1.5 1.5 0 0 1 5 4z',
      'M5 13h14a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-4A1.5 1.5 0 0 1 5 13z',
      'M7.5 7.5h.01',
      'M7.5 16.5h.01',
    ],
    terminal: [
      'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
      'M7 9.5l3 2.5-3 2.5',
      'M12.5 15H17',
    ],
    shield: ['M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z', 'M12 9v6', 'M9 12h6'],
    drive: [
      'M5 13l2.5-8h9l2.5 8',
      'M5 13h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z',
      'M16.5 16.5h.01',
    ],
    cpu: [
      'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
      'M10 10h4v4h-4z',
      'M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3',
    ],
    message: ['M4 5h16v11H9l-5 4z', 'M8 9h8', 'M8 12h5'],
    settings: [
      'M4 7h10',
      'M18 7h2',
      'M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
      'M4 17h4',
      'M12 17h8',
      'M10 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    ],
    search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4'],
    bell: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
    plus: ['M12 5v14', 'M5 12h14'],
    chevron: ['M9 6l6 6-6 6'],
    play: ['M8 5.5v13l10-6.5z'],
    stop: ['M7 7h10v10H7z'],
    restart: ['M4 12a8 8 0 1 0 2.5-5.8', 'M4 4v4h4'],
    x: ['M6 6l12 12', 'M18 6 6 18'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    containers: [
      'M3 11h5v5H3z',
      'M9.5 11h5v5h-5z',
      'M16 11h5v5h-5z',
      'M9.5 4.5h5v5h-5z',
      'M3 19.5h18',
    ],
    database: [
      'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z',
      'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
      'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    ],
    globe: [
      'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
      'M3 12h18',
      'M12 3c3 3.5 3 14.5 0 18',
      'M12 3c-3 3.5-3 14.5 0 18',
    ],
    key: ['M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M11 12l8-8', 'M16 7l2 2', 'M14 9l2 2'],
    zap: ['M13 2 5 14h6l-1 8 8-12h-6z'],
    tunnel: ['M5 19v-7a7 7 0 0 1 14 0v7', 'M9 19v-6a3 3 0 0 1 6 0v6', 'M3 19h18'],
    sparkles: [
      'M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z',
      'M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
    ],
    command: ['M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z'],
    more: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
    cloud: ['M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11.5 3.3 3.3 0 0 0 7 18z'],
    folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
    menu: ['M5 8h14', 'M5 12h14', 'M5 16h14'],
    upload: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4'],
  };

  function Icon(p) {
    var size = p.size || 20;
    var d = PATHS[p.name] || PATHS.more;
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: p.strokeWidth || 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className: p.className,
        role: p.label ? 'img' : undefined,
        'aria-label': p.label,
        'aria-hidden': p.label ? undefined : 'true',
        focusable: 'false',
      },
      d.map(function (x, i) {
        return h('path', { key: i, d: x });
      }),
    );
  }

  function Mark(p) {
    var size = p.size || 32;
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 120 120',
        className: cx('sr-mark', p.className),
        role: 'img',
        'aria-label': p.label || 'Stackroost',
      },
      h('rect', {
        className: 'sr-mark__pill',
        x: 16,
        y: 80,
        width: 88,
        height: 18,
        rx: 9,
        opacity: 0.45,
      }),
      h('rect', {
        className: 'sr-mark__pill',
        x: 28,
        y: 57,
        width: 64,
        height: 18,
        rx: 9,
        opacity: 0.72,
      }),
      h('rect', { className: 'sr-mark__pill', x: 40, y: 34, width: 40, height: 18, rx: 9 }),
      size >= 48 ? h('circle', { className: 'sr-mark__ring', cx: 60, cy: 16, r: 14 }) : null,
      h('circle', { className: 'sr-mark__dot', cx: 60, cy: 16, r: size >= 48 ? 8 : 10 }),
    );
  }

  function Logo(p) {
    var size = p.size || 32;
    return h(
      'span',
      { className: cx('sr-logo', p.className) },
      h(Mark, { size: size, label: 'Stackroost' }),
      p.markOnly
        ? null
        : h(
            'span',
            {
              className: 'sr-logo__word',
              'aria-hidden': 'true',
              style: { fontSize: Math.round(size * 0.72) + 'px' },
            },
            'stackroost',
          ),
    );
  }

  function Button(p) {
    var variant = p.variant || 'primary';
    var size = p.size || 'md';
    var rest = omit(p, ['variant', 'size', 'icon', 'iconRight', 'className', 'children']);
    var iconSize = size === 'sm' ? 16 : 18;
    return h(
      'button',
      Object.assign({ type: 'button' }, rest, {
        className: cx('sr-btn', 'sr-btn--' + variant, 'sr-btn--' + size, p.className),
      }),
      p.icon ? h(Icon, { name: p.icon, size: size === 'icon' ? 20 : iconSize }) : null,
      size === 'icon' ? null : p.children,
      p.iconRight ? h(Icon, { name: p.iconRight, size: 16 }) : null,
    );
  }

  function Badge(p) {
    var tone = p.tone || 'neutral';
    return h(
      'span',
      { className: cx('sr-badge', 'sr-badge--' + tone, p.className) },
      p.dot ? h('span', { className: 'sr-badge__dot', 'aria-hidden': 'true' }) : null,
      p.children,
    );
  }

  var ENV = {
    dev: { tone: 'neutral', label: 'Dev' },
    staging: { tone: 'info', label: 'Staging' },
    prod: { tone: 'danger', label: 'PROD' },
    other: { tone: 'neutral', label: 'Other' },
  };
  function EnvBadge(p) {
    var e = ENV[p.env] || ENV.other;
    return h(
      Badge,
      {
        tone: e.tone,
        dot: p.env === 'prod',
        className: p.env === 'prod' ? 'sr-badge--prod' : null,
      },
      e.label,
    );
  }

  function Panel(p) {
    var variant = p.variant || 'glass';
    var action =
      p.action ||
      (p.actionLabel
        ? h(
            Button,
            {
              variant: variant === 'inverse' ? 'ember' : 'glass',
              size: 'sm',
              icon: p.actionIcon,
              onClick: p.onAction,
            },
            p.actionLabel,
          )
        : null);
    var hasHead = p.title || action || p.subtitle;
    return h(
      'section',
      {
        className: cx('sr-panel', 'sr-panel--' + variant, p.className),
        style: p.style,
        'aria-label': p.title ? undefined : p['aria-label'],
      },
      hasHead
        ? h(
            'header',
            { className: 'sr-panel__head' },
            h(
              'div',
              null,
              p.title ? h('h3', { className: 'sr-panel__title' }, p.title) : null,
              p.subtitle ? h('p', { className: 'sr-panel__sub' }, p.subtitle) : null,
            ),
            action,
          )
        : null,
      h('div', { className: 'sr-panel__body' }, p.children),
    );
  }

  function sparkPath(data, w, ht, pad) {
    var min = Math.min.apply(null, data);
    var max = Math.max.apply(null, data);
    var range = max - min || 1;
    var step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
    var pts = data.map(function (v, i) {
      return [pad + i * step, pad + (1 - (v - min) / range) * (ht - pad * 2)];
    });
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1],
        b = pts[i],
        mx = ((a[0] + b[0]) / 2).toFixed(1);
      d +=
        ' C' +
        mx +
        ' ' +
        a[1].toFixed(1) +
        ' ' +
        mx +
        ' ' +
        b[1].toFixed(1) +
        ' ' +
        b[0].toFixed(1) +
        ' ' +
        b[1].toFixed(1);
    }
    return { d: d, pts: pts };
  }

  function Sparkline(p) {
    var data = p.data && p.data.length ? p.data : [0, 0];
    var w = p.width || 120,
      ht = p.height || 36,
      pad = 3;
    var s = sparkPath(data, w, ht, pad);
    var last = s.pts[s.pts.length - 1];
    var area =
      s.d + ' L' + last[0].toFixed(1) + ' ' + ht + ' L' + s.pts[0][0].toFixed(1) + ' ' + ht + ' Z';
    return h(
      'svg',
      {
        width: w,
        height: ht,
        viewBox: '0 0 ' + w + ' ' + ht,
        className: cx('sr-spark', 'sr-spark--' + (p.tone || 'ember'), p.className),
        role: 'img',
        'aria-label': p.label || 'Trend',
      },
      p.area ? h('path', { className: 'sr-spark__area', d: area }) : null,
      h('path', { className: 'sr-spark__line', d: s.d }),
      p.marker ? h('circle', { className: 'sr-spark__dot', cx: last[0], cy: last[1], r: 3 }) : null,
    );
  }

  function Metric(p) {
    return h(
      'div',
      { className: cx('sr-metric', p.className) },
      h(
        'div',
        { className: 'sr-metric__value' },
        p.value,
        p.unit ? h('span', { className: 'sr-metric__unit' }, p.unit) : null,
      ),
      h(
        'div',
        { className: 'sr-metric__label' },
        p.tone ? h('span', { className: 'sr-dot sr-dot--' + p.tone, 'aria-hidden': 'true' }) : null,
        p.label,
      ),
      p.progress != null
        ? h(
            'div',
            { className: 'sr-metric__bar', 'aria-hidden': 'true' },
            h('span', { style: { width: Math.max(0, Math.min(100, p.progress)) + '%' } }),
          )
        : null,
      p.spark
        ? h(Sparkline, {
            data: p.spark,
            tone: p.sparkTone || 'ember',
            width: 160,
            height: 36,
            label: p.label + ' trend',
          })
        : null,
    );
  }

  function Progress(p) {
    var v = Math.max(0, Math.min(100, p.value || 0));
    return h(
      'div',
      { className: cx('sr-progress', p.className) },
      p.label
        ? h(
            'div',
            { className: 'sr-progress__head' },
            h('span', null, p.label),
            h('span', { className: 'sr-mono' }, p.valueText || Math.round(v) + '%'),
          )
        : null,
      h(
        'div',
        {
          className: 'sr-progress__track',
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': Math.round(v),
          'aria-valuetext': p.valueText,
          'aria-label': p.label || 'Progress',
        },
        h('span', {
          className: 'sr-progress__fill sr-progress__fill--' + (p.tone || 'ember'),
          style: { width: v + '%' },
        }),
      ),
    );
  }

  function optVal(o) {
    return typeof o === 'string' ? o : o.value;
  }
  function optLabel(o) {
    return typeof o === 'string' ? o : o.label;
  }

  function Segmented(p) {
    var opts = p.options || [];
    var s = useMaybeControlled(
      p.value,
      p.defaultValue !== undefined ? p.defaultValue : opts[0] ? optVal(opts[0]) : undefined,
      p.onChange,
    );
    return h(
      'div',
      {
        className: cx('sr-seg', p.className),
        role: 'radiogroup',
        'aria-label': p.label || 'Options',
      },
      opts.map(function (o) {
        var v = optVal(o),
          on = v === s[0];
        return h(
          'button',
          {
            key: v,
            type: 'button',
            role: 'radio',
            'aria-checked': on,
            className: cx('sr-seg__item', on && 'is-on'),
            onClick: function () {
              s[1](v);
            },
          },
          optLabel(o),
        );
      }),
    );
  }

  function Switch(p) {
    var s = useMaybeControlled(p.checked, !!p.defaultChecked, p.onChange);
    var on = !!s[0];
    return h(
      'label',
      { className: cx('sr-switch', p.className) },
      h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': on,
          disabled: p.disabled,
          'aria-label': p.label ? undefined : p['aria-label'],
          className: cx('sr-switch__track', on && 'is-on'),
          onClick: function () {
            s[1](!on);
          },
        },
        h('span', { className: 'sr-switch__thumb' }),
      ),
      p.label ? h('span', null, p.label) : null,
    );
  }

  function Input(p) {
    var id = React.useId();
    var rest = omit(p, ['label', 'hint', 'mono', 'className']);
    return h(
      'div',
      { className: cx('sr-field', p.className) },
      p.label ? h('label', { htmlFor: id }, p.label) : null,
      h(
        'input',
        Object.assign({ id: id, className: cx('sr-input', p.mono && 'sr-input--mono') }, rest),
      ),
      p.hint ? h('span', { className: 'sr-field__hint' }, p.hint) : null,
    );
  }

  function SearchField(p) {
    return h(
      'label',
      { className: cx('sr-search', p.className) },
      h(
        'span',
        { className: 'sr-search__icon', 'aria-hidden': 'true' },
        h(Icon, { name: 'search', size: 18 }),
      ),
      h('span', { className: 'sr-sr-only' }, p.label || 'Search'),
      h('input', {
        type: 'search',
        className: 'sr-search__input',
        placeholder: p.placeholder || 'Search',
        defaultValue: p.defaultValue,
      }),
      p.shortcut ? h('kbd', { className: 'sr-kbd' }, p.shortcut) : null,
    );
  }

  function NavRail(p) {
    var items = p.items || [];
    var s = useMaybeControlled(p.active, items[0] ? items[0].id : undefined, p.onSelect);
    function btn(it) {
      var on = it.id === s[0];
      return h(
        Tooltip,
        { key: it.id, label: it.label, side: 'right' },
        h(
          'button',
          {
            type: 'button',
            className: cx('sr-rail__btn', on && 'is-on'),
            'aria-label': it.label,
            'aria-current': on ? 'page' : undefined,
            onClick: function () {
              s[1](it.id);
            },
          },
          h(Icon, { name: it.icon, size: 20 }),
          it.badge ? h('span', { className: 'sr-rail__badge', 'aria-hidden': 'true' }) : null,
        ),
      );
    }
    return h(
      'nav',
      { className: cx('sr-rail', p.className), 'aria-label': p.label || 'Main', style: p.style },
      p.logo !== false ? h(Mark, { size: 30 }) : null,
      h('div', { className: 'sr-rail__items' }, items.map(btn)),
      p.footer && p.footer.length
        ? h('div', { className: 'sr-rail__foot' }, p.footer.map(btn))
        : null,
    );
  }

  function ListRow(p) {
    return h(
      'div',
      { className: cx('sr-row', p.className) },
      p.icon
        ? h(
            'span',
            { className: 'sr-row__icon', 'aria-hidden': 'true' },
            h(Icon, { name: p.icon, size: 18 }),
          )
        : null,
      h(
        'div',
        { className: 'sr-row__text' },
        h('div', { className: 'sr-row__title' }, p.title),
        p.subtitle ? h('div', { className: 'sr-row__sub' }, p.subtitle) : null,
      ),
      p.meta ? h('div', { className: 'sr-row__meta' }, p.meta) : null,
      p.status || null,
      p.children || null,
      p.trailing || null,
    );
  }

  function DialogSurface(p) {
    var id = React.useId();
    return h(
      'div',
      { className: cx('sr-dialog', p.className), role: 'dialog', 'aria-labelledby': id },
      h('h2', { id: id, className: 'sr-dialog__title' }, p.title),
      p.description ? h('p', { className: 'sr-dialog__desc' }, p.description) : null,
      p.children ? h('div', { className: 'sr-dialog__body' }, p.children) : null,
      p.actions ? h('div', { className: 'sr-dialog__actions' }, p.actions) : null,
    );
  }

  function Menu(p) {
    var items = p.items || [];
    return h(
      'div',
      { className: cx('sr-menu', p.className), role: 'menu', 'aria-label': p.label || 'Menu' },
      items.map(function (it, i) {
        if (it.separator) return h('div', { key: i, className: 'sr-menu__sep', role: 'separator' });
        return h(
          'button',
          {
            key: i,
            type: 'button',
            role: 'menuitem',
            onClick: it.onSelect,
            className: cx('sr-menu__item', it.danger && 'is-danger'),
          },
          it.icon ? h(Icon, { name: it.icon, size: 16 }) : null,
          h('span', { className: 'sr-menu__label' }, it.label),
          it.shortcut ? h('kbd', { className: 'sr-kbd' }, it.shortcut) : null,
        );
      }),
    );
  }

  function Tooltip(p) {
    var side = p.side || 'top';
    var style =
      side === 'right'
        ? { bottom: 'auto', top: '50%', left: 'calc(100% + 10px)', transform: 'translateY(-50%)' }
        : undefined;
    return h(
      'span',
      { className: 'sr-tip-wrap' },
      p.children,
      h(
        'span',
        { className: cx('sr-tip', p.open && 'is-open'), role: 'tooltip', style: style },
        p.label,
      ),
    );
  }

  function sector(c, R, r, a0, a1) {
    function pt(rad, a) {
      return (c + rad * Math.cos(a)).toFixed(2) + ' ' + (c + rad * Math.sin(a)).toFixed(2);
    }
    var large = a1 - a0 > Math.PI ? 1 : 0;
    return (
      'M' +
      pt(R, a0) +
      ' A' +
      R +
      ' ' +
      R +
      ' 0 ' +
      large +
      ' 1 ' +
      pt(R, a1) +
      ' L' +
      pt(r, a1) +
      ' A' +
      r +
      ' ' +
      r +
      ' 0 ' +
      large +
      ' 0 ' +
      pt(r, a0) +
      ' Z'
    );
  }

  function CommandDial(p) {
    var items = p.items || [];
    var s = useMaybeControlled(p.active, items[0] ? items[0].id : undefined, p.onSelect);
    var size = 340,
      c = size / 2,
      R = 166,
      r = 106,
      n = Math.max(items.length, 1);
    var span = (Math.PI * 2) / n,
      gap = 0.035,
      start = -Math.PI / 2 - span / 2;
    var activeIdx = Math.max(
      0,
      items
        .map(function (i) {
          return i.id;
        })
        .indexOf(s[0]),
    );
    function onKey(e, id) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        s[1](id);
      }
    }
    return h(
      'div',
      { className: cx('sr-dial', p.className) },
      h(
        'div',
        { className: 'sr-dial__wheel' },
        h(
          'svg',
          {
            width: size,
            height: size,
            viewBox: '0 0 ' + size + ' ' + size,
            role: 'group',
            'aria-label': p.label || 'Quick switch',
          },
          h('circle', { className: 'sr-dial__groove', cx: c, cy: c, r: r - 4 }),
          items.map(function (it, i) {
            var a0 = start + i * span + gap,
              a1 = start + (i + 1) * span - gap,
              mid = (a0 + a1) / 2;
            var ix = c + ((R + r) / 2) * Math.cos(mid) - 10,
              iy = c + ((R + r) / 2) * Math.sin(mid) - 10;
            var on = it.id === s[0];
            return h(
              'g',
              { key: it.id },
              h('path', {
                d: sector(c, R, r, a0, a1),
                className: cx('sr-dial__seg', on && 'is-on'),
                tabIndex: 0,
                role: 'button',
                'aria-label': it.label,
                'aria-pressed': on,
                onClick: function () {
                  s[1](it.id);
                },
                onKeyDown: function (e) {
                  onKey(e, it.id);
                },
              }),
              h(
                'g',
                {
                  transform:
                    'translate(' + ix.toFixed(1) + ' ' + iy.toFixed(1) + ') scale(' + 20 / 24 + ')',
                  className: cx('sr-dial__icon', on && 'is-on'),
                },
                (PATHS[it.icon] || PATHS.more).map(function (d, k) {
                  return h('path', { key: k, d: d });
                }),
              ),
            );
          }),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'sr-dial__knob',
            'aria-label': p.knobLabel || 'Open command palette',
            onClick: p.onKnob,
          },
          h(Icon, { name: 'menu', size: 26 }),
        ),
      ),
      p.showList === false
        ? null
        : h(
            'div',
            { className: 'sr-dial__list' },
            items.map(function (it, i) {
              var on = it.id === s[0];
              var tilt = (i - activeIdx) * 6;
              return h(
                'button',
                {
                  key: it.id,
                  type: 'button',
                  'aria-pressed': on,
                  className: cx('sr-dial__chip', on && 'is-on'),
                  style: {
                    transform:
                      'rotate(' + tilt + 'deg) translateX(' + -Math.abs(i - activeIdx) * 8 + 'px)',
                  },
                  onClick: function () {
                    s[1](it.id);
                  },
                },
                h(Icon, { name: it.icon, size: 18 }),
                it.label,
              );
            }),
          ),
    );
  }

  window.Stackroost = {
    Logo: Logo,
    Mark: Mark,
    Icon: Icon,
    Button: Button,
    Badge: Badge,
    EnvBadge: EnvBadge,
    Panel: Panel,
    Metric: Metric,
    Sparkline: Sparkline,
    Progress: Progress,
    Segmented: Segmented,
    Switch: Switch,
    Input: Input,
    SearchField: SearchField,
    NavRail: NavRail,
    ListRow: ListRow,
    DialogSurface: DialogSurface,
    Menu: Menu,
    Tooltip: Tooltip,
    CommandDial: CommandDial,
    iconNames: Object.keys(PATHS),
  };
})();
