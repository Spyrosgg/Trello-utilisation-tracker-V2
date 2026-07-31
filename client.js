/* global TrelloPowerUp */
var Promise = TrelloPowerUp.Promise;

var EFFORT_KEY = 'effort'; // card-scoped, shared plugin data: { memberId: percentNumber }

// Sum the effort values that belong to members currently assigned to the card.
// Stale entries (a member who was removed from the card) are ignored.
function sumEffort(effortMap, memberIds) {
  if (!effortMap) return 0;
  return (memberIds || []).reduce(function (total, id) {
    var val = Number(effortMap[id]);
    return total + (isNaN(val) ? 0 : val);
  }, 0);
}

function badgeColor(total) {
  if (!total || total <= 0) return null;
  if (total < 100) return 'yellow';
  if (total === 100) return 'green';
  return 'red'; // over-allocated
}

TrelloPowerUp.initialize({

  // Small badge on the front of the card
  'card-badges': function (t, opts) {
    return t.card('members').then(function (card) {
      var memberIds = (card.members || []).map(function (m) { return m.id; });
      if (memberIds.length === 0) return [];

      return t.get('card', 'shared', EFFORT_KEY, {}).then(function (effort) {
        var total = sumEffort(effort, memberIds);
        if (total <= 0) return [];
        return [{
          text: 'Effort ' + total + '%',
          color: badgeColor(total)
        }];
      });
    });
  },

  // Badge on the back of the card that opens the effort editor popup
  'card-detail-badges': function (t, opts) {
    return t.card('members').then(function (card) {
      var memberIds = (card.members || []).map(function (m) { return m.id; });

      return t.get('card', 'shared', EFFORT_KEY, {}).then(function (effort) {
        var total = sumEffort(effort, memberIds);
        return [{
          title: 'Team Effort',
          text: memberIds.length ? total + '%' : 'Assign members',
          color: badgeColor(total),
          callback: function (t) {
            return t.popup({
              title: 'Set effort %',
              url: './effort-editor.html',
              height: 260
            });
          }
        }];
      });
    });
  },

  // Button in the top bar of the board that opens the charts
  'board-buttons': function (t, opts) {
    return [{
      icon: '<?xml version="1.0" encoding="UTF-8"?><svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" color="#000000"><path d="M22 17C13 17 11 22.9999 2 22.9999" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M22 1C13 1 11 6.9999 2 6.9999" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 16.5V7.5M12 16.5L14.5 14M12 16.5L9.5 14M12 7.5L14.5 10M12 7.5L9.5 10" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
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
