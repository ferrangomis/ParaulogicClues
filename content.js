(function () {
  'use strict';

  let sidebar          = null;
  let originalData     = null;
  let discoveredObs    = null; // tracked so teardown can disconnect it
  let wordCache        = new Map(); // memoize per-word analysis results
  let lastWordsKey     = '';   // skip DOM rebuild when words haven't changed

  // ── Teardown (SPA navigation) ────────────────────────────────────────────

  function teardown() {
    if (discoveredObs) { discoveredObs.disconnect(); discoveredObs = null; }
    const existing = document.getElementById('pistes-sidebar');
    if (existing) existing.remove();
    sidebar      = null;
    originalData = null;
    wordCache.clear();
    lastWordsKey = '';
  }

  // ── Data parsing ─────────────────────────────────────────────────────────

  function parseTableData() {
    const table = document.getElementById('table_graella');
    if (!table || table.rows.length < 2) return {};

    const headers = Array.from(table.rows[0].cells).map(c => c.textContent.trim());
    const data = {};

    for (let r = 1; r < table.rows.length; r++) {
      const row    = table.rows[r];
      const letter = row.cells[0]?.textContent.trim();
      if (!letter || letter === 'Σ') continue;
      data[letter] = {};
      for (let c = 1; c < row.cells.length; c++) {
        const len = parseInt(headers[c]);
        if (!isNaN(len)) {
          data[letter][len] = parseInt(row.cells[c].textContent.trim()) || 0;
        }
      }
    }
    return data;
  }

  // Parse "key-count" pairs. Case-insensitive so capitalised keys are handled.
  function parsePairs(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return {};
    const data  = {};
    const regex = /\b([a-zàáâäçèéêëìíîïòóôöùúûü·]+)-(\d+)/gi;
    let m;
    while ((m = regex.exec(el.textContent)) !== null) {
      data[m[1].toLowerCase()] = parseInt(m[2]);
    }
    return data;
  }

  // FIX: parse raw textContent with regex — game never creates actual <li> elements
  // in tutis/palindroms/quadrats, so querySelectorAll('li') always returned nothing.
  function parseLengthCounts(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return {};
    const data  = {};
    const regex = /-\s*(\d+)\s+de\s+(\d+)\s+lletres/g;
    let m;
    while ((m = regex.exec(el.textContent)) !== null) {
      data[parseInt(m[2])] = parseInt(m[1]);
    }
    return data;
  }

  // ── Sidebar builders ──────────────────────────────────────────────────────

  function buildTableSection() {
    const source = document.getElementById('table_graella');
    if (!source) return null;

    const table = source.cloneNode(true);
    table.removeAttribute('id');

    if (table.rows.length > 0) {
      const headers = Array.from(table.rows[0].cells).map(c => c.textContent.trim());
      for (let r = 1; r < table.rows.length; r++) {
        const row    = table.rows[r];
        const letter = row.cells[0]?.textContent.trim();
        if (!letter || letter === 'Σ') continue;
        for (let c = 1; c < row.cells.length; c++) {
          const len = parseInt(headers[c]);
          if (!isNaN(len)) {
            row.cells[c].dataset.letter = letter;
            row.cells[c].dataset.len    = len;
          }
        }
      }
    }
    return table;
  }

  function buildPairListSection(elementId) {
    const source = document.getElementById(elementId);
    if (!source) return null;

    const ul      = document.createElement('ul');
    const heading = source.querySelector('b.pistes');
    if (heading) ul.appendChild(heading.cloneNode(true));

    const pairs = [];
    const regex = /\b([a-zàáâäçèéêëìíîïòóôöùúûü·]+)-(\d+)/gi;
    let m;
    while ((m = regex.exec(source.textContent)) !== null) {
      pairs.push({ key: m[1].toLowerCase(), count: parseInt(m[2]) });
    }

    if (pairs.length > 0) {
      const li = document.createElement('li');
      li.className = 'pairs-container';
      pairs.forEach(({ key, count }) => {
        const span = document.createElement('span');
        span.className          = 'pair-item';
        span.dataset.pairKey    = key;
        span.dataset.originalCount = count;
        span.innerHTML = `${key}-<span class="pair-count">${count}</span> `;
        li.appendChild(span);
      });
      ul.appendChild(li);
    }

    return ul;
  }

  function buildLengthCountSection(elementId) {
    const source = document.getElementById(elementId);
    if (!source) return null;

    const ul        = document.createElement('ul');
    const existingB = source.querySelector('b.pistes');

    if (existingB) {
      ul.appendChild(existingB.cloneNode(true));
    } else {
      const headingText = source.textContent
        .split(/\s*-\s*\d+\s+de\s+\d+\s+lletres/)[0]
        .trim();
      if (headingText) {
        const b       = document.createElement('b');
        b.className   = 'pistes';
        b.textContent = headingText;
        ul.appendChild(b);
      }
    }

    const regex = /-\s*(\d+)\s+de\s+(\d+)\s+lletres/g;
    let m;
    while ((m = regex.exec(source.textContent)) !== null) {
      const count  = parseInt(m[1]);
      const length = parseInt(m[2]);
      const li     = document.createElement('li');
      li.dataset.length        = length;
      li.dataset.originalCount = count;
      li.innerHTML = `- <span class="length-count">${count}</span> de ${length} lletres`;
      ul.appendChild(li);
    }

    return ul;
  }

  function buildSidebar() {
    const existing = document.getElementById('pistes-sidebar');
    if (existing) existing.remove();

    sidebar    = document.createElement('div');
    sidebar.id = 'pistes-sidebar';

    const title       = document.createElement('h2');
    title.className   = 'pistes-sidebar-title';
    title.textContent = 'Pistes';
    sidebar.appendChild(title);

    const sections = [
      { id: 'table_graella', build: buildTableSection },
      { id: 'prefix2',       build: () => buildPairListSection('prefix2') },
      { id: 'prefix3',       build: () => buildPairListSection('prefix3') },
      { id: 'sufix3',        build: () => buildPairListSection('sufix3') },
      { id: 'tutis',         build: () => buildLengthCountSection('tutis') },
      { id: 'palindroms',    build: () => buildLengthCountSection('palindroms') },
      { id: 'quadrats',      build: () => buildLengthCountSection('quadrats') },
      { id: 'subconjunts',   build: () => buildPairListSection('subconjunts') },
    ];

    sections.forEach(({ id, build }) => {
      const el = build();
      if (!el) return;
      const wrapper         = document.createElement('div');
      wrapper.className     = 'pistes-section';
      wrapper.dataset.section = id;
      wrapper.appendChild(el);
      sidebar.appendChild(wrapper);
    });

    sidebar.appendChild(buildAnalysisSection());
    document.body.appendChild(sidebar);
  }

  // ── Word analysis ─────────────────────────────────────────────────────────

  function normalize(word) {
    return word.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function sortedUniqueChars(word) {
    return [...new Set(word.split(''))].sort().join('');
  }

  function getAvailableChars() {
    const chars = new Set();
    document.querySelectorAll('.hex-link').forEach(link => {
      const ch = link.textContent.trim().toLowerCase();
      if (ch.length === 1) chars.add(ch);
    });
    return chars;
  }

  function isTuti(word) {
    // FIX: guard against empty availableChars (selector failure) — would
    // otherwise mark every word as a tuti.
    if (!originalData?.availableChars || originalData.availableChars.size === 0) return false;
    const wordChars = new Set(word.split(''));
    for (const ch of originalData.availableChars) {
      if (!wordChars.has(ch)) return false;
    }
    return true;
  }

  function isPalindrome(word) {
    return word.length >= 2 && word === [...word].reverse().join('');
  }

  function isSquare(word) {
    if (word.length < 2 || word.length % 2 !== 0) return false;
    const half = word.length / 2;
    return word.slice(0, half) === word.slice(half);
  }

  function cleanWord(w) {
    return w.trim().toLowerCase().replace(/[^\p{L}·]/gu, '');
  }

  // Memoized per-word analysis — avoids recomputing on every MutationObserver tick.
  function analyzeWord(word) {
    if (wordCache.has(word)) return wordCache.get(word);
    const w      = normalize(word);
    const result = {
      normalized : w,
      len        : w.length,
      p3         : w.slice(0, 3),
      s3         : w.slice(-3),
      chars      : sortedUniqueChars(w),
      tuti       : isTuti(w),
      palindrome : isPalindrome(w),
      square     : isSquare(w),
    };
    wordCache.set(word, result);
    return result;
  }

  function getDiscoveredWords() {
    const el = document.getElementById('discovered-text');
    if (!el) return [];
    return el.textContent
      .split(',')
      .map(w => {
        const mainForm = w.split(' o ')[0];
        return cleanWord(mainForm);
      })
      .filter(w => w.length > 0);
  }

  function computeUsage(words) {
    const tableUsage       = {};
    const prefix2Usage     = {};
    const prefix3Usage     = {};
    const sufix3Usage      = {};
    const subconjuntsUsage = {};
    const tutisUsage       = {};
    const palindromsUsage  = {};
    const quadratsUsage    = {};

    words.forEach(word => {
      const { normalized: w, len, p3, s3, chars, tuti, palindrome, square } = analyzeWord(word);
      if (len < 2) return;

      const tableKey = `${w[0]}:${len}`;
      tableUsage[tableKey] = (tableUsage[tableKey] || 0) + 1;

      prefix2Usage[w.slice(0, 2)] = (prefix2Usage[w.slice(0, 2)] || 0) + 1;
      prefix3Usage[p3]            = (prefix3Usage[p3]            || 0) + 1;
      sufix3Usage[s3]             = (sufix3Usage[s3]             || 0) + 1;
      subconjuntsUsage[chars]     = (subconjuntsUsage[chars]     || 0) + 1;

      if (tuti)      tutisUsage[len]      = (tutisUsage[len]      || 0) + 1;
      if (palindrome) palindromsUsage[len] = (palindromsUsage[len] || 0) + 1;
      if (square)    quadratsUsage[len]   = (quadratsUsage[len]   || 0) + 1;
    });

    return {
      tableUsage, prefix2Usage, prefix3Usage, sufix3Usage, subconjuntsUsage,
      tutisUsage, palindromsUsage, quadratsUsage,
    };
  }

  function applyUsage({ tableUsage, prefix2Usage, prefix3Usage, sufix3Usage, subconjuntsUsage, tutisUsage, palindromsUsage, quadratsUsage }) {
    if (!sidebar || !originalData) return;

    sidebar.querySelectorAll('[data-letter][data-len]').forEach(cell => {
      const letter   = cell.dataset.letter;
      const len      = parseInt(cell.dataset.len);
      const original = originalData.table[letter]?.[len] ?? 0;
      const used     = tableUsage[`${letter}:${len}`] || 0;
      const remaining = original - used;
      if (used > 0) {
        cell.innerHTML = `<span class="updated-count">${remaining}</span>`;
      } else {
        cell.textContent = String(original);
      }
    });

    applyUsageToPairs('prefix2',     prefix2Usage,     originalData.prefix2);
    applyUsageToPairs('prefix3',     prefix3Usage,     originalData.prefix3);
    applyUsageToPairs('sufix3',      sufix3Usage,      originalData.sufix3);
    applyUsageToPairs('subconjunts', subconjuntsUsage, originalData.subconjunts);

    applyUsageToLengthSection('tutis',      tutisUsage,      originalData.tutis);
    applyUsageToLengthSection('palindroms', palindromsUsage, originalData.palindroms);
    applyUsageToLengthSection('quadrats',   quadratsUsage,   originalData.quadrats);
  }

  function applyUsageToPairs(sectionId, usageMap, originalCounts) {
    const wrapper = sidebar?.querySelector(`[data-section="${sectionId}"]`);
    if (!wrapper) return;

    wrapper.querySelectorAll('.pair-item').forEach(span => {
      const key       = span.dataset.pairKey;
      const original  = originalCounts?.[key] ?? parseInt(span.dataset.originalCount) ?? 0;
      const used      = usageMap[key] || 0;
      const remaining = original - used;

      const countSpan = span.querySelector('.pair-count');
      if (!countSpan) return;
      countSpan.textContent = remaining;
      countSpan.classList.toggle('updated-count', used > 0);
    });
  }

  function applyUsageToLengthSection(sectionId, usageMap, originalCounts) {
    const wrapper = sidebar?.querySelector(`[data-section="${sectionId}"]`);
    if (!wrapper) return;

    wrapper.querySelectorAll('li[data-length]').forEach(li => {
      const length    = parseInt(li.dataset.length);
      const original  = originalCounts?.[length] ?? parseInt(li.dataset.originalCount) ?? 0;
      const used      = usageMap[length] || 0;
      const remaining = original - used;

      const countSpan = li.querySelector('.length-count');
      if (!countSpan) return;
      countSpan.textContent = remaining;
      countSpan.classList.toggle('updated-count', used > 0);
    });
  }

  // ── Paraules analitzades section ──────────────────────────────────────────

  function buildAnalysisSection() {
    const wrapper           = document.createElement('div');
    wrapper.className       = 'pistes-section';
    wrapper.dataset.section = 'analisi';

    const ul      = document.createElement('ul');
    const heading = document.createElement('b');
    heading.className = 'pistes';
    heading.innerHTML = `Paraules analitzades <span class="analisi-count"></span>:`;
    ul.appendChild(heading);

    const list      = document.createElement('div');
    list.className  = 'analisi-list';
    ul.appendChild(list);

    wrapper.appendChild(ul);
    return wrapper;
  }

  function updateAnalysisSection(words) {
    // FIX: skip full DOM rebuild when the word list hasn't changed.
    const key = words.join(',');
    if (key === lastWordsKey) return;
    lastWordsKey = key;

    const countSpan = sidebar?.querySelector('.analisi-count');
    if (countSpan) countSpan.textContent = words.length > 0 ? `(${words.length})` : '';

    const list = sidebar?.querySelector('.analisi-list');
    if (!list) return;
    list.innerHTML = '';

    if (words.length === 0) {
      const empty       = document.createElement('span');
      empty.className   = 'analisi-empty';
      empty.textContent = '—';
      list.appendChild(empty);
      return;
    }

    words.forEach(word => {
      const { len, p3, s3, chars, tuti, palindrome, square } = analyzeWord(word);

      const row       = document.createElement('div');
      row.className   = 'analisi-row';

      const wordSpan       = document.createElement('span');
      wordSpan.className   = 'analisi-word';
      wordSpan.textContent = word;
      row.appendChild(wordSpan);

      const meta       = document.createElement('span');
      meta.className   = 'analisi-meta';
      meta.textContent = `${len}L · +${p3} · -${s3} · [${chars}]`;
      row.appendChild(meta);

      // FIX: use appendChild instead of innerHTML += (avoids repeated parse/serialize).
      if (tuti || palindrome || square) {
        const badges     = document.createElement('span');
        badges.className = 'analisi-badges';
        if (tuti) {
          const b = document.createElement('span');
          b.className   = 'badge-tuti';
          b.textContent = '★';
          badges.appendChild(b);
        }
        if (palindrome) {
          const b = document.createElement('span');
          b.className   = 'badge-palindrome';
          b.textContent = '↩';
          badges.appendChild(b);
        }
        if (square) {
          const b = document.createElement('span');
          b.className   = 'badge-square';
          b.textContent = '□';
          badges.appendChild(b);
        }
        row.appendChild(badges);
      }

      list.appendChild(row);
    });
  }

  function runAnalysis() {
    if (!sidebar || !originalData) return;
    const words = getDiscoveredWords();
    applyUsage(computeUsage(words));
    updateAnalysisSection(words);
  }

  // ── Watch discovered words ────────────────────────────────────────────────

  function watchDiscoveredWords() {
    function attachObserver() {
      const el = document.getElementById('discovered-text');
      if (!el) return false;
      discoveredObs = new MutationObserver(runAnalysis);
      discoveredObs.observe(el, { childList: true, subtree: true, characterData: true });
      return true;
    }

    if (attachObserver()) { runAnalysis(); return; }

    const bodyObs = new MutationObserver(() => {
      if (attachObserver()) { bodyObs.disconnect(); runAnalysis(); }
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });
  }

  // ── Modal management ──────────────────────────────────────────────────────

  function closePistesModal() {
    const modal = document.getElementById('pistes');
    if (!modal) return;
    const closeLink = modal.querySelector('.close-icon-link');
    if (closeLink) {
      closeLink.click();
    } else {
      modal.classList.remove('active', 'open', 'visible', 'show');
      modal.style.display = 'none';
    }
  }

  function populateAndBuild() {
    const pistesLink = document.getElementById('pistes-link');
    if (!pistesLink) return;

    const table           = document.getElementById('table_graella');
    const alreadyPopulated = table && table.rows.length > 1;

    const proceed = () => {
      originalData = {
        table        : parseTableData(),
        prefix2      : parsePairs('prefix2'),
        prefix3      : parsePairs('prefix3'),
        sufix3       : parsePairs('sufix3'),
        subconjunts  : parsePairs('subconjunts'),
        tutis        : parseLengthCounts('tutis'),
        palindroms   : parseLengthCounts('palindroms'),
        quadrats     : parseLengthCounts('quadrats'),
        availableChars: getAvailableChars(),
      };

      if (originalData.availableChars.size === 0) {
        console.warn('[Paraulògic Pistes] Could not read wheel characters — tuti detection disabled.');
      }

      closePistesModal();
      buildSidebar();
      watchDiscoveredWords();
    };

    if (alreadyPopulated) {
      proceed();
    } else {
      pistesLink.click();
      setTimeout(proceed, 400);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  let currentPath = location.pathname;

  function init() {
    teardown();

    const checkReady = setInterval(() => {
      if (document.getElementById('pistes-link') && document.getElementById('center-letter')) {
        clearInterval(checkReady);
        populateAndBuild();
      }
    }, 200);
    setTimeout(() => clearInterval(checkReady), 10000);
  }

  // Re-init only when the page actually navigates away and back — not on every
  // pushState call the game makes internally (e.g. when accepting a word).
  function handleNavigation() {
    if (location.pathname !== currentPath) {
      currentPath = location.pathname;
      init();
    }
  }

  window.addEventListener('popstate',   handleNavigation);
  window.addEventListener('hashchange', handleNavigation);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
