# Team Effort Tracker — a Trello Power-Up

Tracks each assigned member's utilization % on every card, rolls it up into
cumulative workload per person, and charts total team effort over time using
each card's start/due dates.

## What it does

- **On a card** — a "Team Effort" badge appears on the back of the card
  (and a summary badge on the front, once effort is set). Clicking it opens a
  small form with one input per assigned member, where you set that member's
  utilization % for this card.
- **On the board** — a "Team Effort" button appears in the top bar. It opens
  a full-screen view with two charts:
  1. **Cumulative effort by member** — total effort % summed across every
     card on the board, one bar per person.
  2. **Team effort over time** — total effort % active per week (or month),
     computed from each card's start/due date range. There's a toggle to
     break this down by member instead of showing the team total.
- **Settings** (gear icon in the board's Power-Ups panel) — choose whether
  the time chart groups by week or month by default.

## How the data is modeled

- Effort is stored as **card-level "shared" plugin data** — a small JSON
  object like `{"<memberId>": 50, "<memberId2>": 25}` — so every board
  member with view access can see it, not just the person who set it.
- A card contributes to the time chart only if it has a **start and/or due
  date**. If only one is set, the card is treated as a single-period event
  on that date. Cards with neither date still count toward the cumulative
  totals, just not the timeline.
- Effort for a bucket (week/month) is counted **in full** if the card's
  date range touches that bucket at all — it isn't pro-rated by how many
  days of the bucket the card actually covers. That keeps the chart easy to
  reason about; see "Possible extensions" below if you want day-level
  weighting instead.
- If a member is removed from a card after effort was set for them, that
  stale entry is simply ignored in all calculations.

## Files

```
manifest.json           Power-Up metadata + which capabilities it uses
index.html               connector page — loads client.js
client.js                 registers card-badges, card-detail-badges,
                           board-buttons, and show-settings
effort-editor.html/js     popup for setting each member's effort % on a card
settings.html/js          popup for choosing week/month grouping
team-effort-view.html/js  full-screen charts (uses Chart.js from a CDN)
styles.css                shared styling on top of Trello's own power-up.min.css
images/                   manifest icon + board-button icon (light/dark variants)
```

## Hosting it

Trello loads a Power-Up's files over HTTPS from wherever you host them — it
doesn't run your code itself. Any static host works. Two easy options:

**GitHub Pages**
1. Push this folder to a GitHub repo.
2. Repo Settings → Pages → deploy from the branch/folder containing these
   files.
3. Your connector URL will be `https://<you>.github.io/<repo>/index.html`.

**Netlify / Vercel**
- Drag-and-drop the folder in the Netlify dashboard, or run `vercel deploy`
  from inside it. Either gives you an HTTPS URL immediately.

Just make sure the whole folder (not only `index.html`) is deployed, since
`client.js`, the popup pages, and `images/` are all fetched relative to it.

## Installing it on a board

**Quick way to try it out (no admin rights needed):**
1. Host the folder anywhere public (see above).
2. Go to `https://trello.com/power-up-preview` and paste the URL to your
   hosted `manifest.json`.
3. It'll show up as an available Power-Up you can enable on boards you can
   already access — good for testing before a real rollout.

**Proper install (for a whole Workspace):**
1. Go to `https://trello.com/power-ups/admin` (you need to be a Workspace
   admin).
2. Click **Create new Power-Up**, give it a name, and pick the Workspace.
3. Paste your hosted `index.html` URL into **Iframe connector URL**.
4. Open the **Capabilities** tab and add: `card-badges`, `card-detail-badges`,
   `board-buttons`, `show-settings` — matching the `capabilities` array in
   `manifest.json`.
5. Upload an icon (or point it at `images/icon.svg`).
6. Go to any board in that Workspace → Power-Ups → find it → **Enable**.

## Known limits

- Trello's plugin-data storage caps each scope/visibility pair at 4096
  characters — plenty for one card's effort object, so this shouldn't be a
  practical issue.
- The board view fetches each card's effort data with one request per card
  (`t.get(cardId, 'shared', 'effort')`), since Trello doesn't offer a bulk
  read across cards. This is fine for boards with up to a few hundred cards;
  very large boards will feel slower to open the chart view for.
- Chart.js is pulled from a CDN (`cdnjs.cloudflare.com`) at runtime — if your
  Workspace restricts third-party scripts, self-host `chart.umd.min.js`
  instead and update the `<script src>` in `team-effort-view.html`.

## Possible extensions

- Prorate a card's effort by the fraction of each week/month it actually
  spans, instead of counting it in full for any bucket it touches.
- Exclude cards marked `dueComplete` from the forward-looking part of the
  timeline.
- Add a per-member filter to the timeline chart.
- Warn in the card badge when a member's cumulative effort across *concurrent*
  cards exceeds 100%.
