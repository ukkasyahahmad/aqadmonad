// Jogja food and place words. The same address always gets the same name; nothing is stored.
const WORDS = [
  "Gudeg", "Bakpia", "Malioboro", "Soto", "Tugu", "Sate", "Wedang", "Kraton",
  "Angkringan", "Prambanan", "Klepon", "Mangut", "Bakmi", "Kopi", "Gethuk", "Tempe",
];

export function nickname(address: `0x${string}`): string {
  const word = WORDS[parseInt(address.slice(2, 6), 16) % WORDS.length];
  const digits = (parseInt(address.slice(-2), 16) % 100).toString().padStart(2, "0");
  return `${word}-${digits}`;
}
