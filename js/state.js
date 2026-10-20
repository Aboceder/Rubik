(function () {
const { FACES, parseAlg } = window.RubikNotation;

const FACE_AXIS = Object.fromEntries(
  Object.entries(FACES).map(([key, face]) => [key, face.axis]),
);

const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const HOME_VECTORS = [];
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      if (x === 0 && y === 0 && z === 0) continue;
      HOME_VECTORS.push([x, y, z]);
    }
  }
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function matVec(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function matMul(a, b) {
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row][col] =
        a[row][0] * b[0][col] +
        a[row][1] * b[1][col] +
        a[row][2] * b[2][col];
    }
  }
  return out;
}

function transpose(matrix) {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
}

function rotationMatrix(axis, quarter) {
  const turns = ((Math.round(quarter) % 4) + 4) % 4;
  const [x, y, z] = axis;
  const oneTurn = [
    [x * x, x * y - z, x * z + y],
    [x * y + z, y * y, y * z - x],
    [x * z - y, y * z + x, z * z],
  ];
  let matrix = IDENTITY.map((row) => row.slice());
  for (let i = 0; i < turns; i++) matrix = matMul(oneTurn, matrix);
  return matrix;
}

function rotateVector(vector, axis, quarter) {
  return matVec(rotationMatrix(axis, quarter), vector).map((value) =>
    Math.round(value),
  );
}

function sameVector(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function createSolvedState() {
  return HOME_VECTORS.map((home) => {
    const stickers = [];
    for (const [colorKey, axis] of Object.entries(FACE_AXIS)) {
      if (dot(axis, home) === 1) stickers.push({ colorKey, normal: axis.slice() });
    }
    return {
      home: home.slice(),
      pos: home.slice(),
      ori: IDENTITY.map((row) => row.slice()),
      stickers,
    };
  });
}

function cloneState(state) {
  return state.map((cubie) => ({
    home: cubie.home.slice(),
    pos: cubie.pos.slice(),
    ori: cubie.ori.map((row) => row.slice()),
    stickers: cubie.stickers.map((sticker) => ({
      colorKey: sticker.colorKey,
      normal: sticker.normal.slice(),
    })),
  }));
}

function stickerNormal(cubie, sticker) {
  return matVec(cubie.ori, sticker.normal).map((value) => Math.round(value));
}

function applyToken(state, token, frame = IDENTITY) {
  const quarter = -token.amount;
  const worldAxis = matVec(frame, token.axis).map((value) => Math.round(value));
  const rotation = rotationMatrix(worldAxis, quarter);

  if (token.all) {
    for (const cubie of state) {
      cubie.pos = matVec(rotation, cubie.pos).map((value) => Math.round(value));
      cubie.ori = matMul(rotation, cubie.ori);
    }
    return matMul(rotation, frame);
  }

  for (const cubie of state) {
    if (!token.layers.includes(dot(cubie.pos, worldAxis))) continue;
    cubie.pos = matVec(rotation, cubie.pos).map((value) => Math.round(value));
    cubie.ori = matMul(rotation, cubie.ori);
  }
  return frame;
}

function applyTokens(state, tokens, frame = IDENTITY) {
  const next = cloneState(state);
  let currentFrame = frame.map((row) => row.slice());
  for (const token of tokens) currentFrame = applyToken(next, token, currentFrame);
  return { state: next, frame: currentFrame };
}

function applyAlg(state, textOrTokens, frame = IDENTITY) {
  const tokens = Array.isArray(textOrTokens) ? textOrTokens : parseAlg(textOrTokens);
  return applyTokens(state, tokens, frame);
}

function toLocalState(state, frame) {
  const inverse = transpose(frame);
  return state.map((cubie) => ({
    home: cubie.home.slice(),
    pos: matVec(inverse, cubie.pos).map((value) => Math.round(value)),
    ori: matMul(inverse, cubie.ori).map((row) =>
      row.map((value) => Math.round(value)),
    ),
    stickers: cubie.stickers.map((sticker) => ({
      colorKey: sticker.colorKey,
      normal: sticker.normal.slice(),
    })),
  }));
}

function findCubie(state, home) {
  return state.find((cubie) => sameVector(cubie.home, home));
}

function stickerAt(state, position, normal) {
  const cubie = state.find((item) => sameVector(item.pos, position));
  if (!cubie) return null;
  return (
    cubie.stickers.find((sticker) =>
      sameVector(stickerNormal(cubie, sticker), normal),
    ) ?? null
  );
}

function isSolved(state) {
  return state.every((cubie) => {
    if (!sameVector(cubie.pos, cubie.home)) return false;
    return cubie.ori.every((row, index) => sameVector(row, IDENTITY[index]));
  });
}

function classifyF2L(state) {
  const corner = findCubie(state, [1, -1, 1]);
  const edge = findCubie(state, [1, 0, 1]);
  const cornerInSlot = sameVector(corner.pos, [1, -1, 1]);
  const edgeInSlot = sameVector(edge.pos, [1, 0, 1]);
  const cornerTop = corner.pos[1] === 1;
  const edgeTop = edge.pos[1] === 1;

  if (cornerInSlot && edgeInSlot) return 'both';
  if (cornerInSlot && edgeTop) return 'corner';
  if (edgeInSlot && cornerTop) return 'edge';
  if (cornerTop && edgeTop) return 'top';
  return 'other';
}

window.RubikState = {
  IDENTITY, createSolvedState, cloneState, applyTokens, applyAlg, toLocalState,
  findCubie, stickerAt, stickerNormal, sameVector, isSolved, classifyF2L,
};
})();
