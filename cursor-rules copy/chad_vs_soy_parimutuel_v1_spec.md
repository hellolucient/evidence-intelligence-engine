# Chad vs Soy — Hourly Round + Pari‑Mutuel Prediction Pools (V1 Build Plan)

This is a build-ready spec you can paste into Cursor to generate code.

---

## 0) Product Goal

Create a **1-hour repeating game round** where users:
1) **Vote** Chad/Soy on **10 profiles** (earn points),
2) **Optionally stake** earned points into **pari-mutuel prediction pools** for **Top #1 / #2 / #3 Chad**,
3) Receive **payouts** after the round closes based on pool sizes and their chosen picks,
4) Are incentivized to participate regularly (anti-hoarding via point decay + optional daily stake cap).

No real money. Points-only economy.

---

## 1) Core Loop (Per 1-Hour Round)

1. **Round opens** → show the round’s 10 profiles.
2. User votes **Chad** or **Soy** on each profile (10 votes total).
3. User earns **+10 points per vote** immediately.
4. After all 10 votes (or anytime after voting), user may open **Prediction Market** (optional).
5. In the Prediction Market, user can stake points into pools:
   - Pool A: **#1 Chad**
   - Pool B: **#2 Chad**
   - Pool C: **#3 Chad**
6. For each pool they stake into, user selects **which profile** they believe will finish at that rank.
7. **Round closes at 60 minutes** → votes + bets lock.
8. System calculates **#1/#2/#3 Chad** from votes.
9. Pools resolve and **payouts** are credited.
10. Results screen shows:
    - final ranking
    - user vote accuracy summary (optional)
    - bet results + payouts

---

## 2) Round Structure

- **Duration:** 60 minutes (hourly cadence).
- **Profiles per round:** 10.
- Users may join/participate anytime before round end.

---

## 3) Voting System (Points Earning)

- Each of the 10 profiles requires a vote: **Chad** or **Soy**.
- **Reward:** `+10 points` per vote.
- Completing all 10 votes in a round yields `+100 points`.

Notes:
- Users are **not required** to bet.
- Voting points are the **primary faucet** for points entering the economy.

---

## 4) Determining Winners (#1/#2/#3 Chad)

For each profile `i` in the round:

- `chad_score[i] = ChadVotes[i] / (ChadVotes[i] + SoyVotes[i])`

Then:

- Sort profiles by `chad_score` descending.
- Rank 1 = **#1 Chad**, rank 2 = **#2 Chad**, rank 3 = **#3 Chad**.

**Tie-breakers** (deterministic):
1. Higher `total_votes = ChadVotes + SoyVotes` wins.
2. If still tied: earlier `submission_timestamp` wins (or stable `profile_id` sort).

---

## 5) Prediction Market (Pari‑Mutuel Pools)

### 5.1 Pools

Maintain **three separate pools**, each resolved independently:

- **Pool A:** “Who finishes #1 Chad?”
- **Pool B:** “Who finishes #2 Chad?”
- **Pool C:** “Who finishes #3 Chad?”

Each pool is a set of outcomes = the **10 profiles**.

### 5.2 User Bets (Stakes + Picks)

After earning points, user may **stake** points:

- They choose an amount per pool (including 0).
- For each pool where amount > 0, they must choose **exactly one profile** as their pick.

Example bet slip (total staked = 100):
- Pool A: stake 50 → pick Profile 7
- Pool B: stake 30 → pick Profile 2
- Pool C: stake 20 → pick Profile 9

Users can also skip betting entirely and hold points.

---

## 6) Pari‑Mutuel Payout Formula (Per Pool)

Each pool pays winners from the pool itself.

Definitions (for a specific pool, e.g., Pool A):
- `S` = total points staked in this pool across all users (sum of all stakes)
- `S_k` = total points staked on the **winning profile** in this pool
- `fee` = platform fee (recommended V1: **5%**)
- `distributable = (1 - fee) * S`

If the winning profile is `k`, then for a user with stake `stake_u` on `k`:

- `multiplier = distributable / S_k`
- `payout_u = stake_u * multiplier`

Notes:
- If you want “stake returned + winnings” behavior, the above already includes stake in the payout (it’s a multiplier on stake).
- This makes payouts self-balancing:
  - More popular picks → lower payout
  - Contrarian correct picks → higher payout

### 6.1 Early-Stage Safety Rules (Recommended)

**Minimum pool size / bettors:**
- If `S < MIN_POOL` or bettors < `MIN_BETTORS`, either:
  - (A) disable betting for that pool for the round, OR
  - (B) accept bets but refund 1:1 at resolution (no fee).

Suggested V1 defaults:
- `MIN_POOL = 200 points`
- `MIN_BETTORS = 5`

**Max multiplier cap:**
- Cap extreme payouts when pools are tiny:
  - `multiplier = min(multiplier, MAX_MULTIPLIER)`
Suggested V1 default:
- `MAX_MULTIPLIER = 20x`

---

## 7) Optional Daily Stake Cap (Anti-Whale / Economy Control)

To avoid domination and smooth growth, apply a per-user daily stake cap:

- `DAILY_STAKE_CAP = 500 points/day` (across all pools)

Meaning:
- Users can still earn unlimited points via voting,
- But can only stake up to 500 total points per day.

This cap can later be increased by level/tier.

---

## 8) Point Decay (Anti-Hoarding)

Goal: encourage regular participation without forcing betting.

### Recommended V1 Rule (Simple + Strong)

- If a user **stakes 0 points in the prediction market for a given day**, their **unbet point balance** decays by **10%** at day-end.

Example:
- 1,000 points held, no bet today → 900
- Next day no bet → 810
- Over ~10 days of no betting, balance approaches near zero.

Notes:
- Apply decay only to **unbet balance** (not points currently locked in bets).
- Consider a small protected floor (optional), e.g., first 50 points never decay, to avoid punishing casuals too hard.

---

## 9) UX Screens (Minimum Needed)

### 9.1 Round Screen (10 profiles)
- List/grid of 10 profiles
- For each profile: Chad / Soy toggle or buttons
- Progress indicator: 0/10 → 10/10
- “Earned this round: X points”

### 9.2 Prediction Market Screen (Bet Slip)
- Show the 10 profiles (small cards) + their round IDs
- Three pool sections:
  - Pool A (#1 Chad): stake input + profile picker
  - Pool B (#2 Chad): stake input + profile picker
  - Pool C (#3 Chad): stake input + profile picker
- Total stake summary + “Stake placed” confirmation
- Show *estimated* current multiplier (optional), with a note: “Final payout depends on total pool at close.”

### 9.3 Results Screen
- Show ranked list of profiles with their Chad scores
- Show which profile won each pool
- User payout breakdown per pool:
  - stake, pick, result, payout
- Updated point balance

---

## 10) Data Model (Suggested)

### Entities

**Round**
- `round_id`
- `start_time`
- `end_time`
- `status` (open/closed/settled)
- `profiles[]` (10 profile IDs)

**Profile**
- `profile_id`
- `handle` / `url`
- `display_name`
- `avatar_url`
- `submission_timestamp`

**Vote**
- `round_id`
- `user_id`
- `profile_id`
- `vote` (“chad” | “soy”)
- `created_at`

**Bet**
- `bet_id`
- `round_id`
- `user_id`
- `pool` (“rank1” | “rank2” | “rank3”)
- `picked_profile_id`
- `stake_points`
- `created_at`
- `status` (active/settled/refunded)
- `payout_points` (when settled)

**Wallet / Balance**
- `user_id`
- `points_balance`
- `points_locked` (optional; or compute from active bets)
- `last_bet_date`
- `last_decay_date`

---

## 11) Settlement Algorithm (High Level)

At round end:

1. Lock votes and bets.
2. For each profile:
   - compute `chad_score`
3. Determine winners:
   - rank 1, 2, 3
4. For each pool (rank1/rank2/rank3):
   - compute `S` and `S_k`
   - if below minimums → refund or disable logic
   - else compute multiplier with fee + cap
   - for each winning bet: `payout = stake * multiplier`
   - mark bets settled and credit payouts
5. Update round status to `settled`.

Daily job (once per day):
- If user staked 0 points today → apply decay to unbet balance.

---

## 12) V1 Default Parameters (Suggested)

- `ROUND_DURATION_MINUTES = 60`
- `PROFILES_PER_ROUND = 10`
- `POINTS_PER_VOTE = 10`
- `PLATFORM_FEE = 0.05`
- `MIN_POOL = 200`
- `MIN_BETTORS = 5`
- `MAX_MULTIPLIER = 20`
- `DAILY_STAKE_CAP = 500`
- `DAILY_DECAY_RATE = 0.10` (if no bet that day)

---

## 13) Future Extensions (Optional Later)

- Add Soy pools: “#1 Soy / #2 Soy / #3 Soy”
- Add streaks/levels based on participation
- Add “featured round” vs “standard round” multipliers
- Add social pings and sharing after results
- Add anti-spam for profile submissions

---

## 14) Key Design Notes

- Keep betting **optional**.
- Keep math **transparent** (show pool totals and estimated multipliers).
- Protect early-stage gameplay with **minimum pool rules** and **multiplier caps**.
- Use point decay to prevent hoarding but keep it simple and predictable.

---
