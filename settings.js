/* global TrelloPowerUp */
var t = TrelloPowerUp.iframe();
var GRANULARITY_KEY = 'granularity';

t.get('board', 'shared', GRANULARITY_KEY, 'week').then(function (value) {
  var radio = document.getElementById(value === 'month' ? 'gran-month' : 'gran-week');
  radio.checked = true;
  return t.sizeTo(document.body);
});

document.getElementById('save').addEventListener('click', function () {
  var checked = document.querySelector('input[name="granularity"]:checked');
  var value = checked ? checked.value : 'week';

  t.set('board', 'shared', GRANULARITY_KEY, value)
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
