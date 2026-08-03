/* global TrelloPowerUp */
var t = TrelloPowerUp.iframe();
var GRANULARITY_KEY = 'granularity';
var TEAM_SIZE_KEY = 'teamSize';

Promise.all([
  t.get('board', 'shared', GRANULARITY_KEY, 'week'),
  t.get('board', 'shared', TEAM_SIZE_KEY, null)
]).then(function (results) {
  var granularity = results[0];
  var teamSize = results[1];

  var radio = document.getElementById(granularity === 'month' ? 'gran-month' : 'gran-week');
  radio.checked = true;

  if (teamSize != null && teamSize > 0) {
    document.getElementById('team-size-input').value = teamSize;
  }

  return t.sizeTo(document.body);
});

document.getElementById('save').addEventListener('click', function () {
  var checked = document.querySelector('input[name="granularity"]:checked');
  var granularity = checked ? checked.value : 'week';

  var teamSizeRaw = document.getElementById('team-size-input').value;
  var teamSize = null;
  if (teamSizeRaw !== '') {
    var parsed = parseInt(teamSizeRaw, 10);
    if (!isNaN(parsed) && parsed > 0) teamSize = parsed;
  }

  Promise.all([
    t.set('board', 'shared', GRANULARITY_KEY, granularity),
    teamSize != null
      ? t.set('board', 'shared', TEAM_SIZE_KEY, teamSize)
      : t.remove('board', 'shared', TEAM_SIZE_KEY)
  ])
    .then(function () {
      return t.closePopup();
    })
    .catch(function (err) {
      t.alert({
        message: 'Could not save settings: ' + (err && err.message ? err.message : 'unknown error'),
        duration: 6
      });
    });
});
