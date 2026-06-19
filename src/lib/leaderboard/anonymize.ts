// Display-only anonymization for the leaderboard. Real names stay in the
// database untouched; the leaderboard APIs run names through pseudonym() so the
// tool renders stable codenames instead. Same input key always yields the same
// codename, so a given student shows up identically in the team list and the
// individual table. To turn this off, stop calling pseudonym() in the two
// leaderboard routes — nothing here mutates stored data.

const FIRST_NAMES = [
  "Falcon", "Maple", "Cobalt", "Juniper", "Onyx", "Cedar", "Quartz", "Aspen",
  "Indigo", "Sable", "Marlow", "Hazel", "Slate", "Wren", "Flint", "Ember",
  "Lark", "Birch", "Vesper", "Rowan", "Cyrus", "Marble", "Tamsin", "Orin",
  "Sage", "Thorne", "Calla", "Bexley", "Drift", "Selah", "Arlo", "Reza",
  "Niamh", "Soren", "Iris", "Dax", "Lumen", "Bram", "Esme", "Kael",
];

const LAST_NAMES = [
  "Reyes", "Tran", "Okafor", "Lindqvist", "Castellano", "Bhandari", "Nakamura",
  "Aldridge", "Vasquez", "Petrova", "Halloran", "Mensah", "Dubois", "Cho",
  "Saraiva", "Whitlock", "Farrugia", "Kowalski", "Adeyemi", "Brandt",
  "Montoya", "Velasco", "Sundqvist", "Haddad", "Ferreira", "Lindholm",
  "Quintero", "Bashir", "Novak", "Esposito", "Radcliffe", "Yusuf",
  "Marchetti", "Delgado", "Ashworth", "Romano", "Galvan", "Pereira",
  "Holloway", "Kapoor",
];

// Two independent passes (different seeds) so first and last names vary
// independently, widening the effective namespace to ~40*40 = 1600 combos.
// FNV-1a accumulation followed by a murmur3 avalanche finalizer — the finalizer
// matters because cuid-style ids share long prefixes and plain FNV leaves the
// low bits (which mod picks up) poorly mixed, causing avoidable collisions.
function hash(key: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // murmur3 fmix32 avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// Map a stable key (use the user id) to a deterministic codename. Falls back to
// a labeled key if none is provided so output is never an empty string.
export function pseudonym(key: string | null | undefined): string {
  const k = key && key.length > 0 ? key : "anon";
  const first = FIRST_NAMES[hash(k, 0x811c9dc5) % FIRST_NAMES.length];
  const last = LAST_NAMES[hash(k, 0x7f4a7c15) % LAST_NAMES.length];
  return `${first} ${last}`;
}
