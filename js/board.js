import {
  ROWS,
  COLS
} from "./constants.js";

import {
  create2DArray
} from "./utils.js";


export function createBoard() {

  return create2DArray(
    ROWS,
    COLS
  );

}


export function mergePiece(
  board,
  piece
) {

  piece.shape.forEach((row, y) => {

    row.forEach((value, x) => {

      if(value) {

        board[y + piece.y][x + piece.x] =
          piece.color;

      }

    });

  });

}


export function clearLines(board) {

  let lines = 0;

  outer:
  for(let y = board.length - 1; y >= 0; y--) {

    for(let x = 0; x < board[y].length; x++) {

      if(board[y][x] === 0) {
        continue outer;
      }

    }

    const row =
      board.splice(y,1)[0].fill(0);

    board.unshift(row);

    lines++;

    y++;

  }

  return lines;
}