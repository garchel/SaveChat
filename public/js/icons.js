  // ---------- Ícones SVG customizados ----------
  const SVG = (p, fill) => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${fill || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  export const ICON = {
    plus: SVG('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    folder: SVG('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    bubble: SVG('<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1.5-5.5a8.5 8.5 0 1 1 16.5-3z"/>'),
    chevron: SVG('<polyline points="6 9 12 15 18 9"/>'),
    star: SVG('<polygon points="12 2 15 9 22 9.3 17 14 18.5 21 12 17 5.5 21 7 14 2 9.3 9 9"/>'),
    pin: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6"/><path d="M10 4v5.5L7.2 13a1 1 0 0 0 .9 1.5h7.8a1 1 0 0 0 .9-1.5L14 9.5V4"/><path d="M12 14.5V21"/></svg>',
    pencil: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    trash: SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    arrowDownRight: SVG('<line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/>'),
    pinOff: SVG('<path d="M9 4h6l-1 7 4 3v2H6l4-3-1-7z"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="3" y1="3" x2="21" y2="21"/>'),
    move: SVG('<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>'),
    logout: SVG('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
    // Ícones das páginas do workspace (à esquerda do título no cabeçalho)
    calendar: SVG('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8.01" y2="14"/><line x1="12" y1="14" x2="12.01" y2="14"/><line x1="16" y1="14" x2="16.01" y2="14"/><line x1="8" y1="18" x2="8.01" y2="18"/><line x1="12" y1="18" x2="12.01" y2="18"/>'),
    sparkle: SVG('<path d="m12 3 1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7L12 3Z"/><path d="m18.5 15 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"/>'),
    clock: SVG('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>'),
    bell: SVG('<path d="M18 8.5A6 6 0 0 0 6 8.5c0 6-2.5 8-2.5 8h17s-2.5-2-2.5-8"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>'),
  };
  export const wrapSvg = (svg, size) => `<span class="svg-ic" style="width:${size || 16}px;height:${size || 16}px;display:inline-block">${svg}</span>`;

  // Paleta compartilhada — primeiras cores harmonizam com o tema atual (cozy: laranja/teal)
  export const COLOR_PALETTE = [
    { id: 'cozy-orange', bg: '#E28D42', fg: '#FFFFFF' },
    { id: 'cozy-teal',   bg: '#589B99', fg: '#FFFFFF' },
    { id: 'warm-beige',  bg: '#F5E6C8', fg: '#3A2E2A' },
    { id: 'sage',        bg: '#A8B5A2', fg: '#FFFFFF' },
    { id: 'dusty-blue',  bg: '#8FA9B5', fg: '#FFFFFF' },
    { id: 'terracotta',  bg: '#D4A373', fg: '#FFFFFF' },
    { id: 'orange',      bg: '#F2A65E', fg: '#FFFFFF' },
    { id: 'blue',        bg: '#8FC1D4', fg: '#FFFFFF' },
    { id: 'terra',       bg: '#C97B4A', fg: '#FFFFFF' },
    { id: 'teal',        bg: '#589B99', fg: '#FFFFFF' },
    { id: 'yellow',      bg: '#F0C64B', fg: '#3A2E2A' },
    { id: 'purple',      bg: '#7c5cff', fg: '#FFFFFF' },
    { id: 'pink',        bg: '#E8B4B8', fg: '#FFFFFF' },
    { id: 'olive',       bg: '#8A9A5B', fg: '#FFFFFF' },
    { id: 'slate',       bg: '#6B7D8E', fg: '#FFFFFF' },
    { id: 'coral',       bg: '#E07A5F', fg: '#FFFFFF' },
  ];
  export const colorById = (id) => COLOR_PALETTE.find((c) => c.id === id) || null;

  // Ícones vetoriais minimalistas para pastas/cadernos (paths de 24×24, stroke currentColor)
  export const GLYPH_ICONS = {
    bulb:      '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.2 4.7 3 6.2V18a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.8c1.8-1.5 3-3.7 3-6.2a7 7 0 0 0-7-7z"/>',
    cart:      '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    clock:     '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    zap:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    book:      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    heart:     '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    home:      '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    chat:      '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1.5-5.5a8.5 8.5 0 1 1 16.5-3z"/>',
    tag:       '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    calendar:  '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    camera:    '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    music:     '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    target:    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    flag:      '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    folder:    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  };
  export const glyphSvg = (id) => GLYPH_ICONS[id]
    ? `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH_ICONS[id]}</svg>`
    : null;
