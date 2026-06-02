// Bilingual phrase pools for rotating UI hints (catalog search + recommendations).

// Catalog free-text search phrases (the kind you'd type in the search box).
export const SEARCH_PHRASES = {
  ru: [
    'двушка у метро', 'дом с садом', 'студия в центре', 'квартира с балконом',
    'светлая с панорамным видом', 'тихий зелёный двор', 'рядом со школой', 'у воды',
    'просторная для семьи', 'с современным ремонтом', 'лофт с высокими потолками',
    'трёшка с двумя санузлами', 'видовая на последнем этаже', 'у парка', 'рядом с метро и парковкой',
    'уютная для пары', 'коммерция под кафе', 'апартаменты с террасой', 'дом у леса',
    'кирпичный дом, тёплый', 'новостройка с отделкой', 'для удалённой работы', 'с гардеробной',
    'недорого, но в центре', 'пентхаус с видом на город', 'таунхаус с гаражом', 'мансарда с окнами в крышу',
    'у реки с причалом', 'минимализм и свет', 'двор без машин', 'рядом с деловым районом',
    'для большой семьи', 'с камином', 'свежий ремонт, можно заезжать', 'высокий этаж, тихо',
    'историческое здание', 'эко-район, много зелени', 'рядом с университетом', 'компактная и функциональная',
  ],
  en: [
    'two-bed near the metro', 'house with a garden', 'studio downtown', 'apartment with a balcony',
    'bright with a panoramic view', 'quiet green courtyard', 'near a school', 'by the water',
    'spacious for a family', 'with a modern renovation', 'loft with high ceilings',
    'three-bed with two baths', 'top-floor with a view', 'by a park', 'near metro with parking',
    'cosy for a couple', 'commercial space for a cafe', 'apartment with a terrace', 'house by the forest',
    'warm brick house', 'new build, move-in ready', 'good for remote work', 'with a walk-in closet',
    'affordable but central', 'penthouse with a city view', 'townhouse with a garage', 'attic with skylights',
    'riverside with a dock', 'minimalist and light', 'car-free courtyard', 'near the business district',
    'for a large family', 'with a fireplace', 'fresh renovation, move right in', 'high floor, quiet',
    'historic building', 'eco district, lots of greenery', 'near a university', 'compact and functional',
  ],
};

// Recommendation hint phrases (what you'd ask the AI to optimize for).
export const REC_PHRASES = {
  ru: [
    'для семьи с детьми', 'рядом с метро', 'тихий зелёный район', 'с панорамным видом',
    'для первой покупки', 'под сдачу в аренду', 'современный ремонт', 'просторная и светлая',
    'недорого, но уютно', 'ближе к центру', 'для пары без детей', 'с балконом',
    'студия для студента', 'дом с двором', 'инвестиция с ростом цены', 'апартаменты у воды',
    'для удалённой работы', 'с парковкой', 'рядом со школой', 'премиум-класс',
    'для большой семьи', 'минимализм и свет', 'эко-район', 'высокий этаж с видом',
    'близко к работе', 'с террасой', 'для жизни на пенсии', 'рядом с парком',
    'лофт в центре', 'тёплый кирпичный дом', 'компактно и функционально', 'с гардеробной',
    'дом у леса', 'новостройка с отделкой', 'историческое здание', 'для сдачи посуточно',
    'спокойный район без машин', 'светлая кухня-гостиная',
  ],
  en: [
    'for a family with kids', 'near the metro', 'quiet green area', 'with a panoramic view',
    'for a first purchase', 'good to rent out', 'modern renovation', 'spacious and bright',
    'affordable but cosy', 'closer to downtown', 'for a couple', 'with a balcony',
    'studio for a student', 'house with a yard', 'investment with upside', 'apartments by the water',
    'good for remote work', 'with parking', 'near a school', 'premium class',
    'for a large family', 'minimalist and light', 'eco district', 'high floor with a view',
    'close to work', 'with a terrace', 'for retirement living', 'near a park',
    'loft downtown', 'warm brick house', 'compact and functional', 'with a walk-in closet',
    'house by the forest', 'new build, finished', 'historic building', 'for short-term rental',
    'calm car-free area', 'bright open-plan kitchen',
  ],
};

// Pick `n` random, non-repeating phrases for the given lang from a pool.
export function pickPhrases(pool, lang, n) {
  const arr = [...(pool[lang] || pool.en)];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}
