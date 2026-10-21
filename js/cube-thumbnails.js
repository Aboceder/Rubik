(function () {
  const THREE = window.THREE;
  const { RoundedBoxGeometry } = window;
  const { FACES } = window.RubikNotation;
  const { sameVector } = window.RubikState;

  const Z_POS = new THREE.Vector3(0, 0, 1);
  const SIZE = 240;
  const TARGET_HOMES = new Set([
    '1,1,0', // 红蓝棱
    '1,-1,1', // 绿红白角
  ]);

  function roundedRectShape(size, radius) {
    const h = size / 2;
    const r = radius;
    const shape = new THREE.Shape();
    shape.moveTo(-h + r, -h);
    shape.lineTo(h - r, -h);
    shape.quadraticCurveTo(h, -h, h, -h + r);
    shape.lineTo(h, h - r);
    shape.quadraticCurveTo(h, h, h - r, h);
    shape.lineTo(-h + r, h);
    shape.quadraticCurveTo(-h, h, -h, h - r);
    shape.lineTo(-h, -h + r);
    shape.quadraticCurveTo(-h, -h, -h + r, -h);
    return shape;
  }

  function matrixFromRows(rows) {
    return new THREE.Matrix4().set(
      rows[0][0], rows[0][1], rows[0][2], 0,
      rows[1][0], rows[1][1], rows[1][2], 0,
      rows[2][0], rows[2][1], rows[2][2], 0,
      0, 0, 0, 1,
    );
  }

  function createRenderer() {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearAlpha(0);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  }

  function createScene() {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd5ddd6, 1.2));

    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(5, 8, 7);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.9);
    fill.position.set(-6, 2, 5);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(-4, -3, -6);
    scene.add(rim);
    return scene;
  }

  function createCube() {
    const group = new THREE.Group();
    const cubies = new Map();
    const bodyGeometry = new RoundedBoxGeometry(0.97, 0.97, 0.97, 4, 0.09);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x15191b,
      roughness: 0.5,
      metalness: 0.18,
    });
    const targetBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x26332b,
      roughness: 0.44,
      metalness: 0.12,
      emissive: 0x0d7a42,
      emissiveIntensity: 0.09,
    });
    const stickerGeometry = new THREE.ExtrudeGeometry(
      roundedRectShape(0.8, 0.115),
      {
        depth: 0.02,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.008,
        bevelSegments: 2,
        curveSegments: 8,
      },
    );
    stickerGeometry.center();

    const stickerMaterials = {};
    const mutedStickerMaterial = new THREE.MeshStandardMaterial({
      color: 0xd0d4d1,
      roughness: 0.72,
      metalness: 0,
    });
    for (const [key, face] of Object.entries(FACES)) {
      stickerMaterials[key] = new THREE.MeshStandardMaterial({
        color: face.color,
        roughness: 0.34,
        metalness: 0.02,
        emissive: new THREE.Color(face.color).multiplyScalar(0.05),
      });
    }

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const cubie = new THREE.Group();
          cubie.userData.home = [x, y, z];
          const homeKey = [x, y, z].join(',');
          const isTarget = TARGET_HOMES.has(homeKey);
          cubie.add(
            new THREE.Mesh(
              bodyGeometry,
              isTarget ? targetBodyMaterial : bodyMaterial,
            ),
          );
          if (isTarget) {
            cubie.scale.setScalar(1.025);
          }

          for (const [key, face] of Object.entries(FACES)) {
            const axis = new THREE.Vector3(face.axis[0], face.axis[1], face.axis[2]);
            if (axis.dot(new THREE.Vector3(x, y, z)) !== 1) continue;
            const isTargetSticker = isTarget && key !== 'U';
            const sticker = new THREE.Mesh(
              stickerGeometry,
              isTargetSticker ? stickerMaterials[key] : mutedStickerMaterial,
            );
            sticker.position.copy(axis).multiplyScalar(0.482);
            sticker.quaternion.setFromUnitVectors(Z_POS, axis);
            cubie.add(sticker);
          }

          group.add(cubie);
          cubies.set(homeKey, cubie);
        }
      }
    }

    return { group, cubies };
  }

  function applyState(cubies, state) {
    for (const item of state) {
      const cubie = cubies.get(item.home.join(','));
      if (!cubie) continue;
      cubie.position.set(item.pos[0], item.pos[1], item.pos[2]);
      cubie.quaternion.setFromRotationMatrix(matrixFromRows(item.ori));
      cubie.updateMatrixWorld(true);
    }
  }

  function renderCases(cases) {
    const renderer = createRenderer();
    const scene = createScene();
    const cube = createCube();
    scene.add(cube.group);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const result = new Map();

    for (const item of cases) {
      const fromLeft = item.group === 'other';
      camera.position.set(fromLeft ? -6.1 : 6.1, 5.1, 7.8);
      camera.lookAt(0, 0, 0);
      applyState(cube.cubies, item.setup);
      renderer.render(scene, camera);
      result.set(item.n, renderer.domElement.toDataURL('image/webp', 0.82));
    }

    const gl = renderer.getContext();
    gl.finish();
    renderer.dispose();
    renderer.forceContextLoss();
    cube.group.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
    });
    return result;
  }

  window.RubikThumbnails = { renderCases };
})();
