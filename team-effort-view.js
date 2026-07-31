/* global TrelloPowerUp, Chart */
var t = TrelloPowerUp.iframe();

var EFFORT_KEY = 'effort';
var GRANULARITY_KEY = 'granularity';
var MAX_BUCKETS = 260; // safety cap, ~5 years of weekly buckets

var PALETTE = [
  '#0079BF', '#D29034', '#519839', '#B04632', '#89609E',
  '#CD5A91', '#4BBF6B', '#00AECC', '#838C91', '#172B4D'
];

var state = {
  members: [],       // [{id, name}]
  cards: [],          // raw card objects from t.cards()
  effortByCard: {},   // cardId -> { memberId: number }
  granularity: 'week',
  stacked: false,
  timelineCache: null
};

var cumulativeChart = null;
var timelineChart = null;

function displayName(member) {
  return member.fullName || member.username || member.initials ||
    ('Member ' + String(member.id).slice(-4));
}

function colorForIndex(i) {
  return PALETTE[i % PALETTE.length];
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadData() {
  return Promise.all([
    t.board('members'),
    t.cards('id', 'name', 'start', 'due', 'members'),
    t.get('board', 'shared', GRANULARITY_KEY, 'week')
  ]).then(function (results) {
    var board = results[0];
    var cards = results[1];
    var granularity = results[2];

    state.members = (board.members || []).map(function (m) {
      return { id: m.id, name: displayName(m) };
    });
    state.cards = cards || [];
    state.granularity = granularity === 'month' ? 'month' : 'week';

    // Card-scoped plugin data has to be fetched one card at a time, by id.
    return Promise.all(
      state.cards.map(function (card) {
        return t.get(card.id, 'shared', EFFORT_KEY, {}).then(function (effort) {
          state.effortByCard[card.id] = effort || {};
        });
      })
    );
  });
}

// ---------------------------------------------------------------------------
// Cumulative effort per member (all cards, regardless of dates)
// ---------------------------------------------------------------------------

function computeCumulative() {
  var totals = {};
  var idToName = {};
  state.members.forEach(function (m) {
    totals[m.id] = 0;
    idToName[m.id] = m.name;
  });

  state.cards.forEach(function (card) {
    var currentIds = (card.members || []).map(function (m) { return m.id; });
    var effort = state.effortByCard[card.id] || {};
    currentIds.forEach(function (id) {
      var val = Number(effort[id]);
      if (isNaN(val) || val <= 0) return;
      if (totals[id] == null) totals[id] = 0;
      totals[id] += val;
    });
  });

  return Object.keys(totals)
    .map(function (id) {
      return { id: id, name: idToName[id] || ('Member ' + id.slice(-4)), total: totals[id] };
    })
    .filter(function (row) { return row.total > 0; })
    .sort(function (a, b) { return b.total - a.total; });
}

function computeCumulative() {
  var totals = {};
  var cardCounts = {}; // ✅ track how many cards each member is on
  var idToName = {};
  
  state.members.forEach(function (m) {
    totals[m.id] = 0;
    cardCounts[m.id] = 0;
    idToName[m.id] = m.name;
  });

  state.cards.forEach(function (card) {
    var currentIds = (card.members || []).map(function (m) { return m.id; });
    var effort = state.effortByCard[card.id] || {};
    currentIds.forEach(function (id) {
      var val = Number(effort[id]);
      if (isNaN(val) || val <= 0) return;
      totals[id] += val;
      cardCounts[id] += 1; // ✅ increment card count for this member
    });
  });

  return Object.keys(totals)
    .map(function (id) {
      var total = totals[id];
      var cardCount = cardCounts[id] || 1;
      var avgPerCard = Math.round(total / cardCount); // ✅ divide by card count
      return {
        id: id,
        name: idToName[id] || ('Member ' + id.slice(-4)),
        total: avgPerCard // store the average instead of raw total
      };
    })
    .filter(function (row) { return row.total > 0; })
    .sort(function (a, b) { return b.total - a.total; });
}

// ---------------------------------------------------------------------------
// Date / bucket helpers
// ---------------------------------------------------------------------------

function toUTCDate(str) {
  if (!str) return null;
  var d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfWeek(date) {
  var day = date.getUTCDay(); // 0 Sun ... 6 Sat
  var diff = (day === 0 ? -6 : 1 - day); // shift back to Monday
  var d = new Date(date);
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addBucket(date, granularity) {
  var d = new Date(date);
  if (granularity === 'month') {
    d.setUTCMonth(d.getUTCMonth() + 1);
  } else {
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return d;
}

function bucketLabel(date, granularity) {
  var opts = granularity === 'month'
    ? { year: 'numeric', month: 'short', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', timeZone: 'UTC' };
  return date.toLocaleDateString(undefined, opts);
}

// ---------------------------------------------------------------------------
// Timeline: bucket every card's effort into weekly/monthly periods based on
// its start/due dates. A card with only one of the two dates is treated as a
// single-period event. Effort is counted in full for any bucket the card's
// [start, due] range touches (not prorated by day).
// ---------------------------------------------------------------------------

function computeTimeline(granularity) {
  var dated = [];

  state.cards.forEach(function (card) {
    var start = toUTCDate(card.start);
    var due = toUTCDate(card.due);
    if (!start && !due) return;
    if (!start) start = due;
    if (!due) due = start;
    if (start.getTime() > due.getTime()) {
      var tmp = start; start = due; due = tmp;
    }
    dated.push({ card: card, start: start, due: due });
  });

  if (dated.length === 0) return null;

  var globalMin = dated.reduce(function (min, d) { return d.start < min ? d.start : min; }, dated[0].start);
  var globalMax = dated.reduce(function (max, d) { return d.due > max ? d.due : max; }, dated[0].due);

  var bucketStartFn = granularity === 'month' ? startOfMonth : startOfWeek;
  var cursor = bucketStartFn(globalMin);
  var buckets = [];
  var guard = 0;

  while (cursor.getTime() <= globalMax.getTime() && guard < MAX_BUCKETS) {
    var bucketStart = new Date(cursor);
    var bucketEndExclusive = addBucket(bucketStart, granularity);
    var bucketLastDay = new Date(bucketEndExclusive);
    bucketLastDay.setUTCDate(bucketLastDay.getUTCDate() - 1);

    buckets.push({
      start: bucketStart,
      end: bucketLastDay,
      label: bucketLabel(bucketStart, granularity),
      totals: {} // memberId -> effort total for this bucket
    });

    cursor = bucketEndExclusive;
    guard++;
  }

  var idToName = {};
  state.members.forEach(function (m) { idToName[m.id] = m.name; });

  dated.forEach(function (entry) {
    var effort = state.effortByCard[entry.card.id] || {};
    var currentIds = (entry.card.members || []).map(function (m) { return m.id; });

    buckets.forEach(function (bucket) {
      var overlaps = entry.start.getTime() <= bucket.end.getTime() &&
        entry.due.getTime() >= bucket.start.getTime();
      if (!overlaps) return;

      currentIds.forEach(function (id) {
        var val = Number(effort[id]);
        if (isNaN(val) || val <= 0) return;
        bucket.totals[id] = (bucket.totals[id] || 0) + val;
      });
    });
  });

  return {
    buckets: buckets,
    idToName: idToName,
    cardCount: dated.length,
    rangeStart: globalMin,
    rangeEnd: globalMax,
    truncated: guard >= MAX_BUCKETS
  };
}

function renderTimelineChart(timeline) {
  var wrapEl = document.getElementById('timeline-chart').parentNode;
  var emptyEl = document.getElementById('timeline-empty');

  if (!timeline || timeline.buckets.length === 0) {
    wrapEl.style.display = 'none';
    emptyEl.hidden = false;
    return;
  }
  wrapEl.style.display = '';
  emptyEl.hidden = true;
  wrapEl.style.height = '380px';

  var labels = timeline.buckets.map(function (b) { return b.label; });

  var activeMemberIds = {};
  timeline.buckets.forEach(function (b) {
    Object.keys(b.totals).forEach(function (id) { activeMemberIds[id] = true; });
  });
  var memberIds = Object.keys(activeMemberIds).sort(function (a, b) {
    var an = timeline.idToName[a] || a;
    var bn = timeline.idToName[b] || b;
    return an.localeCompare(bn);
  });

  var datasets = [];

  if (state.stacked) {
    memberIds.forEach(function (id, i) {
      datasets.push({
        type: 'bar',
        label: timeline.idToName[id] || ('Member ' + id.slice(-4)),
        data: timeline.buckets.map(function (b) { return b.totals[id] || 0; }),
        backgroundColor: colorForIndex(i),
        stack: 'effort'
      });
    });
  } else {
    datasets.push({
      type: 'bar',
      label: 'Total team effort %',
      data: timeline.buckets.map(function (b) {
        return Object.keys(b.totals).reduce(function (sum, id) { return sum + b.totals[id]; }, 0);
      }),
      backgroundColor: '#0079BF',
      stack: 'effort'
    });
  }

  var ctx = document.getElementById('timeline-chart').getContext('2d');

  if (timelineChart) timelineChart.destroy();
  timelineChart = new Chart(ctx, {
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: state.stacked },
        tooltip: {
          callbacks: {
            footer: function (items) {
              var sum = items.reduce(function (s, item) { return s + item.parsed.y; }, 0);
              return 'Total: ' + sum + '%';
            }
          }
        }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Effort %' } }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Summary strip + wiring
// ---------------------------------------------------------------------------

function renderSummary(timeline) {
  var summaryEl = document.getElementById('summary');
  var datedCount = timeline ? timeline.cardCount : 0;
  var rangeText = timeline
    ? timeline.rangeStart.toLocaleDateString() + ' \u2013 ' + timeline.rangeEnd.toLocaleDateString()
    : '\u2014';
  var warning = timeline && timeline.truncated
    ? ' <span style="color:#B04632;">(range truncated)</span>'
    : '';

  summaryEl.innerHTML =
    '<div><strong>' + state.members.length + '</strong> board members</div>' +
    '<div><strong>' + state.cards.length + '</strong> visible cards</div>' +
    '<div><strong>' + datedCount + '</strong> cards with start/due dates</div>' +
    '<div><strong>' + rangeText + '</strong> date range plotted' + warning + '</div>';
}

function renderAll() {
  var timeline = computeTimeline(state.granularity);
  state.timelineCache = timeline;

  renderCumulativeChart();
  renderSummary(timeline);
  renderTimelineChart(timeline);
}

document.getElementById('granularity-select').addEventListener('change', function (e) {
  state.granularity = e.target.value;
  t.set('board', 'shared', GRANULARITY_KEY, state.granularity).catch(function () {});
  renderAll();
});

document.getElementById('stack-toggle').addEventListener('change', function (e) {
  state.stacked = e.target.checked;
  renderTimelineChart(state.timelineCache);
});

loadData()
  .then(function () {
    document.getElementById('granularity-select').value = state.granularity;
    document.getElementById('loading').hidden = true;
    document.getElementById('content').hidden = false;
    renderAll();
  })
  .catch(function (err) {
    document.getElementById('loading').textContent =
      'Could not load board data: ' + (err && err.message ? err.message : 'unknown error');
  });
