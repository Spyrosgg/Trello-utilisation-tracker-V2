/* global TrelloPowerUp */
var t = TrelloPowerUp.iframe();
var EFFORT_KEY = 'effortHours';

function displayName(member) {
  return member.fullName || member.username || member.initials || 'Member';
}

function render() {
  return Promise.all([
    t.card('members'),
    t.get('card', 'shared', EFFORT_KEY, {})
  ]).then(function (results) {
    var card = results[0];
    var effort = results[1] || {};
    var members = card.members || [];

    var rowsEl = document.getElementById('rows');
    var emptyEl = document.getElementById('empty');
    var saveBtn = document.getElementById('save');
    rowsEl.innerHTML = '';

    if (members.length === 0) {
      emptyEl.hidden = false;
      saveBtn.hidden = true;
      return t.sizeTo(document.body);
    }

    emptyEl.hidden = true;
    saveBtn.hidden = false;

    members.forEach(function (member) {
      var row = document.createElement('div');
      row.className = 'effort-editor__row';

      var label = document.createElement('label');
      label.textContent = displayName(member);
      label.setAttribute('for', 'member-' + member.id);

      var inputWrap = document.createElement('div');
      inputWrap.className = 'effort-editor__input-wrap';

      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '168';
      input.step = '0.5';
      input.id = 'member-' + member.id;
      input.setAttribute('data-member-id', member.id);
      input.value = effort[member.id] != null ? effort[member.id] : '';
      input.placeholder = '0';

      var suffix = document.createElement('span');
      suffix.textContent = 'h';

      inputWrap.appendChild(input);
      inputWrap.appendChild(suffix);
      row.appendChild(label);
      row.appendChild(inputWrap);
      rowsEl.appendChild(row);
    });

    return t.sizeTo(document.body);
  });
}

document.getElementById('save').addEventListener('click', function () {
  var inputs = document.querySelectorAll('#rows input[data-member-id]');
  var effort = {};

  inputs.forEach(function (input) {
    var val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
      effort[input.getAttribute('data-member-id')] = val;
    }
  });

  t.set('card', 'shared', EFFORT_KEY, effort)
    .then(function () {
      return t.closePopup();
    })
    .catch(function (err) {
      t.alert({
        message: 'Could not save effort: ' + (err && err.message ? err.message : 'unknown error'),
        duration: 6
      });
    });
});

render();
