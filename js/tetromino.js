import {
  SHAPES,
  COLORS,
  COLS
} from "./constants.js";

const pieces =
  "IOTSZJL";


export function randomPiece() {

  const type =
    pieces[
      Math.floor(
        Math.random() * pieces.length
      )
    ];

  const shape = SHAPES[type];

  return {

    type,

    shape,

    color: COLORS[type],

    x:
      Math.floor(COLS / 2) -
      Math.floor(shape[0].length / 2),

    y: 0
  };

}


export function rotate(matrix) {

  return matrix[0].map((_, index) =>
    matrix.map(row => row[index]).reverse()
  );

}