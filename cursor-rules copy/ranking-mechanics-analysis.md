# Ranking Mechanics Analysis: Weighted Chad Score + Bet-Based Tie-Breakers

## Overview

This document analyzes the proposed new ranking system against the current implementation, identifying improvements, potential issues, and integration considerations.

---

## Current Implementation

### Ranking Algorithm
- **Primary metric**: `chad_score = chad_votes / total_votes` (simple ratio)
- **Tie-breakers** (in order):
  1. `chad_score` (descending)
  2. `total_votes` (descending)
  3. `profile_id` (alphabetical)

### Issues with Current System
1. **Low-vote vulnerability**: A profile with 1 chad vote and 0 soy votes gets 100% chad_score, ranking equal to a profile with 100 chad votes and 0 soy votes
2. **No vote smoothing**: Early votes can dominate rankings unfairly
3. **Bets don't influence ranking**: Betting data is completely separate from ranking logic
4. **Limited tie-breaking**: Only uses vote counts and profile ID

---

## Proposed New System

### Core Changes

#### 1. Weighted Chad Score (Bayesian Smoothing)
```
weightedChad = p * (n / (n + K))
where:
  p = chad_votes / (chad_votes + soy_votes)  [chad ratio]
  n = total_votes
  K = smoothing constant (default: 10)
```

**Analysis**: ✅ **Excellent improvement**
- Addresses the low-vote-count problem directly
- A profile with 1 vote gets weighted ~0.09 (1/11), while 100 votes gets ~0.91 (100/110)
- Prevents early single votes from dominating
- The `K` parameter provides a tuning knob for conservatism

#### 2. Enhanced Tie-Breaking Hierarchy
New order:
1. `weightedChad` (descending)
2. `totalVotes` (descending)
3. `uniqueBettors` (descending) ⭐ NEW
4. `cappedBetVolume` (descending) ⭐ NEW
5. `profileId` (ascending) - stable fallback

**Note**: Timestamp removed per user feedback - not needed for fair ranking.

**Analysis**: ✅ **Good strategic addition**
- Bet-based tie-breakers create interesting game dynamics
- Users betting on a profile can help it win ties
- Capped bet volume prevents whale manipulation
- Creates a feedback loop: betting → better ranking → more betting

#### 3. Bet-Based Tie-Break Metrics
- **uniqueBettors**: Count of distinct users who bet on a profile (across rank1/rank2/rank3 pools)
- **cappedBetVolume**: Sum of min(userStake, capPerUser) per user
- **onlyChadPoolsForTieBreak**: Option to exclude soy pools from tie-break calculations

**Analysis**: ✅ **Well-designed**
- The cap prevents one whale from dominating tie-breaks
- Counting unique bettors rewards broader support
- Option to exclude soy pools makes sense (focuses on Chad ranking)

#### 4. Minimum Votes Eligibility
Optional filter: `minVotesForEligibility` prevents profiles with very few votes from being top3

**Analysis**: ⚠️ **Useful but needs careful tuning**
- Good safeguard against edge cases
- Default of 0 is reasonable (let the weighted score handle it)
- Should be documented clearly for users

---

## Compatibility Analysis

### ✅ What Works Well

1. **Database Schema**: 
   - Votes table has all needed fields (`chad_votes`, `soy_votes`, `total_votes`)
   - Bets table has all needed fields (`user_id`, `profile_id`, `pool`, `stake_points`)
   - Profiles table has `created_at` (can be used for `submissionTimestamp`)

2. **Current Code Structure**:
   - `calculateRoundRankings()` in `settlement-helpers.ts` can be refactored
   - `settleRound()` already calls ranking calculation
   - Bet data is already queried separately

3. **Type Safety**:
   - The TypeScript types in the proposal match existing patterns
   - Pool types match existing `'rank1' | 'rank2' | 'rank3'`

### ⚠️ Integration Considerations

1. **Submission Timestamp**: 
   - **Update**: Removed per user feedback - not needed for fair ranking
   - ProfileId serves as final deterministic tie-breaker

2. **Vote Tallying**:
   - Current code uses SQL aggregation (`COUNT(CASE WHEN...)`)
   - Proposal expects pre-aggregated `VoteTally[]` array
   - **Solution**: Easy to convert - the SQL query already produces this structure

3. **Bet Data Structure**:
   - Current `Bet` type matches proposal's `Bet` type closely
   - Need to ensure we're querying bets for the correct round
   - **Solution**: Already handled in `getPoolStats()` - can reuse logic

4. **Ranking Interface**:
   - Current `ProfileRanking` interface is simpler
   - Proposal's `ProfileRankMetrics` is more comprehensive
   - **Solution**: Extend `ProfileRanking` or create new interface

---

## Potential Issues & Edge Cases

### 1. Bet Manipulation Risk ⚠️
**Issue**: Users could strategically bet small amounts on profiles to help them win ties, creating a meta-game around tie-breaking rather than voting.

**Mitigation**: 
- The `capPerUser` already limits this
- Tie-breaks only matter when `weightedChad` and `totalVotes` are equal (rare)
- This is actually a feature, not a bug - creates strategic depth

### 2. Circular Dependencies 🤔
**Issue**: Betting influences ranking, but users bet based on expected ranking. Could create feedback loops.

**Analysis**: 
- This is intentional and creates interesting dynamics
- The weighted score still dominates (tie-breaks are secondary)
- Users betting on a profile signals confidence, which is valuable information

### 3. Performance Considerations
**Issue**: Computing bet metrics for every profile requires aggregating bet data.

**Analysis**: 
- Current `getPoolStats()` already does similar aggregation
- Can optimize with a single query that groups by profile_id
- Should be fine for 10 profiles per round

### 4. Zero Votes Edge Case
**Issue**: Profile with 0 votes gets `weightedChad = 0`, which is correct, but needs handling.

**Analysis**: 
- Proposal handles this correctly: `if (n <= 0) return { p: 0, weighted: 0, n: 0 }`
- Profiles with 0 votes will rank last (as expected)

### 5. No Winner Determined ⭐ NEW
**Issue**: In early testing with single voter, or when top 3 are tied on all meaningful metrics (excluding profileId), we can't fairly determine winners.

**Solution**: 
- Added `winnersDetermined` flag to `rankRoundAndSelectTop3()` return value
- When `winnersDetermined === false`, all bets are refunded (no payouts, no losses)
- Uses `areProfilesTied()` helper to detect when profiles are tied on all metrics except profileId
- Prevents unfair outcomes when relying on arbitrary profileId to break ties

---

## Recommendations

### ✅ Implement As-Is
The proposal is well-thought-out and addresses real issues with the current system. The weighted score is a significant improvement, and bet-based tie-breakers add strategic depth.

### 🔧 Minor Adjustments Needed

1. **Submission Timestamp**: 
   - ✅ **Removed** - Not needed for fair ranking
   - ProfileId serves as final deterministic tie-breaker

2. **No Winner Determined Handling**:
   - ✅ **Added** - `winnersDetermined` flag and `refundAllBets()` function
   - When top 3 are tied on all meaningful metrics, refund all bets

3. **Default Configuration**:
   - `K = 10` seems reasonable (needs testing)
   - `capPerUser = 200` is good (prevents whale manipulation)
   - `minVotesForEligibility = 0` is fine (let weighted score handle it)

3. **Code Organization**:
   - Create new file: `lib/ranking-helpers.ts` for pure ranking functions
   - Keep `settlement-helpers.ts` for database operations
   - This matches the proposal's "pure functions, no dependencies" approach

### 📝 Documentation Updates Needed

1. Update `chad_vs_soy_parimutuel_v1_spec.md` section 4 (Determining Winners)
2. Add explanation of weighted score to user-facing docs
3. Document tie-break hierarchy clearly

---

## Implementation Plan

### Phase 1: Core Ranking Logic
1. Create `lib/ranking-helpers.ts` with pure functions from proposal
2. Add TypeScript types matching proposal
3. Implement `computeWeightedChad()`, `computeBetTieBreaks()`, `buildRankMetrics()`, `compareProfiles()`, `rankRoundAndSelectTop3()`

### Phase 2: Integration
1. Refactor `calculateRoundRankings()` to use new ranking functions
2. Update `settleRound()` to use `rankRoundAndSelectTop3()`
3. Update `getRoundLeaderboard()` to use new ranking logic

### Phase 3: Testing
1. Test edge cases (0 votes, ties, etc.)
2. Verify bet-based tie-breaks work correctly
3. Performance test with realistic data

### Phase 4: Configuration
1. Add config constants (K, capPerUser, etc.)
2. Make configurable via environment variables or admin panel
3. Document configuration options

---

## Conclusion

**Verdict**: ✅ **Implement this proposal**

The new ranking system is a significant improvement that:
- Fixes the low-vote-count vulnerability
- Adds strategic depth through bet-based tie-breakers
- Maintains backward compatibility (same inputs, better outputs)
- Is well-designed with proper safeguards (caps, configurable parameters)

The proposal is production-ready and can be integrated with minimal changes to existing code.

---

## Questions for Discussion

1. **K value tuning**: Should K be configurable per round, or fixed globally?
2. **Bet pools**: Should soy pools (`soy_rank1`, etc.) be included in tie-breaks if they exist?
3. **Minimum votes**: Should `minVotesForEligibility` be exposed to users, or hidden?
4. **No winner handling**: Should we log or notify users when a round results in "no winner determined"?
