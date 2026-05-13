import {
  COLS,
  ROWS,
  BLOCK_SIZE
} from "./constants.js";


export function drawBoard(
  ctx,
  board
) {

  ctx.clearRect(
    0,
    0,
    COLS * BLOCK_SIZE,
    ROWS * BLOCK_SIZE
  );

  board.forEach((row, y) => {

    row.forEach((value, x) => {

      if(value) {

        ctx.fillStyle = value;

        ctx.shadowBlur = 8;

        ctx.shadowColor = value;

        ctx.fillRect(
          x * BLOCK_SIZE,
          y * BLOCK_SIZE,
          BLOCK_SIZE,
          BLOCK_SIZE
        );

      }

      ctx.shadowBlur = 0;

      ctx.strokeStyle = "#222";

      ctx.strokeRect(
        x * BLOCK_SIZE,
        y * BLOCK_SIZE,
        BLOCK_SIZE,
        BLOCK_SIZE
      );

    });

  });

}


export function drawPiece(
  ctx,
  piece
) {

  piece.shape.forEach((row, y) => {

    row.forEach((value, x) => {

      if(value) {

        ctx.fillStyle =
          piece.color;

        ctx.shadowBlur = 10;

        ctx.shadowColor =
          piece.color;

        ctx.fillRect(
          (x + piece.x) * BLOCK_SIZE,
          (y + piece.y) * BLOCK_SIZE,
          BLOCK_SIZE,
          BLOCK_SIZE
        );

      }

    });

  });

}