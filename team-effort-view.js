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
  members: [],          // [{id, name}]
  cards: [],             // raw card objects from t.cards()
  effortByCard: {},      // cardId -> { memberId: number }
  granularity: 'week',
  prorate: true,
  stacked: false,
  selectedMemberIds: null, // null = all members; otherwise a Set of ids
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

function round1(n) {
  return Math.round(n * 10) / 10;
}

function isMemberIncluded(id) {
  return !state.selectedMemberIds || state.selectedMemberIds.has(id);
}

// Number of members the timeline's "average effort per member" is divided
// by. Uses the filtered subset when a filter is active, otherwise the whole
// board, so "team capacity" always collapses to a flat 100% line.
function currentTeamSize() {
  return state.selectedMemberIds ? state.selectedMemberIds.size : state.members.length;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadData() {
  return Promise.all([
    t.board('members'),
    t.cards('id', 'name', 'start', 'due', 'dueComplete', 'members'),
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
// Member filter dropdown
// ---------------------------------------------------------------------------

function updateMemberFilterButtonLabel() {
  var btn = document.getElementById('member-filter-btn');
  if (!state.selectedMemberIds) {
    btn.textContent = 'All members';
  } else {
    btn.textContent = state.selectedMemberIds.size + ' of ' + state.members.length + ' members';
  }
}

function buildMemberFilterList() {
  var listEl = document.getElementById('member-filter-list');
  listEl.innerHTML = '';

  state.members.forEach(function (m) {
    var label = document.createElement('label');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = isMemberIncluded(m.id);
    input.setAttribute('data-member-id', m.id);
    input.addEventListener('change', function () {
      // Lazily create the selection set the first time something is
      // unchecked; before that, "no filter" already behaves as "everyone".
      if (!state.selectedMemberIds) {
        state.selectedMemberIds = new Set(state.members.map(function (mm) { return mm.id; }));
      }
      if (input.checked) {
        state.selectedMemberIds.add(m.id);
      } else {
        state.selectedMemberIds.delete(m.id);
      }
      // If everything ended up checked again, drop back to "no filter".
      if (state.selectedMemberIds.size === state.members.length) {
        state.selectedMemberIds = null;
      }
      updateMemberFilterButtonLabel();
      renderAll();
    });

    var span = document.createElement('span');
    span.textContent = m.name;

    label.appendChild(input);
    label.appendChild(span);
    listEl.appendChild(label);
  });
}

function wireMemberFilterControls() {
  var btn = document.getElementById('member-filter-btn');
  var panel = document.getElementById('member-filter-panel');

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  });

  document.addEventListener('click', function (e) {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
      panel.hidden = true;
    }
  });

  document.getElementById('member-filter-all').addEventListener('click', function () {
    state.selectedMemberIds = null;
    buildMemberFilterList();
    updateMemberFilterButtonLabel();
    renderAll();
  });

  document.getElementById('member-filter-none').addEventListener('click', function () {
    state.selectedMemberIds = new Set();
    buildMemberFilterList();
    updateMemberFilterButtonLabel();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Cumulative effort per member (all cards, regardless of dates) — a raw sum,
// not averaged, so it reads as "total workload assigned" per person.
// ---------------------------------------------------------------------------

function computeCumulative() {
  var totals = {};
  var idToName = {};
  state.members.forEach(function (m) {
    totals[m.id] = 0;
    idToName[m.id] = m.name;
  });

  state.cards.forEach(function (card) {
    var currentIds = (card.members || []).map(function (m) { return m.id; }).filter(isMemberIncluded);
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

function renderCumulativeChart() {
  var rows = computeCumulative();
  var wrapEl = document.getElementById('cumulative-chart').parentNode;
  var emptyEl = document.getElementById('cumulative-empty');

  if (rows.length === 0) {
    wrapEl.style.display = 'none';
    emptyEl.hidden = false;
    return;
  }
  wrapEl.style.display = '';
  emptyEl.hidden = true;
  wrapEl.style.height = Math.max(140, rows.length * 36 + 40) + 'px';

  var ctx = document.getElementById('cumulative-chart').getContext('2d');

  if (cumulativeChart) cumulativeChart.destroy();
  cumulativeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(function (r) { return r.name; }),
      datasets: [{
        label: 'Cumulative effort %',
        data: rows.map(function (r) { return r.total; }),
        backgroundColor: rows.map(function (r, i) { return colorForIndex(i); })
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, title: { display: true, text: 'Effort %' } }
      }
    }
  });
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

function daysBetweenInclusive(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
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
// single-period event. A card marked dueComplete stops contributing effort
// to any bucket beyond today, since finished work shouldn't project into the
// future. When "prorate" is on, a card's effort in a bucket is scaled by how
// many of that bucket's days the card's range actually covers; otherwise it
// counts in full for any bucket it touches at all.
// Returns RAW per-member totals per bucket — averaging by team size happens
// at render time, so the same computed timeline serves both chart modes.
// ---------------------------------------------------------------------------

function computeTimeline(granularity, prorate) {
  var today = toUTCDate(new Date().toISOString());
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

    var filteredIds = (card.members || []).map(function (m) { return m.id; }).filter(isMemberIncluded);
    if (filteredIds.length === 0) return;

    // Completed cards don't project effort past today.
    var effectiveDue = due;
    if (card.dueComplete && due.getTime() > today.getTime()) {
      effectiveDue = today.getTime() > start.getTime() ? today : start;
    }
    if (effectiveDue.getTime() < start.getTime()) return; // fully clipped away

    dated.push({ card: card, start: start, due: due, effectiveDue: effectiveDue, memberIds: filteredIds });
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
    var cardStart = entry.start;
    var cardEnd = entry.effectiveDue;

    buckets.forEach(function (bucket) {
      var overlapStart = cardStart > bucket.start ? cardStart : bucket.start;
      var overlapEnd = cardEnd < bucket.end ? cardEnd : bucket.end;
      if (overlapStart.getTime() > overlapEnd.getTime()) return; // no overlap

      var fraction = 1;
      if (prorate) {
        var bucketDays = daysBetweenInclusive(bucket.start, bucket.end);
        var overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
        fraction = bucketDays > 0 ? overlapDays / bucketDays : 1;
      }

      entry.memberIds.forEach(function (id) {
        var val = Number(effort[id]);
        if (isNaN(val) || val <= 0) return;
        bucket.totals[id] = (bucket.totals[id] || 0) + val * fraction;
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

function computeTodayMarker(timeline) {
  if (!timeline) return null;
  var today = toUTCDate(new Date().toISOString());
  for (var i = 0; i < timeline.buckets.length; i++) {
    var b = timeline.buckets[i];
    if (today.getTime() >= b.start.getTime() && today.getTime() <= b.end.getTime()) {
      var bucketDays = daysBetweenInclusive(b.start, b.end);
      var dayOffset = daysBetweenInclusive(b.start, today) - 1;
      return { index: i, fraction: bucketDays > 0 ? dayOffset / bucketDays : 0 };
    }
  }
  return null; // today falls outside the plotted range
}

// A small self-contained Chart.js plugin (not globally registered, only
// attached to the timeline chart) that draws a vertical "today" line and a
// horizontal "team capacity" line directly on the canvas.
var referenceLinesPlugin = {
  id: 'referenceLines',
  afterDraw: function (chart, args, opts) {
    opts = opts || {};
    var ctx = chart.ctx;
    var area = chart.chartArea;
    var xScale = chart.scales.x;
    var yScale = chart.scales.y;
    if (!area || !xScale || !yScale) return;

    ctx.save();

    if (opts.today) {
      var idx = opts.today.index;
      var frac = opts.today.fraction || 0;
      var labelsCount = chart.data.labels.length;
      var centerPixel = xScale.getPixelForValue(idx);
      var bandWidth = labelsCount > 1
        ? Math.abs(xScale.getPixelForValue(1) - xScale.getPixelForValue(0))
        : (area.right - area.left);
      var xPixel = centerPixel - bandWidth / 2 + frac * bandWidth;
      xPixel = Math.max(area.left, Math.min(area.right, xPixel));

      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#EB5A46';
      ctx.moveTo(xPixel, area.top);
      ctx.lineTo(xPixel, area.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#EB5A46';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Today', xPixel, area.top - 6);
    }

    if (opts.capacityY != null) {
      var yPixel = yScale.getPixelForValue(opts.capacityY);
      if (yPixel >= area.top && yPixel <= area.bottom) {
        ctx.beginPath();
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#42526E';
        ctx.moveTo(area.left, yPixel);
        ctx.lineTo(area.right, yPixel);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#42526E';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Team capacity', area.left + 4, yPixel - 4);
      }
    }

    ctx.restore();
  }
};

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
  var teamSize = currentTeamSize();
  var divisor = Math.max(teamSize, 1);

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
    // Per-member breakdown stays raw (each person's own effort), unaffected
    // by the team-size averaging used for the aggregate view below.
    memberIds.forEach(function (id, i) {
      datasets.push({
        type: 'bar',
        label: timeline.idToName[id] || ('Member ' + id.slice(-4)),
        data: timeline.buckets.map(function (b) { return round1(b.totals[id] || 0); }),
        backgroundColor: colorForIndex(i),
        stack: 'effort'
      });
    });
  } else {
    datasets.push({
      type: 'bar',
      label: 'Average effort per member (%)',
      data: timeline.buckets.map(function (b) {
        var raw = Object.keys(b.totals).reduce(function (sum, id) { return sum + b.totals[id]; }, 0);
        return round1(raw / divisor);
      }),
      backgroundColor: '#0079BF',
      stack: 'effort'
    });
  }

  var todayMarker = computeTodayMarker(timeline);

  var ctx = document.getElementById('timeline-chart').getContext('2d');

  if (timelineChart) timelineChart.destroy();
  timelineChart = new Chart(ctx, {
    data: { labels: labels, datasets: datasets },
    plugins: [referenceLinesPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: state.stacked },
        referenceLines: {
          today: todayMarker,
          capacityY: state.stacked ? null : 100
        },
        tooltip: {
          callbacks: {
            footer: function (items) {
              var sum = items.reduce(function (s, item) { return s + item.parsed.y; }, 0);
              return state.stacked
                ? 'Stacked total: ' + round1(sum) + '%'
                : 'Averaged over ' + teamSize + ' member' + (teamSize === 1 ? '' : 's');
            }
          }
        }
      },
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: state.stacked ? 'Effort % (raw, per member)' : 'Avg effort % per member' }
        }
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
    '<div><strong>' + currentTeamSize() + '</strong> members averaged</div>' +
    '<div><strong>' + state.cards.length + '</strong> visible cards</div>' +
    '<div><strong>' + datedCount + '</strong> cards with start/due dates</div>' +
    '<div><strong>' + rangeText + '</strong> date range plotted' + warning + '</div>';
}

function renderAll() {
  var timeline = computeTimeline(state.granularity, state.prorate);
  state.timelineCache = timeline;

  renderSummary(timeline);
  renderTimelineChart(timeline);
  renderCumulativeChart();
}

document.getElementById('granularity-select').addEventListener('change', function (e) {
  state.granularity = e.target.value;
  t.set('board', 'shared', GRANULARITY_KEY, state.granularity).catch(function () {});
  renderAll();
});

document.getElementById('prorate-toggle').addEventListener('change', function (e) {
  state.prorate = e.target.checked;
  renderAll();
});

document.getElementById('stack-toggle').addEventListener('change', function (e) {
  state.stacked = e.target.checked;
  renderTimelineChart(state.timelineCache); // rendering-only change, no recompute needed
});

wireMemberFilterControls();

loadData()
  .then(function () {
    document.getElementById('granularity-select').value = state.granularity;
    buildMemberFilterList();
    updateMemberFilterButtonLabel();
    document.getElementById('loading').hidden = true;
    document.getElementById('content').hidden = false;
    renderAll();
  })
  .catch(function (err) {
    document.getElementById('loading').textContent =
      'Could not load board data: ' + (err && err.message ? err.message : 'unknown error');
  });
