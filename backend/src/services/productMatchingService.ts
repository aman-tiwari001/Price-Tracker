/**
 * Clubs the SAME product across platforms so a shopper can compare one item's price everywhere.
 *
 * The governing principle is **prefer under-merging to over-merging**. Two rows for what is really
 * one product is a mild annoyance; one row claiming Amul Gold costs ₹31 because it was merged with
 * Amul Taaza is a lie, and the comparison is the only thing this app sells. Every rule below is
 * biased towards refusing an uncertain merge.
 *
 * Pipeline, in execution order:
 *   1. normaliseForMatching — brand, quantity in a base unit, pack count, descriptor tokens
 *   2. blocking            — only products with an identical (unit class, quantity, pack count)
 *                            can possibly be the same item, which is exact and kills ~95% of pairs
 *   3. scoring             — brand is a hard gate; descriptors are compared with rarer words
 *                            weighted higher; a wild price spread blocks the merge
 *   4. clustering          — union-find, capped at one product per platform per group
 *   5. emit                — canonical name/image plus one offer row per platform
 *
 * Deliberately NOT used: embeddings or an LLM. ~100 products per search would add real cost and
 * latency, and the result would be non-deterministic — a price comparison has to be explainable
 * ("matched on brand + size + name"). Worth revisiting only as a tie-breaker for the uncertain band.
 */
import { NormalizedProduct, PlatformId, PlatformSearchResult } from '../platforms/types';

/** What kind of thing the pack size measures. Volume is never comparable to mass. */
export type QuantityUnitClass = 'volume' | 'mass' | 'count' | 'unknown';

export interface MatchedPlatformOffer {
  platformId: PlatformId;
  platformDisplayName: string;
  productName: string;
  packSizeLabel: string | null;
  sellingPriceInRupees: number | null;
  maximumRetailPriceInRupees: number | null;
  discountPercentage: number | null;
  deliveryEtaInMinutes: number | null;
  checkIfInStock: boolean;
  imageUrl: string | null;
  productWebUrl: string | null;
  /** True for the cheapest in-stock offer in this group. */
  checkIfCheapest: boolean;
}

export interface MatchedProductGroup {
  groupKey: string;
  canonicalProductName: string;
  brandName: string | null;
  packSizeLabel: string | null;
  quantityInBaseUnit: number | null;
  unitClass: QuantityUnitClass;
  packCount: number;
  imageUrl: string | null;
  offerList: MatchedPlatformOffer[];
  /** How many distinct platforms carry this product. 1 means nothing to compare yet. */
  platformCount: number;
  cheapestPriceInRupees: number | null;
  dearestPriceInRupees: number | null;
  /** What the shopper saves by buying from the cheapest platform instead of the dearest. */
  maximumSavingInRupees: number | null;
  /** 0-1. The weakest pairwise score inside the group, so one shaky link lowers the whole group. */
  matchConfidence: number;
}

/** Words that carry no identity — they appear on almost every listing. */
const STOPWORD_SET = new Set([
  'fresh', 'new', 'best', 'offer', 'original', 'extra', 'combo', 'premium', 'free', 'pack',
  'packet', 'of', 'the', 'and', 'with', 'for', 'a', 'an', 'in', 'buy', 'online', 'value',
  'shelf', 'life', 'days', 'day', 'get', 'save', 'special',
]);

/**
 * Packaging words. Kept out of the identity comparison because platforms describe the same carton
 * differently ("Tetra Pack", "Carton", "Pouch"), but they are NOT stopwords — a pouch and a tetra
 * pack of the same milk really are different SKUs, so they are scored as a weak signal instead.
 */
const PACKAGING_TOKEN_SET = new Set([
  'tetra', 'carton', 'pouch', 'bottle', 'can', 'tin', 'box', 'jar', 'sachet', 'pet', 'cup',
  'container', 'bag', 'refill', 'polypack',
]);

/** Unit spellings each platform uses, mapped to a base unit and what it measures. */
const UNIT_DEFINITION_MAP: Record<string, { unitClass: QuantityUnitClass; multiplierToBase: number }> = {
  ml: { unitClass: 'volume', multiplierToBase: 1 },
  millilitre: { unitClass: 'volume', multiplierToBase: 1 },
  l: { unitClass: 'volume', multiplierToBase: 1000 },
  lt: { unitClass: 'volume', multiplierToBase: 1000 },
  ltr: { unitClass: 'volume', multiplierToBase: 1000 },
  litre: { unitClass: 'volume', multiplierToBase: 1000 },
  liter: { unitClass: 'volume', multiplierToBase: 1000 },
  g: { unitClass: 'mass', multiplierToBase: 1 },
  gm: { unitClass: 'mass', multiplierToBase: 1 },
  gms: { unitClass: 'mass', multiplierToBase: 1 },
  gram: { unitClass: 'mass', multiplierToBase: 1 },
  grams: { unitClass: 'mass', multiplierToBase: 1 },
  kg: { unitClass: 'mass', multiplierToBase: 1000 },
  kgs: { unitClass: 'mass', multiplierToBase: 1000 },
  kilogram: { unitClass: 'mass', multiplierToBase: 1000 },
  piece: { unitClass: 'count', multiplierToBase: 1 },
  pieces: { unitClass: 'count', multiplierToBase: 1 },
  pc: { unitClass: 'count', multiplierToBase: 1 },
  pcs: { unitClass: 'count', multiplierToBase: 1 },
  unit: { unitClass: 'count', multiplierToBase: 1 },
  units: { unitClass: 'count', multiplierToBase: 1 },
  n: { unitClass: 'count', multiplierToBase: 1 },
  dozen: { unitClass: 'count', multiplierToBase: 12 },
};

interface ParsedQuantity {
  quantityInBaseUnit: number | null;
  unitClass: QuantityUnitClass;
  packCount: number;
}

/**
 * Reads a pack size into a comparable number.
 *
 * Every platform writes it differently — Blinkit "1 ltr", BigBasket "1 L", Zepto "1 pack (500 ml)",
 * Swiggy "500 ml x 4", Amazon embeds it in the title ("Toned Milk, 500 Ml"). All must land on the
 * same value or the blocking step silently splits identical products apart.
 *
 * `packCount` is kept separate on purpose: 4×500 ml and 1×2 L both total 2000 ml but are different
 * purchases, so they must not be clubbed.
 */
export const parseQuantity = (rawPackSizeLabel: string | null): ParsedQuantity => {
  const emptyResult: ParsedQuantity = { quantityInBaseUnit: null, unitClass: 'unknown', packCount: 1 };
  if (!rawPackSizeLabel) return emptyResult;

  const normalisedLabel = rawPackSizeLabel.toLowerCase().replace(/[,]/g, ' ').trim();

  // "500 ml x 4" / "4 x 500 ml" / "500ml*4" — a multipack.
  const multipackMatch =
    normalisedLabel.match(/(\d+\.?\d*)\s*([a-z]+)\s*[x*]\s*(\d+)\b/) ??
    normalisedLabel.match(/(\d+)\s*[x*]\s*(\d+\.?\d*)\s*([a-z]+)/);
  if (multipackMatch) {
    // The two patterns put value/unit/count in different groups; detect which matched by checking
    // whether the middle capture is a unit name.
    const isValueFirst = Boolean(UNIT_DEFINITION_MAP[multipackMatch[2]]);
    const value = Number.parseFloat(isValueFirst ? multipackMatch[1] : multipackMatch[2]);
    const unitToken = isValueFirst ? multipackMatch[2] : multipackMatch[3];
    const packCount = Number.parseInt(isValueFirst ? multipackMatch[3] : multipackMatch[1], 10);
    const unitDefinition = UNIT_DEFINITION_MAP[unitToken];
    if (unitDefinition && Number.isFinite(value) && Number.isFinite(packCount)) {
      return {
        quantityInBaseUnit: Math.round(value * unitDefinition.multiplierToBase),
        unitClass: unitDefinition.unitClass,
        packCount,
      };
    }
  }

  // "1 pack (500 ml)" — Zepto wraps the real size in brackets; read what is inside.
  const bracketedMatch = normalisedLabel.match(/\((\d+\.?\d*)\s*([a-z]+)\)/);
  const plainMatch = normalisedLabel.match(/(\d+\.?\d*)\s*([a-z]+)/);
  const chosenMatch = bracketedMatch ?? plainMatch;
  if (!chosenMatch) return emptyResult;

  const value = Number.parseFloat(chosenMatch[1]);
  const unitDefinition = UNIT_DEFINITION_MAP[chosenMatch[2]];
  if (!unitDefinition || !Number.isFinite(value)) return emptyResult;

  return {
    quantityInBaseUnit: Math.round(value * unitDefinition.multiplierToBase),
    unitClass: unitDefinition.unitClass,
    packCount: 1,
  };
};

/** Pulls a pack size out of a product title, for platforms that do not send one separately. */
const parseQuantityFromProductName = (productName: string): ParsedQuantity => {
  const match = productName
    .toLowerCase()
    .match(/(\d+\.?\d*)\s*(ml|l|ltr|litre|liter|g|gm|gms|kg|pcs|pieces|piece)\b/);
  return match ? parseQuantity(`${match[1]} ${match[2]}`) : { quantityInBaseUnit: null, unitClass: 'unknown', packCount: 1 };
};

interface MatchableProduct {
  product: NormalizedProduct;
  platformDisplayName: string;
  brandToken: string | null;
  quantityInBaseUnit: number | null;
  unitClass: QuantityUnitClass;
  packCount: number;
  descriptorTokenList: string[];
  packagingTokenList: string[];
}

const tokenise = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Turns one product into the shape the matcher compares.
 *
 * The brand is taken from the platform's own field when present. When it is missing — BigBasket
 * often sends bare "Cow Milk" with no brand — the product is left brand-less rather than guessed,
 * and the scoring step then demands a stronger name match before merging.
 */
const normaliseForMatching = (
  product: NormalizedProduct,
  platformDisplayName: string,
): MatchableProduct => {
  const parsedFromLabel = parseQuantity(product.packSizeLabel);
  const parsedQuantity =
    parsedFromLabel.quantityInBaseUnit !== null
      ? parsedFromLabel
      : parseQuantityFromProductName(product.productName);

  const brandToken = product.brandName ? tokenise(product.brandName).join(' ') || null : null;
  const brandTokenSet = new Set(brandToken ? brandToken.split(' ') : []);

  const nameTokenList = tokenise(product.productName).filter(
    (token) =>
      !STOPWORD_SET.has(token) &&
      !brandTokenSet.has(token) &&
      // Drop tokens that are purely the pack size repeated inside the title.
      !/^\d+(\.\d+)?$/.test(token) &&
      !UNIT_DEFINITION_MAP[token],
  );

  return {
    product,
    platformDisplayName,
    brandToken,
    quantityInBaseUnit: parsedQuantity.quantityInBaseUnit,
    unitClass: parsedQuantity.unitClass,
    packCount: parsedQuantity.packCount,
    descriptorTokenList: nameTokenList.filter((token) => !PACKAGING_TOKEN_SET.has(token)),
    packagingTokenList: nameTokenList.filter((token) => PACKAGING_TOKEN_SET.has(token)),
  };
};

/**
 * Blocking key: only products sharing this key are ever compared.
 *
 * Exact equality on normalised quantity is the cheapest possible filter and it is safe — two
 * different sizes are never the same product. Products whose size could not be parsed get their own
 * key so they are never merged into a sized group on name alone.
 */
const buildBlockingKey = (matchable: MatchableProduct): string =>
  matchable.quantityInBaseUnit === null
    ? `unsized:${matchable.product.productKey}`
    : `${matchable.unitClass}:${matchable.quantityInBaseUnit}:${matchable.packCount}`;

/**
 * Inverse document frequency per token, computed over this search's own results.
 *
 * Without it, "milk" — which every row in a milk search contains — would count as much as "lactose",
 * and two unrelated milks would look similar. Weighting by rarity makes the distinguishing word
 * dominate, which is exactly the word a shopper reads to tell two SKUs apart.
 */
const buildTokenWeightMap = (matchableList: MatchableProduct[]): Map<string, number> => {
  const documentCountByToken = new Map<string, number>();
  matchableList.forEach((matchable) => {
    new Set(matchable.descriptorTokenList).forEach((token) => {
      documentCountByToken.set(token, (documentCountByToken.get(token) ?? 0) + 1);
    });
  });
  const totalDocuments = Math.max(matchableList.length, 1);
  const weightByToken = new Map<string, number>();
  documentCountByToken.forEach((documentCount, token) => {
    weightByToken.set(token, Math.log(totalDocuments / documentCount) + 1);
  });
  return weightByToken;
};

/** Weighted overlap of two token lists: shared weight divided by total weight. */
const scoreTokenSimilarity = (
  leftTokenList: string[],
  rightTokenList: string[],
  weightByToken: Map<string, number>,
): number => {
  const leftSet = new Set(leftTokenList);
  const rightSet = new Set(rightTokenList);
  if (leftSet.size === 0 && rightSet.size === 0) return 1;
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let sharedWeight = 0;
  let totalWeight = 0;
  new Set([...leftSet, ...rightSet]).forEach((token) => {
    const weight = weightByToken.get(token) ?? 1;
    totalWeight += weight;
    if (leftSet.has(token) && rightSet.has(token)) sharedWeight += weight;
  });
  return totalWeight === 0 ? 0 : sharedWeight / totalWeight;
};

/** Merges are only made at or above this score. Tuned to under-merge rather than over-merge. */
const MATCH_SCORE_THRESHOLD = 0.62;
/** Both brands known and different means "never the same product", whatever the names say. */
const BRAND_MISMATCH_SCORE = 0;
/** A price gap this large inside a candidate pair means we matched two different things. */
const IMPLAUSIBLE_PRICE_RATIO = 3;
/**
 * A name match at or above this is strong enough to believe a large price gap is a real deal.
 * Below it, a large gap is more likely to mean we matched two different variants.
 */
const CONFIDENT_NAME_SCORE = 0.8;
/**
 * The biggest price gap a WEAK name match is allowed to carry, as a ratio.
 *
 * Why this rule exists: Swiggy's "Amul Taaza Milk 1 Ltr" at ₹56 was being clubbed with the ₹77
 * "Amul Taaza Homogenised Toned Milk (Tetra Pack)" on three other platforms — a 37 % gap presented
 * as "save ₹21". The names overlap on {amul, taaza, milk} but Swiggy's lacks "homogenised" and
 * "toned", and a 1 L fresh pouch genuinely is a different product from a 1 L tetra pack at a
 * different price. Coupling the two signals catches that: a big gap needs a strong name to justify
 * it, and a weak name needs the prices to agree.
 */
const WEAK_MATCH_MAXIMUM_PRICE_RATIO = 1.25;

/**
 * Scores one candidate pair. Returns 0 to refuse the merge outright.
 *
 * Order matters: the cheap hard gates run before the weighted comparison, so a brand clash or an
 * impossible price gap costs nothing to reject.
 */
export const scoreProductPair = (
  left: MatchableProduct,
  right: MatchableProduct,
  weightByToken: Map<string, number>,
): number => {
  // Same platform: never club a platform's own two SKUs together — the whole point is one row per
  // platform, and two rows from one platform are genuinely different products.
  if (left.product.platformId === right.product.platformId) return 0;

  if (left.brandToken && right.brandToken && left.brandToken !== right.brandToken) {
    return BRAND_MISMATCH_SCORE;
  }

  const leftPrice = left.product.pricing.sellingPriceInRupees;
  const rightPrice = right.product.pricing.sellingPriceInRupees;
  const priceRatio =
    leftPrice !== null && rightPrice !== null && leftPrice > 0 && rightPrice > 0
      ? Math.max(leftPrice, rightPrice) / Math.min(leftPrice, rightPrice)
      : null;
  if (priceRatio !== null && priceRatio > IMPLAUSIBLE_PRICE_RATIO) return 0;

  const descriptorScore = scoreTokenSimilarity(
    left.descriptorTokenList,
    right.descriptorTokenList,
    weightByToken,
  );

  // A weak name match cannot carry a large price gap — see WEAK_MATCH_MAXIMUM_PRICE_RATIO.
  if (
    priceRatio !== null &&
    descriptorScore < CONFIDENT_NAME_SCORE &&
    priceRatio > WEAK_MATCH_MAXIMUM_PRICE_RATIO
  ) {
    return 0;
  }

  // Packaging agreement is a weak nudge, never decisive: platforms often omit it entirely.
  const packagingScore =
    left.packagingTokenList.length === 0 || right.packagingTokenList.length === 0
      ? 0.5
      : scoreTokenSimilarity(left.packagingTokenList, right.packagingTokenList, weightByToken);

  // A shared, explicitly-stated brand is strong evidence; one missing brand is neutral.
  const brandScore = left.brandToken && right.brandToken ? 1 : 0.5;

  return descriptorScore * 0.7 + brandScore * 0.2 + packagingScore * 0.1;
};

/** Minimal union-find over array indices, used to turn accepted pairs into groups. */
const buildDisjointSet = (size: number) => {
  const parentIndexList = Array.from({ length: size }, (_, index) => index);
  const findRoot = (index: number): number => {
    let current = index;
    while (parentIndexList[current] !== current) {
      parentIndexList[current] = parentIndexList[parentIndexList[current]];
      current = parentIndexList[current];
    }
    return current;
  };
  return {
    findRoot,
    union: (leftIndex: number, rightIndex: number): void => {
      const leftRoot = findRoot(leftIndex);
      const rightRoot = findRoot(rightIndex);
      if (leftRoot !== rightRoot) parentIndexList[rightRoot] = leftRoot;
    },
  };
};

const buildPlatformOffer = (
  matchable: MatchableProduct,
  checkIfCheapest: boolean,
): MatchedPlatformOffer => ({
  platformId: matchable.product.platformId,
  platformDisplayName: matchable.platformDisplayName,
  productName: matchable.product.productName,
  packSizeLabel: matchable.product.packSizeLabel,
  sellingPriceInRupees: matchable.product.pricing.sellingPriceInRupees,
  maximumRetailPriceInRupees: matchable.product.pricing.maximumRetailPriceInRupees,
  discountPercentage: matchable.product.pricing.discountPercentage,
  deliveryEtaInMinutes: matchable.product.deliveryEtaInMinutes,
  checkIfInStock: matchable.product.checkIfInStock,
  imageUrl: matchable.product.imageUrlList[0] ?? null,
  productWebUrl: matchable.product.productWebUrl,
  checkIfCheapest,
});

/**
 * Clubs every platform's products into cross-platform groups.
 *
 * Groups are returned with the most-compared first (a product available on four platforms is more
 * useful than one available on one), then by biggest saving.
 */
export const buildMatchedProductGroupList = (
  platformResultList: PlatformSearchResult[],
): MatchedProductGroup[] => {
  const matchableList: MatchableProduct[] = [];
  platformResultList.forEach((platformResult) => {
    platformResult.productList.forEach((product) => {
      // Sponsored rows are advertising, not search results — clubbing them would put an unrelated
      // advert into a real product's price comparison.
      if (product.checkIfSponsored) return;
      matchableList.push(normaliseForMatching(product, platformResult.platformDisplayName));
    });
  });
  if (matchableList.length === 0) return [];

  const weightByToken = buildTokenWeightMap(matchableList);

  // Compare only within blocks.
  const indexListByBlockingKey = new Map<string, number[]>();
  matchableList.forEach((matchable, index) => {
    const blockingKey = buildBlockingKey(matchable);
    const existingList = indexListByBlockingKey.get(blockingKey);
    if (existingList) existingList.push(index);
    else indexListByBlockingKey.set(blockingKey, [index]);
  });

  const disjointSet = buildDisjointSet(matchableList.length);
  const scoreByPairKey = new Map<string, number>();

  indexListByBlockingKey.forEach((indexList) => {
    for (let leftPosition = 0; leftPosition < indexList.length; leftPosition += 1) {
      for (let rightPosition = leftPosition + 1; rightPosition < indexList.length; rightPosition += 1) {
        const leftIndex = indexList[leftPosition];
        const rightIndex = indexList[rightPosition];
        const pairScore = scoreProductPair(
          matchableList[leftIndex],
          matchableList[rightIndex],
          weightByToken,
        );
        if (pairScore >= MATCH_SCORE_THRESHOLD) {
          disjointSet.union(leftIndex, rightIndex);
          scoreByPairKey.set(`${leftIndex}:${rightIndex}`, pairScore);
        }
      }
    }
  });

  const memberIndexListByRoot = new Map<number, number[]>();
  matchableList.forEach((_, index) => {
    const rootIndex = disjointSet.findRoot(index);
    const existingList = memberIndexListByRoot.get(rootIndex);
    if (existingList) existingList.push(index);
    else memberIndexListByRoot.set(rootIndex, [index]);
  });

  const groupList: MatchedProductGroup[] = [];
  memberIndexListByRoot.forEach((memberIndexList, rootIndex) => {
    // Keep at most one product per platform: the one whose name is closest to the group's longest
    // description, approximated by the richest (most descriptive) title.
    const bestMemberByPlatformId = new Map<PlatformId, MatchableProduct>();
    memberIndexList.forEach((memberIndex) => {
      const candidate = matchableList[memberIndex];
      const existing = bestMemberByPlatformId.get(candidate.product.platformId);
      if (!existing || candidate.descriptorTokenList.length > existing.descriptorTokenList.length) {
        bestMemberByPlatformId.set(candidate.product.platformId, candidate);
      }
    });
    const memberList = [...bestMemberByPlatformId.values()];

    const inStockPriceList = memberList
      .filter((member) => member.product.checkIfInStock)
      .map((member) => member.product.pricing.sellingPriceInRupees)
      .filter((price): price is number => price !== null && price > 0);
    const cheapestPriceInRupees = inStockPriceList.length ? Math.min(...inStockPriceList) : null;
    const dearestPriceInRupees = inStockPriceList.length ? Math.max(...inStockPriceList) : null;

    // The group is only as trustworthy as its weakest accepted link.
    const pairScoreList = [...scoreByPairKey.entries()]
      .filter(([pairKey]) =>
        pairKey.split(':').every((indexText) => disjointSet.findRoot(Number(indexText)) === rootIndex),
      )
      .map(([, pairScore]) => pairScore);
    const matchConfidence = pairScoreList.length ? Math.min(...pairScoreList) : 1;

    // The longest title is the most descriptive, and reads best as the group's heading.
    const canonicalMember = memberList.reduce((best, candidate) =>
      candidate.product.productName.length > best.product.productName.length ? candidate : best,
    );

    groupList.push({
      groupKey: canonicalMember.product.productKey,
      canonicalProductName: canonicalMember.product.productName,
      brandName: memberList.find((member) => member.product.brandName)?.product.brandName ?? null,
      packSizeLabel:
        memberList.find((member) => member.product.packSizeLabel)?.product.packSizeLabel ?? null,
      quantityInBaseUnit: canonicalMember.quantityInBaseUnit,
      unitClass: canonicalMember.unitClass,
      packCount: canonicalMember.packCount,
      imageUrl: memberList.find((member) => member.product.imageUrlList[0])?.product.imageUrlList[0] ?? null,
      offerList: memberList
        .map((member) =>
          buildPlatformOffer(
            member,
            member.product.checkIfInStock &&
              member.product.pricing.sellingPriceInRupees === cheapestPriceInRupees &&
              cheapestPriceInRupees !== null,
          ),
        )
        .sort(
          (left, right) =>
            (left.sellingPriceInRupees ?? Number.MAX_SAFE_INTEGER) -
            (right.sellingPriceInRupees ?? Number.MAX_SAFE_INTEGER),
        ),
      platformCount: memberList.length,
      cheapestPriceInRupees,
      dearestPriceInRupees,
      maximumSavingInRupees:
        cheapestPriceInRupees !== null && dearestPriceInRupees !== null
          ? Math.round((dearestPriceInRupees - cheapestPriceInRupees) * 100) / 100
          : null,
      matchConfidence: Math.round(matchConfidence * 100) / 100,
    });
  });

  return groupList.sort((left, right) => {
    if (right.platformCount !== left.platformCount) return right.platformCount - left.platformCount;
    return (right.maximumSavingInRupees ?? 0) - (left.maximumSavingInRupees ?? 0);
  });
};
