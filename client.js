/* global TrelloPowerUp */
var Promise = TrelloPowerUp.Promise;

var EFFORT_KEY = 'effortHours'; // card-scoped, shared plugin data: { memberId: hoursPerWeek }
var WEEKLY_CAPACITY_HOURS = 37.5; // a member's full-time hours per week
var OVERLAP_CHECK_CAP = 40; // skip the overlap warning rather than firing 40+ requests

// Raw sum of the hours belonging to members currently on the card.
// Stale entries (a member removed from the card) are ignored.
function sumHours(effortMap, memberIds) {
  if (!effortMap) return 0;
  return (memberIds || []).reduce(function (total, id) {
    var val = Number(effortMap[id]);
    return total + (isNaN(val) ? 0 : val);
  }, 0);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Converts a total-hours figure into "% of combined capacity" for whichever
// group of members it's being measured against, purely to drive badge color.
function percentOfCapacity(totalHours, memberCount) {
  if (!memberCount) return 0;
  return (totalHours / (WEEKLY_CAPACITY_HOURS * memberCount)) * 100;
}

function badgeColor(percent) {
  if (!percent || percent <= 0) return null;
  if (percent < 100) return 'yellow';
  if (percent === 100) return 'green';
  return 'red'; // over-allocated
}

function toUTCDate(str) {
  if (!str) return null;
  var d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Looks across the rest of the board for cards that (a) share at least one
// member with this card and (b) overlap this card's date range, then checks
// whether any shared member's own raw hours add up past their weekly
// capacity once those concurrent cards are combined. This only runs on the
// back-of-card badge (opened one card at a time) rather than the
// front-of-card badge, since the front badge renders for every visible card
// on the board at once and this check needs extra network round-trips.
function checkConcurrentOverload(t, card, myEffort) {
  var memberIds = (card.members || []).map(function (m) { return m.id; });
  if (memberIds.length === 0) return Promise.resolve([]);

  var start = toUTCDate(card.start) || toUTCDate(card.due);
  var due = toUTCDate(card.due) || toUTCDate(card.start);
  if (!start || !due) return Promise.resolve([]); // no dates, nothing to overlap

  return t.cards('id', 'start', 'due', 'members').then(function (allCards) {
    var overlapping = allCards.filter(function (other) {
      if (other.id === card.id) return false;
      var oStart = toUTCDate(other.start) || toUTCDate(other.due);
      var oDue = toUTCDate(other.due) || toUTCDate(other.start);
      if (!oStart || !oDue) return false;
      var sharesMember = (other.members || []).some(function (m) {
        return memberIds.indexOf(m.id) !== -1;
      });
      if (!sharesMember) return false;
      return start.getTime() <= oDue.getTime() && due.getTime() >= oStart.getTime();
    });

    if (overlapping.length === 0 || overlapping.length > OVERLAP_CHECK_CAP) {
      return [];
    }

    return Promise.all(
      overlapping.map(function (other) {
        return t.get(other.id, 'shared', EFFORT_KEY, {});
      })
    ).then(function (otherEfforts) {
      var totals = {};
      memberIds.forEach(function (id) { totals[id] = Number(myEffort[id]) || 0; });

      overlapping.forEach(function (other, idx) {
        var oEffort = otherEfforts[idx] || {};
        (other.members || []).forEach(function (m) {
          if (totals[m.id] == null) return; // only care about members on this card
          var val = Number(oEffort[m.id]);
          if (!isNaN(val) && val > 0) totals[m.id] += val;
        });
      });

      var overloadedIds = Object.keys(totals).filter(function (id) {
        return totals[id] > WEEKLY_CAPACITY_HOURS;
      });
      if (overloadedIds.length === 0) return [];

      var idToName = {};
      card.members.forEach(function (m) {
        idToName[m.id] = m.fullName || m.username || m.initials || 'Member';
      });
      return overloadedIds.map(function (id) {
        return idToName[id] + ' (' + round1(totals[id]) + 'h/wk)';
      });
    });
  });
}

TrelloPowerUp.initialize({

  // Small badge on the front of the card: total hours across assigned members
  'card-badges': function (t, opts) {
    return t.card('members').then(function (card) {
      var memberIds = (card.members || []).map(function (m) { return m.id; });
      if (memberIds.length === 0) return [];

      return t.get('card', 'shared', EFFORT_KEY, {}).then(function (effort) {
        var totalHours = sumHours(effort, memberIds);
        if (totalHours <= 0) return [];
        var percent = percentOfCapacity(totalHours, memberIds.length);
        return [{
          text: round1(totalHours) + 'h',
          color: badgeColor(percent)
        }];
      });
    });
  },

  // Badge on the back of the card: opens the effort editor, plus a second
  // badge that warns if a member is over-committed across overlapping cards
  'card-detail-badges': function (t, opts) {
    return Promise.all([
      t.card('id', 'members', 'start', 'due'),
      t.get('card', 'shared', EFFORT_KEY, {})
    ]).then(function (results) {
      var card = results[0];
      var effort = results[1] || {};
      var memberIds = (card.members || []).map(function (m) { return m.id; });
      var totalHours = sumHours(effort, memberIds);
      var percent = percentOfCapacity(totalHours, memberIds.length);

      var badges = [{
        title: 'Team Effort',
        text: memberIds.length
          ? round1(totalHours) + 'h total (' + Math.round(percent) + '% of capacity)'
          : 'Assign members',
        color: badgeColor(percent),
        callback: function (t) {
          return t.popup({
            title: 'Set hours/week',
            url: './effort-editor.html',
            height: 260
          });
        }
      }];

      return checkConcurrentOverload(t, card, effort).then(function (overloadedNames) {
        if (overloadedNames.length > 0) {
          badges.push({
            title: 'Overlap warning',
            text: overloadedNames.join(', ') + ' over ' + WEEKLY_CAPACITY_HOURS + 'h/week this period',
            color: 'red'
          });
        }
        return badges;
      });
    });
  },

  // Button in the top bar of the board that opens the charts
  'board-buttons': function (t, opts) {
    return [{
      icon: {
        dark: './images/icon-white.svg',
        light: './images/icon-dark.svg'
      },
      text: 'Team Effort',
      callback: function (t) {
        return t.modal({
          title: 'Team effort over time',
          url: './team-effort-view.html',
          fullscreen: true,
          accentColor: 'blue'
        });
      }
    }];
  },

  // Gear icon in the Power-Ups section of the board sidebar
  'show-settings': function (t, opts) {
    return t.popup({
      title: 'Team Effort Tracker settings',
      url: './settings.html',
      height: 184
    });
  }

});
