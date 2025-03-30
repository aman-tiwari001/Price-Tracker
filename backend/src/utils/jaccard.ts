export function jaccardIndex(str1: string, str2: string): number {
  const stopwords = new Set([
    'fresh',
    'new',
    'best',
    'pack',
    'offer',
    'original',
    'extra',
    'large',
    'small',
    'combo',
    'premium',
    'free',
  ]);
  const synonymMap: Record<string, string> = {
    gm: 'g',
    kg: 'kilo',
    ltr: 'liter',
    ml: 'milliliter',
    choco: 'chocolate',
    coke: 'cola',
    bottle: 'pet',
    pcs: 'pieces',
    litre: 'liter',
    packet: 'pack',
    carton: 'box',
    sachet: 'pack',
    gram: 'g',
    kilogram: 'kilo',
    dozen: '12',
    half: '0.5',
    piece: 'pcs',
    cup: 'container',
    can: 'tin',
    pouch: 'bag',
    ounce: 'oz',
    quintal: '100kg',
    meter: 'm',
    centimeter: 'cm',
  };

  function normalizeQuantity(text: string): string {
    return text.replace(
      /(\d+)(\s*)(gm|g|kg|ml|ltr|l|pcs|piece|pieces|litre|packet|carton|sachet|gram|kilogram|dozen|half|cup|can|pouch|ounce|quintal|meter|centimeter)/gi,
      (_1, num, _2, unit) => {
        const normalizedUnit = synonymMap[unit.toLowerCase()] || unit.toLowerCase();
        return num + normalizedUnit;
      },
    );
  }

  function normalizeText(text: string): Set<string> {
    return new Set(
      normalizeQuantity(text.toLowerCase())
        .replace(/[^a-zA-Z0-9 ]/g, '') // Remove special characters
        .split(/\s+/) // Split into words
        .map((word) => synonymMap[word] || word) // Replace synonyms
        .filter((word) => !stopwords.has(word)), // Remove stopwords
    );
  }

  const set1 = normalizeText(str1);
  const set2 = normalizeText(str2);

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}