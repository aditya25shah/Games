export function create2DArray(
  rows,
  cols,
  value = 0
) {

  return Array.from(
    { length: rows },
    () => Array(cols).fill(value)
  );

}


export function formatScore(score) {

  return score
    .toString()
    .padStart(5, "0");

}