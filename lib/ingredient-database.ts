/**
 * Comprehensive database of herbs, supplements, and their scientific names
 * for accurate literature search in PubMed and other databases.
 */

export interface IngredientInfo {
  commonNames: string[];
  scientificName: string;
  aliases?: string[];
}

/**
 * Comprehensive mapping of supplement/herb common names to scientific names.
 * PubMed research papers typically use scientific names (botanical/Latin names)
 * rather than marketing terms or common names.
 */
export const INGREDIENT_DATABASE: Record<string, IngredientInfo> = {
  // Adaptogens
  "ashwagandha": {
    commonNames: ["ashwagandha", "indian ginseng", "winter cherry"],
    scientificName: "Withania somnifera",
  },
  "rhodiola": {
    commonNames: ["rhodiola", "golden root", "arctic root"],
    scientificName: "Rhodiola rosea",
  },
  "ginseng": {
    commonNames: ["ginseng", "asian ginseng", "korean ginseng"],
    scientificName: "Panax ginseng",
  },
  "holy basil": {
    commonNames: ["holy basil", "tulsi"],
    scientificName: "Ocimum sanctum",
  },
  "schisandra": {
    commonNames: ["schisandra", "magnolia berry"],
    scientificName: "Schisandra chinensis",
  },
  
  // Sleep & Relaxation
  "valerian": {
    commonNames: ["valerian", "valerian root"],
    scientificName: "Valeriana officinalis",
  },
  "chamomile": {
    commonNames: ["chamomile", "german chamomile"],
    scientificName: "Matricaria chamomilla",
    aliases: ["Matricaria recutita"],
  },
  "passionflower": {
    commonNames: ["passionflower", "passion flower", "maypop"],
    scientificName: "Passiflora incarnata",
  },
  "lemon balm": {
    commonNames: ["lemon balm", "melissa"],
    scientificName: "Melissa officinalis",
  },
  "lavender": {
    commonNames: ["lavender", "english lavender"],
    scientificName: "Lavandula angustifolia",
  },
  "magnolia": {
    commonNames: ["magnolia bark", "magnolia"],
    scientificName: "Magnolia officinalis",
  },
  
  // Cognitive/Nootropics
  "ginkgo": {
    commonNames: ["ginkgo", "ginkgo biloba", "maidenhair tree"],
    scientificName: "Ginkgo biloba",
  },
  "bacopa": {
    commonNames: ["bacopa", "brahmi", "water hyssop"],
    scientificName: "Bacopa monnieri",
  },
  "lion's mane": {
    commonNames: ["lion's mane", "lions mane", "yamabushitake"],
    scientificName: "Hericium erinaceus",
  },
  "gotu kola": {
    commonNames: ["gotu kola", "centella", "asiatic pennywort"],
    scientificName: "Centella asiatica",
  },
  
  // Mood & Mental Health
  "st john's wort": {
    commonNames: ["st john's wort", "st johns wort", "saint john's wort"],
    scientificName: "Hypericum perforatum",
  },
  "saffron": {
    commonNames: ["saffron", "crocus"],
    scientificName: "Crocus sativus",
  },
  "kava": {
    commonNames: ["kava", "kava kava"],
    scientificName: "Piper methysticum",
  },
  
  // Teas
  "green tea": {
    commonNames: ["green tea", "tea"],
    scientificName: "Camellia sinensis",
    aliases: ["EGCG", "epigallocatechin gallate"],
  },
  "black tea": {
    commonNames: ["black tea", "tea"],
    scientificName: "Camellia sinensis",
  },
  "jasmine tea": {
    commonNames: ["jasmine tea", "jasmine"],
    scientificName: "Camellia sinensis",
    aliases: ["Jasminum sambac", "jasmine flower"],
  },
  "oolong tea": {
    commonNames: ["oolong tea", "oolong"],
    scientificName: "Camellia sinensis",
  },
  "white tea": {
    commonNames: ["white tea"],
    scientificName: "Camellia sinensis",
  },
  "rooibos": {
    commonNames: ["rooibos", "red tea", "redbush tea"],
    scientificName: "Aspalathus linearis",
  },
  
  // Digestive
  "ginger": {
    commonNames: ["ginger", "ginger root"],
    scientificName: "Zingiber officinale",
  },
  "turmeric": {
    commonNames: ["turmeric", "curcumin"],
    scientificName: "Curcuma longa",
  },
  "peppermint": {
    commonNames: ["peppermint", "mint"],
    scientificName: "Mentha piperita",
  },
  "fennel": {
    commonNames: ["fennel"],
    scientificName: "Foeniculum vulgare",
  },
  
  // Immune/Antioxidant
  "echinacea": {
    commonNames: ["echinacea", "purple coneflower"],
    scientificName: "Echinacea purpurea",
    aliases: ["Echinacea angustifolia"],
  },
  "elderberry": {
    commonNames: ["elderberry", "elder"],
    scientificName: "Sambucus nigra",
  },
  "astragalus": {
    commonNames: ["astragalus", "huang qi"],
    scientificName: "Astragalus membranaceus",
  },
  
  // Cardiovascular
  "hawthorn": {
    commonNames: ["hawthorn", "hawthorn berry"],
    scientificName: "Crataegus monogyna",
    aliases: ["Crataegus laevigata"],
  },
  "garlic": {
    commonNames: ["garlic"],
    scientificName: "Allium sativum",
  },
  
  // Energy/Metabolism
  "guarana": {
    commonNames: ["guarana"],
    scientificName: "Paullinia cupana",
  },
  "maca": {
    commonNames: ["maca", "maca root", "peruvian ginseng"],
    scientificName: "Lepidium meyenii",
  },
  "cordyceps": {
    commonNames: ["cordyceps", "caterpillar fungus"],
    scientificName: "Cordyceps sinensis",
    aliases: ["Cordyceps militaris"],
  },
  
  // Hormonal/Reproductive
  "saw palmetto": {
    commonNames: ["saw palmetto"],
    scientificName: "Serenoa repens",
  },
  "fenugreek": {
    commonNames: ["fenugreek"],
    scientificName: "Trigonella foenum-graecum",
  },
  "tribulus": {
    commonNames: ["tribulus", "puncture vine"],
    scientificName: "Tribulus terrestris",
  },
  "black cohosh": {
    commonNames: ["black cohosh"],
    scientificName: "Actaea racemosa",
    aliases: ["Cimicifuga racemosa"],
  },
  "chasteberry": {
    commonNames: ["chasteberry", "vitex", "chaste tree"],
    scientificName: "Vitex agnus-castus",
  },
  
  // Vitamins & Amino Acids (keep existing ones)
  "l-theanine": {
    commonNames: ["l-theanine", "theanine"],
    scientificName: "L-theanine",
  },
  "melatonin": {
    commonNames: ["melatonin"],
    scientificName: "melatonin",
  },
  "caffeine": {
    commonNames: ["caffeine"],
    scientificName: "caffeine",
  },
  "5-htp": {
    commonNames: ["5-htp", "5-hydroxytryptophan"],
    scientificName: "5-hydroxytryptophan",
  },
  "l-tryptophan": {
    commonNames: ["l-tryptophan", "tryptophan"],
    scientificName: "tryptophan",
  },
  "gaba": {
    commonNames: ["gaba", "gamma-aminobutyric acid"],
    scientificName: "gamma-aminobutyric acid",
  },
};

/**
 * Find ingredient info by searching common names and variations.
 * Case-insensitive, handles plurals and common variations.
 * 
 * STRICT MATCHING: Returns null unless there's a clear, specific match.
 * Avoids spurious matches for non-ingredient interventions.
 */
export function findIngredient(text: string): IngredientInfo | null {
  const normalized = text.toLowerCase().trim()
    .replace(/\bsupplement(s)?\b/gi, "")
    .replace(/\bextract(s)?\b/gi, "")
    .replace(/\broot(s)?\b/gi, "")
    .replace(/\bleaf|leaves\b/gi, "")
    .replace(/\bberry|berries\b/gi, "")
    .trim();
  
  // Must be at least 4 characters to avoid spurious matches
  if (normalized.length < 4) return null;
  
  // Direct lookup (exact match)
  if (INGREDIENT_DATABASE[normalized]) {
    return INGREDIENT_DATABASE[normalized];
  }
  
  // Search through all entries - but require SUBSTANTIAL overlap
  for (const [key, info] of Object.entries(INGREDIENT_DATABASE)) {
    // For short queries, require exact match
    if (normalized.length <= 6 && normalized !== key) {
      continue;
    }
    
    // Check if normalized text contains the key OR vice versa
    // But require the match to be at least 70% of the shorter string
    const matchesKey = normalized.includes(key) || key.includes(normalized);
    if (matchesKey) {
      const shorter = Math.min(normalized.length, key.length);
      const longer = Math.max(normalized.length, key.length);
      // If the match is too loose (e.g., "dance" vs "elderberry"), skip it
      if (shorter / longer < 0.5) continue;
      return info;
    }
    
    // Check common names with same strictness
    for (const commonName of info.commonNames) {
      const matchesCommon = normalized.includes(commonName.toLowerCase()) || 
                           commonName.toLowerCase().includes(normalized);
      if (matchesCommon) {
        const shorter = Math.min(normalized.length, commonName.length);
        const longer = Math.max(normalized.length, commonName.length);
        if (shorter / longer < 0.5) continue;
        return info;
      }
    }
    
    // Check scientific name (partial match) - must be highly specific
    const scientificLower = info.scientificName.toLowerCase();
    if (scientificLower === normalized || normalized === scientificLower) {
      return info;
    }
  }
  
  return null;
}

/**
 * Get all search terms (common + scientific names) for an ingredient.
 * Returns terms suitable for OR-ing together in a PubMed search.
 */
export function getIngredientSearchTerms(text: string): string[] {
  const info = findIngredient(text);
  if (!info) return [text.trim()];
  
  const terms = new Set<string>();
  
  // Add scientific name (most important for PubMed)
  terms.add(info.scientificName);
  
  // Add primary common name
  terms.add(info.commonNames[0]);
  
  // Add aliases if present
  if (info.aliases) {
    for (const alias of info.aliases) {
      terms.add(alias);
    }
  }
  
  return [...terms];
}
