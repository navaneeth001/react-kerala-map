/**
 * Popup builders for react-kerala-map.
 *
 * By default these are free of party / political-front information: they only
 * surface geography and representative details (names, ward numbers, turnout
 * stats, etc.).
 *
 * Opting in with `{ showElectionResults: true }` — the `showElectionResults`
 * prop of <KeralaMap /> or the matching controller option — adds an "Election
 * Results" block with the electoral data the datasets already carry: winning
 * party + alliance, votes / margins / turnout, constituency codes, reservation
 * and, for local bodies, the ward-wise front tally.
 *
 * Use the `popupRenderer` prop of <KeralaMap /> for fully custom popups.
 */

/** `showElectionResults` is off unless explicitly enabled. */
function showsResults(options) {
  return Boolean(options && options.showElectionResults);
}

/**
 * `1234567` / `'1234567'` -> `'12,34,567'` (Indian grouping). Values that are
 * not plain integers — percentages, coded seat numbers — pass through as-is.
 */
function count(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return value;
  return Number(text).toLocaleString('en-IN');
}

/** `'67.2'` / `67.2` -> `'67.2%'`; an existing `%` is not doubled. */
function percent(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.endsWith('%') ? text : `${text}%`;
}

/** `378.6475933415851` -> `'378.65'`. */
function area(value) {
  const number = Number(value);
  return Number.isFinite(number) && String(value ?? '').trim() !== ''
    ? number.toFixed(2)
    : value;
}

/**
 * Full alliance name. The assembly dataset spells it `winning_front_full`,
 * while the Lok Sabha dataset ships it as `fron_full` (sic), so both spellings
 * are accepted.
 */
function allianceName(p) {
  return p.winning_front_full || p.front_full || p.fron_full || '';
}

/** `'UDF — United Democratic Front'` when both spellings are present. */
function alliance(p) {
  const short = p.winning_front || p.front || '';
  const full = allianceName(p);
  if (short && full && short !== full) return `${short} — ${full}`;
  return short || full;
}

/** Winning party, preferring the spelled-out name. */
function party(p) {
  return p.winning_party_full || p.winning_party || '';
}

/**
 * The electoral block. Rows without a value are dropped, and the whole block
 * disappears when none of them has data, so a popup never shows an empty
 * "Election Results" heading.
 */
function electionSection(rows) {
  const body = rows.map(([label, value]) => row(label, value)).join('');
  if (!body) return '';
  return (
    `<div class="klm-popup__section">` +
    `<div class="klm-popup__section-title">Election Results</div>` +
    body +
    `</div>`
  );
}

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
export function loksabhaPopupHtml(properties = {}, options = {}) {
  const p = properties;
  return (
    `<div class="klm-popup">` +
    `<div class="klm-popup__title">${escapeHtml(p.ls_seat_name)}</div>` +
    `<div class="klm-popup__subtitle">Lok Sabha Constituency</div>` +
    row('MP', p.elected_representative) +
    row('Election Year', p.election_year || 2024) +
    row('Margin', count(p.margin)) +
    row('Turnout', percent(p.turnout_percentage)) +
    (showsResults(options)
      ? electionSection([
          ['Seat Code', p.ls_seat_code],
          ['Reservation', p.ls_reservation],
          ['Electors', count(p.electors)],
          ['Votes Polled', count(p.votes)],
          ['Margin %', p.margin_percentage],
          ['Winning Party', party(p)],
          ['Alliance', alliance(p)],
        ])
      : '') +
    `</div>`
  );
}

/** State Assembly constituency popup. */
export function assemblyPopupHtml(properties = {}, options = {}) {
  const p = properties;
  return (
    `<div class="klm-popup">` +
    `<div class="klm-popup__title">${escapeHtml(p.Asmbly_Con)}</div>` +
    `<div class="klm-popup__subtitle">Assembly Constituency</div>` +
    row('District', p.District) +
    row('MLA', p.elected_representative) +
    row('Election Year', p.election_year || 2026) +
    (showsResults(options)
      ? electionSection([
          ['Constituency Code', p.lac_code],
          ['Parliamentary Constituency', p.Prlmnt_Con],
          ['Area (sq km)', area(p['Area(sqkm)'])],
          ['Winning Party', party(p)],
          ['Alliance', alliance(p)],
        ])
      : '') +
    `</div>`
  );
}

/** Local body (LSGI) popup — fired when a local body polygon is clicked. */
export function localBodyPopupHtml(info = {}, options = {}) {
  return (
    `<div class="klm-popup">` +
    `<div class="klm-popup__title">${escapeHtml(info.lsgd_name)}</div>` +
    `<div class="klm-popup__subtitle">${escapeHtml(info.lsgd_type)}</div>` +
    row('District', info.district) +
    row('Total Wards', info.number_of_wards) +
    (showsResults(options)
      ? electionSection([
          ['LDF', info.LDF],
          ['UDF', info.UDF],
          ['NDA', info.NDA],
          ['Others', info.OTH],
          ['Largest Front', info.largest_front],
          ['Majority Front', info.majority_front],
          ['Majority (seats)', info.majority_number],
        ])
      : '') +
    `</div>`
  );
}

/** Ward popup — the deepest level of the drill-down. */
export function wardPopupHtml(properties = {}, info = null, options = {}) {
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
    (showsResults(options)
      ? electionSection([
          ['Winning Party', party(p)],
          ['Alliance', alliance(p)],
          ['Votes', count(p.votes)],
        ])
      : '') +
    `</div>`
  );
}
