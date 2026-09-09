# Self-Checking Query System

## Problem Solved

The app was failing to find research papers due to overly narrow search terms:
- "whole-body cryotherapy" (with hyphen) → 0 results
- But papers use "whole body cryotherapy" (no hyphen) or just "cryotherapy"
- Required manual synonym entries for every intervention

**Root cause:** System couldn't determine intent from simple variations like hyphens.

## Solution: 3-Layer Self-Checking System

### Layer 1: Automatic Normalization ✅ (Always On)

**What it does:**
- Handles hyphens: `"whole-body cryotherapy"` → `["whole-body cryotherapy", "whole body cryotherapy", "cryotherapy"]`
- Extracts base terms from multi-word phrases
- Handles plurals automatically
- **No cost, always runs, no configuration needed**

**Examples:**
```typescript
"whole-body cryotherapy" → ["whole-body cryotherapy", "whole body cryotherapy", "cryotherapy"]
"red light therapy" → ["red light therapy", "red-light-therapy", "therapy"]
"hyperbaric chamber" → ["hyperbaric chamber", "hyperbaric-chamber", "chamber", "chambers"]
```

### Layer 2: LLM Query Expansion 🤖 (Optional, Cached)

**What it does:**
- Asks LLM for intelligent expansions:
  - Spelling variations
  - Common abbreviations (WBC, HBOT, PBM)
  - Clinical/scientific synonyms
  - Related terms
- Results are **cached per intervention** (only asks LLM once)
- Falls back to Layer 1 if LLM fails

**Enable:**
```bash
export EIE_USE_LLM_QUERY_EXPANSION=true
```

**Example output:**
```json
{
  "baseTerms": ["cryotherapy"],
  "variations": ["whole body cryotherapy", "whole-body cryotherapy"],
  "abbreviations": ["WBC"],
  "clinicalSynonyms": ["cold therapy", "cryostimulation"]
}
```

### Layer 3: Query Validation ⚠️ (Optional, Non-blocking)

**What it does:**
- Validates PubMed query before execution
- Checks if query is:
  - Too narrow (overly specific phrase that misses papers)
  - Too broad (generic terms matching too much)
  - Missing important variations
- **Logs warnings but doesn't block searches**
- Suggests improvements

**Enable:**
```bash
export EIE_VALIDATE_QUERIES=true
```

**Example validation output:**
```
[Query Validation] Query may be problematic for "whole-body cryotherapy"
  Query: "whole-body cryotherapy"[tiab] AND inflammation[tiab]
  ⚠️  Too narrow - may miss relevant papers
  Suggestions: ["Add variation without hyphen", "Include abbreviation WBC"]
  Improved: ("whole-body cryotherapy"[tiab] OR "whole body cryotherapy"[tiab] OR cryotherapy[tiab]) AND inflammation[tiab]
```

## How It Works Together

### Priority Order:
1. **Folk protocols** (liver flush, colon cleanse) - highest priority
2. **Manual SUBJECT_SYNONYMS** (red light, hyperbaric, etc.) - domain expert knowledge
3. **Automatic normalization** - handles hyphens, plurals (Layer 1)
4. **Ingredient database** - supplements with scientific names
5. **LLM expansion** - when enabled, for anything not covered above (Layer 2)

### Example Flow:

**Query:** "whole-body cryotherapy reduces inflammation"

**Without LLM (Layers 1 only):**
```
Manual synonyms found: ✓ (cryotherapy in SUBJECT_SYNONYMS)
Final query: ("whole-body cryotherapy"[tiab] OR "whole body cryotherapy"[tiab] OR cryotherapy[tiab]) AND inflammation[tiab]
```

**With LLM enabled:**
```
Manual synonyms found: ✓
LLM expansion: adds ["WBC", "cold therapy", "cryostimulation"]
Validation: ✓ Query looks reasonable
Final query: ("whole-body cryotherapy"[tiab] OR "whole body cryotherapy"[tiab] OR cryotherapy[tiab] OR "cold therapy"[tiab] OR WBC[tiab]) AND inflammation[tiab]
```

## Configuration

### Environment Variables

```bash
# Enable LLM-based query expansion (adds latency, but more intelligent)
export EIE_USE_LLM_QUERY_EXPANSION=true

# Enable query validation (logs warnings, doesn't block)
export EIE_VALIDATE_QUERIES=true
```

### Recommended Setup

**Development/Testing:**
```bash
EIE_USE_LLM_QUERY_EXPANSION=true
EIE_VALIDATE_QUERIES=true
```

**Production (start conservative):**
```bash
# Layer 1 only (automatic normalization)
# No env vars needed - it's always on
```

**Production (after testing):**
```bash
EIE_USE_LLM_QUERY_EXPANSION=true
# Validation optional - only if you want logging
```

## Testing

### Test automatic normalization:
```typescript
import { autoNormalizeIntervention } from '@/lib/query-expansion';

autoNormalizeIntervention("whole-body cryotherapy");
// Returns: ["whole-body cryotherapy", "whole body cryotherapy", "cryotherapy"]
```

### Test with LLM expansion:
```typescript
import { getAllInterventionTerms } from '@/lib/query-expansion';
import { createModelRouter } from '@/engine/llm/model-router';

const router = createModelRouter();
const terms = await getAllInterventionTerms("hyperbaric chamber", router, true);
// Returns: ["hyperbaric chamber", "hyperbaric-chamber", "chamber", "HBOT", "hyperbaric oxygen therapy", ...]
```

### Test validation:
```typescript
import { validatePubMedQuery } from '@/lib/query-expansion';

const validation = await validatePubMedQuery(
  '"whole-body cryotherapy"[tiab]',
  "whole-body cryotherapy",
  router
);
// Returns: { isReasonable: false, tooNarrow: true, suggestions: [...] }
```

## Benefits

✅ **No more manual synonym entries** - system handles variations automatically
✅ **Catches hyphen issues** - "whole-body" vs "whole body" handled automatically  
✅ **Self-checking** - validates queries like a human would
✅ **Graceful fallback** - if LLM fails, still has automatic normalization
✅ **Cached** - LLM expansions only run once per unique intervention
✅ **Non-blocking** - validation logs warnings but doesn't stop searches

## Migration Notes

- Existing `SUBJECT_SYNONYMS` still work and take priority
- Automatic normalization fills gaps where manual entries don't exist
- Can enable LLM features incrementally (Layer 2, then Layer 3)
- No breaking changes - all features are additive
