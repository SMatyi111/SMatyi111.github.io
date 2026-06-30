export const GRID_SIZE = 16;
export const ROUND_LENGTHS = [4, 5, 6];

function xmur3(value) {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function challengeNumber(dayKey) {
  const epoch = Date.parse("2026-01-01T00:00:00Z");
  const current = Date.parse(`${dayKey}T00:00:00Z`);
  return Math.floor((current - epoch) / 86400000) + 1;
}

function neighbors(cell) {
  const row = Math.floor(cell / 4);
  const column = cell % 4;
  const result = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (nextRow >= 0 && nextRow < 4 && nextColumn >= 0 && nextColumn < 4) {
        result.push(nextRow * 4 + nextColumn);
      }
    }
  }

  return result;
}

export function createChallenge(dayKey, roundLengths = ROUND_LENGTHS) {
  const seedFactory = xmur3(`tracespark:${dayKey}:v1`);
  const random = mulberry32(seedFactory());

  return roundLengths.map((length) => {
    const path = [Math.floor(random() * GRID_SIZE)];
    while (path.length < length) {
      const previous = path.at(-1);
      const candidates = neighbors(previous).filter((cell) => cell !== path.at(-2));
      path.push(candidates[Math.floor(random() * candidates.length)]);
    }
    return path;
  });
}

export function scoreRound(expected, actual) {
  if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
    throw new Error("Expected and actual paths must be arrays of equal length.");
  }

  const correct = expected.reduce((total, cell, index) => total + Number(cell === actual[index]), 0);
  return {
    correct,
    total: expected.length,
    points: correct * 100
  };
}

export function summarizeGame(roundResults) {
  const correct = roundResults.reduce((total, result) => total + result.correct, 0);
  const total = roundResults.reduce((sum, result) => sum + result.total, 0);
  const points = roundResults.reduce((sum, result) => sum + result.points, 0);
  const percent = total ? Math.round((correct / total) * 100) : 0;

  return { correct, total, points, percent };
}

export function calculateStreak(previous, completedDay) {
  if (!previous?.lastCompletedDay) {
    return { current: 1, lastCompletedDay: completedDay };
  }

  if (previous.lastCompletedDay === completedDay) {
    return { current: Math.max(1, Number(previous.current) || 1), lastCompletedDay: completedDay };
  }

  const previousDate = Date.parse(`${previous.lastCompletedDay}T00:00:00Z`);
  const completedDate = Date.parse(`${completedDay}T00:00:00Z`);
  const difference = Math.round((completedDate - previousDate) / 86400000);

  return {
    current: difference === 1 ? (Number(previous.current) || 0) + 1 : 1,
    lastCompletedDay: completedDay
  };
}

export function resultGrid(roundResults) {
  return roundResults
    .map((result) => "🟦".repeat(result.correct) + "⬜".repeat(result.total - result.correct))
    .join("\n");
}

export function millisecondsUntilNextUtcDay(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, next - now.getTime());
}
