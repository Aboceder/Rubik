(function () {
const FACES = {
  U: { axis: [0, 1, 0], color: '#2f6fd0', name: '蓝' },
  D: { axis: [0, -1, 0], color: '#1f9d55', name: '绿' },
  F: { axis: [0, 0, 1], color: '#eceeeb', name: '白' },
  B: { axis: [0, 0, -1], color: '#f5c518', name: '黄' },
  R: { axis: [1, 0, 0], color: '#d8322c', name: '红' },
  L: { axis: [-1, 0, 0], color: '#f07a2b', name: '橙' },
};

const FACE_KEY_BY_AXIS = new Map(
  Object.entries(FACES).map(([key, face]) => [face.axis.join(','), key]),
);

const NOTATION_AXIS = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  M: [-1, 0, 0],
  E: [0, -1, 0],
  S: [0, 0, 1],
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

const WIDE_LAYERS = {
  r: ['R', [1, 0]],
  l: ['L', [1, 0]],
  u: ['U', [1, 0]],
  f: ['F', [1, 0]],
  b: ['B', [1, 0]],
  d: ['D', [1, 0]],
};

const SLICE_LAYER = { M: 0, E: 0, S: 0 };
const ROTATIONS = new Set(['x', 'y', 'z']);

function labelFor(base, amount) {
  if (Math.abs(amount) === 2) return `${base}2`;
  if (amount < 0) return `${base}'`;
  return base;
}

function parseAlg(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const match = raw.match(/^([UDLRFBMESxyzrlufbd])(['’2]?)$/);
      if (!match) throw new Error(`无法解析的记法：${raw}`);

      const [, base, suffix] = match;
      const amount = suffix === '2' ? 2 : suffix ? -1 : 1;

      if (ROTATIONS.has(base)) {
        return {
          base,
          amount,
          axis: NOTATION_AXIS[base].slice(),
          layers: null,
          all: true,
          rotation: true,
          label: raw,
        };
      }

      if (WIDE_LAYERS[base]) {
        const [face, layers] = WIDE_LAYERS[base];
        return {
          base,
          amount,
          axis: NOTATION_AXIS[face].slice(),
          layers: layers.slice(),
          all: false,
          rotation: false,
          label: raw,
        };
      }

      if (SLICE_LAYER[base] !== undefined) {
        return {
          base,
          amount,
          axis: NOTATION_AXIS[base].slice(),
          layers: [0],
          all: false,
          rotation: false,
          label: raw,
        };
      }

      return {
        base,
        amount,
        axis: NOTATION_AXIS[base].slice(),
        layers: [1],
        all: false,
        rotation: false,
        label: raw,
      };
    });
}

function invertAlg(textOrTokens) {
  const tokens = Array.isArray(textOrTokens) ? textOrTokens : parseAlg(textOrTokens);
  return tokens
    .slice()
    .reverse()
    .map((token) => ({
      ...token,
      axis: token.axis.slice(),
      layers: token.layers ? token.layers.slice() : null,
      amount: -token.amount,
      label: labelFor(token.base, -token.amount),
    }));
}

function tokenAngle(token) {
  return (-token.amount * Math.PI) / 2;
}

function faceKeyForAxis(axis) {
  return FACE_KEY_BY_AXIS.get(axis.map((value) => Math.round(value)).join(','));
}

function describe(axis, layer, angle) {
  if (layer === 0) {
    const slice = Math.abs(axis[0]) > 0.5 ? 'M' : Math.abs(axis[1]) > 0.5 ? 'E' : 'S';
    return `${slice}${angle > 0 ? "'" : ''}`;
  }
  const normal = layer > 0 ? axis : axis.map((value) => -value);
  const face = faceKeyForAxis(normal);
  const clockwise = layer > 0 ? angle < 0 : angle > 0;
  return `${face}${clockwise ? '' : "'"}`;
}

window.RubikNotation = { FACES, parseAlg, invertAlg, tokenAngle, faceKeyForAxis, describe, labelFor };
})();
