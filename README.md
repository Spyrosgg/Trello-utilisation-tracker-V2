# Team Effort Tracker — a Trello Power-Up

Tracks each assigned member's **days per week** on every card, rolls it up
into cumulative days per person, and charts team **utilization %** over
time (days ÷ a 5-day work week ÷ a team size you set) using each card's
start/due dates.

## What it does

- **On a card** — a "Team Effort" badge on the back of the card opens a form
  with one input per assigned member, where you set that member's **days
  per week** committed to this card. Both the front-of-card and back-of-card
  badges show the **total days** across all assigned members (Alice at 2
  days + Bob at 1.5 days shows as "3.5d"), color-coded against what full
  capacity for that many people would be (5 days × number of assigned
  members).
- If a member's own days add up past 5 days/week across other cards that
  overlap this card's dates, a second red "Overlap warning" badge appears on
  the back of the card naming who's over-committed.
- **On the board** — a "Team Effort" button in the top bar opens a
  full-screen view with two charts:
  1. **Team effort over time** — utilization %, bucketed by week or month,
     computed as each period's assigned days ÷ (5 days × a **team size you
     set once in the Power-Up's settings** — not counted automatically
     per period).
     - A dashed **red vertical line** marks today.
     - A dashed **grey horizontal line** marks team capacity — always
       100%, since both effort and capacity are divided by the same
       team-size number.
     - Toggle **"Prorate by day coverage"** to scale a card's days to a
       bucket by how much of that bucket its date range actually covers,
       instead of counting a full period for any bucket it touches at all.
     - Toggle **"Break down by member"** to see each person's own
       utilization % stacked, instead of the team average (the capacity
       line only applies to the averaged view).
     - A **"Filter to" dropdown** narrows both charts to specific members —
       this only affects who's summed into the totals, not the team-size
       divisor (see below).
     - A **"change" link** next to the team size in the summary strip opens
       the same settings popup as the gear icon, without leaving the chart.
  2. **Cumulative effort by member** — total days/week summed across every
     card on the board, one bar per person. This one stays in raw days
     rather than converting to %, since a lump total (ignoring dates
     entirely) has no single time window to measure a percentage against.
- **Settings** (gear icon in the board's Power-Ups panel) —
  - default week/month grouping for the time chart
  - **team size**: a manual number that the "over time" chart's average is
    divided by. Leave blank to fall back to the board's total member count
    (or the filtered subset, if a member filter is active in the chart view
    when you haven't set a manual number).

## The 5-day/week conversion, and why it works the same at any bucket size

Effort is entered as **days per week** — a rate, not a one-off lump sum —
so a card contributes to a bucket as: `weekly_rate × (days_covered ÷ 7)`.
That `÷ 7` is what makes a week-bucket and a month-bucket agree: if a card
fully covers one week, it contributes exactly its weekly rate; if it fully
covers a 31-day month, it contributes `rate × 31/7` (≈4.43 weeks' worth) —
and dividing by that same month's capacity (`5 × 31/7`) lands on the
identical utilization % either way. `days_covered` is the actual overlap
when "Prorate by day coverage" is on, or the bucket's full length when it's
off (i.e. any touched bucket counts as fully covered).

## Why a manual team size instead of counting who's active

Earlier versions of this chart divided each period's total by however many
members happened to have days assigned in that specific week or month. That
made the "100% capacity" line meaningless if headcount swings — a
skeleton-crew week could look artificially "fully utilized." Per your
request, the divisor is now a single number you set once in settings,
applied to every bucket. If you leave it blank, it falls back to counting
members (board-wide or filtered) as a reasonable default, but the intent is
for you to set an explicit number that represents your team.

## How the data is modeled

- Effort is stored as **card-level "shared" plugin data** under the key
  `effortDays` — `{"<memberId>": 2, "<memberId2>": 1.5}` (days/week) — so
  every board member with view access can see it.
  > **Migration note:** this Power-Up has gone through two unit changes —
  > percentage → hours → days — and each time the storage key changed
  > (`effort` → `effortHours` → `effortDays`) specifically so old values
  > never get silently reinterpreted under new units. Nothing is corrupted,
  > but if you had hours (or percentage) data from an earlier version,
  > you'll need to re-enter it here in days; the old keys just aren't read
  > anymore.
- A card contributes to the time chart only if it has a **start and/or due
  date**. If only one is set, it's treated as a single-period event. Cards
  with neither date still count toward the cumulative totals, just not the
  timeline.
- A card marked **dueComplete** stops contributing days to any bucket after
  today — finished work shouldn't project into the future — but still
  counts normally for past/current buckets.
- If a member is removed from a card after days were set for them, that
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
effort-editor.html/js     popup for setting each member's days/week on a card
settings.html/js          popup for week/month grouping + manual team size
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
7. Open the gear icon → **set your team size** so the "over time" chart's
   capacity line means what you expect from day one.

## Design assumptions worth knowing about

- **5 days/week is hardcoded**, not a per-board setting — it lives as
  `WEEKLY_CAPACITY_DAYS` in both `client.js` and `team-effort-view.js`.
  Change both if your organization uses a different standard week.
- Days entered are treated as a **weekly rate that applies for as long as
  the card is active**, not a one-time lump total for the whole card. If
  you actually meant "2 days total, spread across the card's whole
  duration" rather than "2 days every week the card is open," that's a
  different calculation (dividing by the number of weeks spanned) — let me
  know and I'll switch it.
- The **manual team size always wins over the filter** when set: if you set
  team size to 5 in settings but then filter the chart down to 2 people,
  the chart still divides by 5, not 2. The filter only changes who's summed
  into the numerator. If you'd rather the filter also adjust the divisor
  when a manual number is set, that's a small change to `currentTeamSize()`.
- The **cumulative chart stays in raw days**, not %, since it ignores dates
  entirely and there's no natural weekly window to convert against.

## Known limits

- Trello's plugin-data storage caps each scope/visibility pair at 4096
  characters — plenty for one card's effort object, so this shouldn't be a
  practical issue.
- The board view fetches each card's effort data with one request per card
  (`t.get(cardId, 'shared', 'effortDays')`), since Trello doesn't offer a
  bulk read across cards. Fine for boards with up to a few hundred cards;
  very large boards will feel slower to open the chart view for.
- The concurrent-overlap badge does the same per-card fetch for whichever
  other cards overlap in time and share a member — capped at 40 overlapping
  cards before it gives up silently, to keep opening a card fast.
- Chart.js is pulled from a CDN (`cdnjs.cloudflare.com`) at runtime — if your
  Workspace restricts third-party scripts, self-host `chart.umd.min.js`
  instead and update the `<script src>` in `team-effort-view.html`.
- Prorating and the "today"/capacity lines assume UTC day boundaries, so a
  card that starts/ends right at midnight in your local timezone may shift
  by up to a day in the chart.
