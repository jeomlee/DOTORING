export const CATEGORY_PRESETS = [
  { key: '카페', color: '#D98B66' },
  { key: '식사', color: '#D4A656' },
  { key: '쇼핑', color: '#8BA96E' },
  { key: '문화', color: '#6688B8' },
  { key: '기타', color: '#B28BB8' },
];

export function getCategoryColor(category?: string | null): string {
  if (!category) return '#B0A89F';

  const found = CATEGORY_PRESETS.find((c) => c.key === category);
  if (found) return found.color;

  // 프리셋에 없는 카테고리는 기본 색
  return '#B0A89F';
}
