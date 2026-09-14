/**
 * Popup builders for react-kerala-map.
 *
 * NOTE: these are intentionally free of party / political-front information.
 * They only surface geography and representative details (names, ward
 * numbers, turnout stats, etc.). Use the `popupRenderer` prop of <KeralaMap />
 * to provide fully custom popup content.
 */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function row(label, value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return '';
  }
  return (
    `<div class="klm-popup__row">` +
    `<span class="klm-popup__label">${escapeHtml(label)}</span>` +
    `<span>${escapeHtml(value)}</span>` +
    `</div>`
  );
}

/** Lok Sabha constituency popup (2024 general election). */
export function loksabhaPopupHtml(properties = {}) {
  const p = properties;
  return (
    `<div class="klm-popup">` +
    `<div class="klm-popup__title">${escapeHtml(p.ls_seat_name)}</div>` +
    `<div class="klm-popup__subtitle">Lok Sabha Constituency</div>` +
    row('MP', p.elected_representative) +
    row('Election Year', p.election_year || 2024) +
    row('Margin', p.margin) +
    row('Turnout', p.turnout_percentage ? `${p.turnout_percentage}%` : '') +
    `</div>`
  );
}

/** State Assembly constituency popup. */
export function assemblyPopupHtml(properties = {}) {
  const p = properties;
  return (
    `<div class="klm-popup">` +
    `<div class="klm-popup__title">${escapeHtml(p.Asmbly_Con)}</div>` +
    `<div class="klm-popup__subtitle">Assembly Constituency</div>` +
    row('District', p.District) +
    row('MLA', p.elected_representative) +
    row('Election Year', p.election_year || 2026) +
    `</div>`
  );
}

/** Local body (LSGI) popup — fired when a local body polygon is clicked. */
export function localBodyPopupHtml(info = {}) {
  return (
    `<div class="klm-popup">` +
    `<div class="klm-popup__title">${escapeHtml(info.lsgd_name)}</div>` +
    `<div class="klm-popup__subtitle">${escapeHtml(info.lsgd_type)}</div>` +
    row('District', info.district) +
    row('Total Wards', info.number_of_wards) +
    `</div>`
  );
}

/** Ward popup — the deepest level of the drill-down. */
export function wardPopupHtml(properties = {}, info = null) {
  const p = properties;
  const localBodyLabel = info
    ? `${info.lsgd_name} ${info.lsgd_type || ''}`.trim()
    : `${p.lsgd_name || ''} ${p.lsgd_type || ''}`.trim();
  return (
    `<div class="klm-popup">` +
    `<div class="klm-popup__title">${escapeHtml(p.ward_name || `Ward ${p.ward_number}`)}</div>` +
    `<div class="klm-popup__subtitle">Ward ${escapeHtml(p.ward_number)}</div>` +
    row('Local Body', localBodyLabel) +
    row('Representative', p.elected_representative) +
    row('Election Year', p.year) +
    `</div>`
  );
}
