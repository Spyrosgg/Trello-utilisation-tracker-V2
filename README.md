# Team Effort Tracker — a Trello Power-Up

Tracks each assigned member's utilization % on every card, rolls it up into
cumulative workload per person, and charts average team effort over time
using each card's start/due dates.

## What it does

- **On a card** — a "Team Effort" badge on the back of the card opens a form
  with one input per assigned member, where you set that member's
  utilization % for this card. Both the front-of-card and back-of-card
  badges show that card's effort **averaged across its assigned members**
  (a card with Alice at 50% and Bob at 25% reads as "avg 37.5%", not "75%").
- If a member's own effort adds up past 100% across other cards that overlap
  this card's dates, a second red "Overlap warning" badge appears on the
  back of the card naming who's over-committed.
- **On the board** — a "Team Effort" button in the top bar opens a
  full-screen view with two charts:
  1. **Team effort over time** — average effort % **per team member**,
     bucketed by week or month, from each card's start/due date range.
     - A dashed **red vertical line** marks today.
     - A dashed **grey horizontal line** marks team capacity — always 100%,
       since capacity and effort are divided by the same headcount.
     - Toggle **"Prorate by day coverage"** to scale a card's contribution
       to a bucket by how much of that bucket its date range actually
       covers, instead of counting it in full for any bucket it touches.
     - Toggle **"Break down by member"** to see each person's own raw effort
       stacked, instead of the team average (the capacity line only applies
       to the averaged view, since per-member bars aren't divided).
     - A **"Filter to" dropdown** lets you narrow both charts to specific
       members — the divisor for the average and the capacity line adjust
       to match whoever's selected.
  2. **Cumulative effort by member** — total effort % summed across every
     card on the board, one bar per person (a raw total, not averaged).
- **Settings** (gear icon in the board's Power-Ups panel) — choose the
  default week/month grouping for the time chart.

## How the data is modeled

- Effort is stored as **card-level "shared" plugin data** — a small JSON
  object like `{"<memberId>": 50, "<memberId2>": 25}` — so every board
  member with view access can see it, not just the person who set it.
- A card contributes to the time chart only if it has a **start and/or due
  date**. If only one is set, it's treated as a single-period event. Cards
  with neither date still count toward the cumulative totals, just not the
  timeline.
- A card marked **dueComplete** stops contributing effort to any bucket
  after today — finished work shouldn't project into the future — but still
  counts normally for past/current buckets.
- If a member is removed from a card after effort was set for them, that
  stale entry is ignored everywhere.
- The **concurrent-overlap check** (the red warning badge) only runs when
  you open an individual card, and only checks up to 40 overlapping cards,
  to avoid firing a burst of requests across the whole board at once.

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

## Design assumption worth knowing about

"Team capacity" is modeled as a flat **100%** on the averaged timeline chart
— i.e. "the average member is fully booked" — because once effort and
headcount are both divided by the same team size, that's the only value
that stays meaningful regardless of how many people are on the board or
selected in the filter. If you actually want capacity expressed as raw
hours or a headcount-scaled number instead, that's a small change to
`capacityY` in `team-effort-view.js` (currently hardcoded to `100` whenever
the chart isn't in "Break down by member" mode).

## Known limits

- Trello's plugin-data storage caps each scope/visibility pair at 4096
  characters — plenty for one card's effort object, so this shouldn't be a
  practical issue.
- The board view fetches each card's effort data with one request per card
  (`t.get(cardId, 'shared', 'effort')`), since Trello doesn't offer a bulk
  read across cards. Fine for boards with up to a few hundred cards; very
  large boards will feel slower to open the chart view for.
- The concurrent-overlap badge does the same per-card fetch for whichever
  other cards overlap in time and share a member — capped at 40 overlapping
  cards before it gives up silently, to keep opening a card fast.
- Chart.js is pulled from a CDN (`cdnjs.cloudflare.com`) at runtime — if your
  Workspace restricts third-party scripts, self-host `chart.umd.min.js`
  instead and update the `<script src>` in `team-effort-view.html`.
- Prorating and the "today"/capacity lines assume UTC day boundaries, so a
  card that starts/ends right at midnight in your local timezone may shift
  by up to a day in the chart.
