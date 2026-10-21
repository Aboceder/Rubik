(function () {
  const THREE = window.THREE;
  const { OrbitControls, RoomEnvironment, RoundedBoxGeometry } = window;
  const { FACES } = window.RubikNotation;
  const { sameVector } = window.RubikState;

  const HOME_CAMERA = new THREE.Vector3(5.9, 4.9, 7.2);
  const BELOW_CAMERA = new THREE.Vector3(4.6, -4.4, 6.0);
  const Z_POS = new THREE.Vector3(0, 0, 1);

  function keyForHome(home) {
    return home.join(',');
  }

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

  function radialTexture(stops) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function matrixFromRows(rows) {
    return new THREE.Matrix4().set(
      rows[0][0], rows[0][1], rows[0][2], 0,
      rows[1][0], rows[1][1], rows[1][2], 0,
      rows[2][0], rows[2][1], rows[2][2], 0,
      0, 0, 0, 1,
    );
  }

  class CubeView {
    constructor(canvas, options) {
      const opts = options || {};
      this.canvas = canvas;
      this.interactive = opts.interactive !== false;
      this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.turnMs = this.reduceMotion ? 1 : 190;
      this.state = [];
      this.cubies = new Map();
      this.flying = false;
      this.framed = false;

      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      this.camera.position.copy(HOME_CAMERA);

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd6cf, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(5, 8, 6);
      this.scene.add(key);
      const rim = new THREE.DirectionalLight(0xdfe9ff, 0.6);
      rim.position.set(-6, -3, -5);
      this.scene.add(rim);

      this.addFloor();

      this.cubeGroup = new THREE.Group();
      this.scene.add(this.cubeGroup);
      this.buildCubies();

      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.enablePan = false;
      this.controls.minDistance = 7.4;
      this.controls.maxDistance = 16;
      this.controls.minPolarAngle = 0.25;
      this.controls.maxPolarAngle = Math.PI * 0.9;
      this.controls.rotateSpeed = 0.85;
      this.controls.zoomSpeed = 0.8;
      this.controls.target.set(0, 0, 0);
      this.controls.enabled = this.interactive;
      this.controls.update();

      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      this.resize();

      this.renderer.setAnimationLoop(() => {
        if (this.controls.enabled) this.controls.update();
        this.renderer.render(this.scene, this.camera);
      });
    }

    addFloor() {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(3.6, 72),
        new THREE.MeshBasicMaterial({
          map: radialTexture([
            [0, 'rgba(31,157,85,0.30)'],
            [0.5, 'rgba(31,157,85,0.11)'],
            [1, 'rgba(31,157,85,0)'],
          ]),
          transparent: true,
          depthWrite: false,
        }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = -2.05;
      this.scene.add(glow);

      const contact = new THREE.Mesh(
        new THREE.CircleGeometry(2.1, 64),
        new THREE.MeshBasicMaterial({
          map: radialTexture([
            [0, 'rgba(18,26,22,0.30)'],
            [0.55, 'rgba(18,26,22,0.08)'],
            [1, 'rgba(18,26,22,0)'],
          ]),
          transparent: true,
          depthWrite: false,
        }),
      );
      contact.rotation.x = -Math.PI / 2;
      contact.position.y = -1.99;
      this.scene.add(contact);
    }

    buildCubies() {
      const bodyGeometry = new RoundedBoxGeometry(0.97, 0.97, 0.97, 4, 0.09);
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x15191b,
        roughness: 0.52,
        metalness: 0.18,
      });
      const stickerGeometry = new THREE.ExtrudeGeometry(
        roundedRectShape(0.8, 0.115),
        {
          depth: 0.02,
          bevelEnabled: true,
          bevelThickness: 0.008,
          bevelSize: 0.008,
          bevelSegments: 2,
          curveSegments: 10,
        },
      );
      stickerGeometry.center();

      const stickerMaterials = {};
      for (const [key, face] of Object.entries(FACES)) {
        stickerMaterials[key] = new THREE.MeshStandardMaterial({
          color: face.color,
          roughness: 0.34,
          metalness: 0.02,
          emissive: new THREE.Color(face.color).multiplyScalar(0.035),
        });
      }

      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            if (x === 0 && y === 0 && z === 0) continue;
            const group = new THREE.Group();
            group.userData.home = [x, y, z];
            group.add(new THREE.Mesh(bodyGeometry, bodyMaterial));

            for (const [key, face] of Object.entries(FACES)) {
              const axis = new THREE.Vector3(face.axis[0], face.axis[1], face.axis[2]);
              if (axis.dot(new THREE.Vector3(x, y, z)) !== 1) continue;
              const sticker = new THREE.Mesh(stickerGeometry, stickerMaterials[key]);
              sticker.position.copy(axis).multiplyScalar(0.482);
              sticker.quaternion.setFromUnitVectors(Z_POS, axis);
              sticker.userData.colorKey = key;
              sticker.userData.normal = face.axis.slice();
              group.add(sticker);
            }

            this.cubeGroup.add(group);
            this.cubies.set(keyForHome([x, y, z]), group);
          }
        }
      }
    }

    setState(state) {
      this.state = state;
      for (const cubie of state) {
        const group = this.cubies.get(keyForHome(cubie.home));
        if (!group) continue;
        group.position.set(cubie.pos[0], cubie.pos[1], cubie.pos[2]);
        group.quaternion.setFromRotationMatrix(matrixFromRows(cubie.ori));
        group.updateMatrixWorld(true);
      }
    }

    setInteractive(value) {
      this.interactive = value;
      this.controls.enabled = value;
    }

    resize() {
      const parent = this.canvas.parentElement;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (!width || !height) return;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.fov = width < 480 ? 48 : 38;
      if (!this.framed) {
        this.framed = true;
        if (width / height < 1.05) {
          this.camera.position.set(7.2, 5.6, 9.4);
          this.controls.minDistance = 9.2;
        }
      }
      this.camera.updateProjectionMatrix();
    }

    pick(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects([...this.cubies.values()], true);
      for (const hit of hits) {
        if (!hit.object.userData.colorKey) continue;
        const group = hit.object.parent;
        const home = group.userData.home;
        const cubie = this.state.find((item) => sameVector(item.home, home));
        if (!cubie) continue;
        const quaternion = new THREE.Quaternion();
        group.getWorldQuaternion(quaternion);
        const normal = new THREE.Vector3(
          hit.object.userData.normal[0],
          hit.object.userData.normal[1],
          hit.object.userData.normal[2],
        )
          .applyQuaternion(quaternion)
          .round();
        return {
          group,
          cubie,
          point: hit.point.clone(),
          normal,
        };
      }
      return null;
    }

    screenDelta(origin, direction) {
      const a = origin.clone().project(this.camera);
      const b = origin.clone().addScaledVector(direction, 0.7).project(this.camera);
      return new THREE.Vector2(b.x - a.x, -(b.y - a.y));
    }

    async animateTurn(axis, layers, angle, duration) {
      const ms = duration === undefined ? this.turnMs : duration;
      if (ms <= 1) return;
      const vector = new THREE.Vector3(axis[0], axis[1], axis[2]);
      const selected = [];
      for (const cubie of this.state) {
        const layer = Math.round(
          cubie.pos[0] * axis[0] + cubie.pos[1] * axis[1] + cubie.pos[2] * axis[2],
        );
        if (!layers.includes(layer)) continue;
        const group = this.cubies.get(keyForHome(cubie.home));
        if (group) selected.push(group);
      }
      if (!selected.length) return;

      const pivot = new THREE.Group();
      this.cubeGroup.add(pivot);
      selected.forEach((group) => pivot.attach(group));
      const target = new THREE.Quaternion().setFromAxisAngle(vector, angle);
      const start = performance.now();

      await new Promise((resolve) => {
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms);
          const eased = 1 - Math.pow(1 - t, 3);
          pivot.quaternion.copy(new THREE.Quaternion().slerp(target, eased));
          if (t < 1) requestAnimationFrame(step);
          else {
            pivot.quaternion.copy(target);
            pivot.updateMatrixWorld(true);
            selected.forEach((group) => this.cubeGroup.attach(group));
            this.cubeGroup.remove(pivot);
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    }

    async animateRotation(axis, angle, duration) {
      const ms = duration === undefined ? this.turnMs : duration;
      if (ms <= 1) return;
      const vector = new THREE.Vector3(axis[0], axis[1], axis[2]);
      const target = new THREE.Quaternion().setFromAxisAngle(vector, angle);
      const startQuaternion = this.cubeGroup.quaternion.clone();
      const endQuaternion = target.multiply(startQuaternion);
      const start = performance.now();

      await new Promise((resolve) => {
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms);
          const eased = 1 - Math.pow(1 - t, 3);
          this.cubeGroup.quaternion.slerpQuaternions(
            startQuaternion,
            endQuaternion,
            eased,
          );
          this.cubeGroup.updateMatrixWorld(true);
          if (t < 1) requestAnimationFrame(step);
          else {
            this.cubeGroup.quaternion.copy(endQuaternion);
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    }

    flyTo(target, duration) {
      if (this.flying) return;
      this.flying = true;
      const ms = duration || 650;
      const from = this.camera.position.clone();
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.camera.position.lerpVectors(from, target, eased);
        this.controls.update();
        if (t < 1) requestAnimationFrame(step);
        else this.flying = false;
      };
      requestAnimationFrame(step);
    }

    lookBelow() {
      const below = this.camera.position.y < 0;
      this.flyTo(below ? HOME_CAMERA : BELOW_CAMERA);
      return !below;
    }
  }

  window.RubikCubeView = CubeView;
})();
