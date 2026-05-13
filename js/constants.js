export const COLS = 10;

export const ROWS = 20;

export const BLOCK_SIZE = 30;

export const DROP_INTERVAL = 500;

export const COLORS = {

  I: "#00f0f0",

  O: "#f0f000",

  T: "#a000f0",

  S: "#00f000",

  Z: "#f00000",

  J: "#0000f0",

  L: "#f0a000"
};

export const SHAPES = {

  I: [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0]
  ],

  O: [
    [1,1],
    [1,1]
  ],

  T: [
    [0,1,0],
    [1,1,1],
    [0,0,0]
  ],

  S: [
    [0,1,1],
    [1,1,0],
    [0,0,0]
  ],

  Z: [
    [1,1,0],
    [0,1,1],
    [0,0,0]
  ],

  J: [
    [1,0,0],
    [1,1,1],
    [0,0,0]
  ],

  L: [
    [0,0,1],
    [1,1,1],
    [0,0,0]
  ]
};