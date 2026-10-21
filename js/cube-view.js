(function () {
  const THREE = window.THREE;
  const { OrbitControls, RoomEnvironment, RoundedBoxGeometry } = window;
  const { FACES } = window.RubikNotation;
  const { sameVector } = window.RubikState;

  const HOME_CAMERA = new THREE.Vector3(5.1, 4.25, 6.25);
  const BELOW_CAMERA = new THREE.Vector3(4.0, -3.85, 5.2);
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
      this.needsRender = true;
      this.visible = true;

      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
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
      this.controls.touches.ONE = THREE.TOUCH.ROTATE;
      this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
      this.controls.target.set(0, 0, 0);
      this.controls.enabled = this.interactive;
      this.controls.update();

      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      this.resize();

      this.visibilityObserver = new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1].isIntersecting;
        this.invalidate();
      }, { rootMargin: '80px' });
      this.visibilityObserver.observe(canvas);

      this.renderer.setAnimationLoop(() => {
        if (!this.visible) return;
        if (this.controls.enabled && this.controls.update()) this.invalidate();
        if (!this.needsRender) return;
        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);
      });
    }

    invalidate() {
      this.needsRender = true;
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
      this.invalidate();
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
          this.camera.position.set(6.1, 4.8, 7.8);
          this.controls.minDistance = 7.2;
        }
      }
      this.camera.updateProjectionMatrix();
      this.invalidate();
    }

    pick(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects([...this.cubies.values()], true);
      for (const hit of hits) {
        // Accept sticker and body hits; stickers report face normals,
        // body hits use the closest outward face normal.
        const group = hit.object.userData.colorKey
          ? hit.object.parent
          : hit.object;
        const home = group.userData.home;
        const cubie = this.state.find((item) => sameVector(item.home, home));
        if (!cubie) continue;
        if (hit.object.userData.colorKey) {
          const quaternion = new THREE.Quaternion();
          group.getWorldQuaternion(quaternion);
          const normal = new THREE.Vector3(
            hit.object.userData.normal[0],
            hit.object.userData.normal[1],
            hit.object.userData.normal[2],
          )
            .applyQuaternion(quaternion)
            .round();
          return { group, cubie, point: hit.point.clone(), normal };
        }
        // Body hit: derive normal from local hit position relative to cubie center
        const localPoint = group.worldToLocal(hit.point.clone());
        const absX = Math.abs(localPoint.x);
        const absY = Math.abs(localPoint.y);
        const absZ = Math.abs(localPoint.z);
        let normalLocal;
        if (absX >= absY && absX >= absZ) {
          normalLocal = new THREE.Vector3(Math.sign(localPoint.x), 0, 0);
        } else if (absY >= absZ) {
          normalLocal = new THREE.Vector3(0, Math.sign(localPoint.y), 0);
        } else {
          normalLocal = new THREE.Vector3(0, 0, Math.sign(localPoint.z));
        }
        const quaternion = new THREE.Quaternion();
        group.getWorldQuaternion(quaternion);
        const normal = normalLocal
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

    // Real-time layer drag support: attach a layer to a pivot, rotate it with
    // the finger, then snap to the nearest quarter-turn on release.
    beginTurn(axis, layers) {
      if (this.turnPivot) this.cancelTurn();
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
      if (!selected.length) return false;
      this.turnPivot = new THREE.Group();
      this.cubeGroup.add(this.turnPivot);
      selected.forEach((group) => this.turnPivot.attach(group));
      this.turnAxis = vector;
      this.turnLayers = layers.slice();
      this.invalidate();
      return true;
    }

    setTurnAngle(angle) {
      if (!this.turnPivot) return;
      this.turnAngle = angle;
      this.turnPivot.quaternion.setFromAxisAngle(this.turnAxis, angle);
      this.invalidate();
    }

    getTurnAngle() {
      return this.turnPivot ? (this.turnAngle || 0) : 0;
    }

    hasTurn() {
      return !!this.turnPivot;
    }

    async finishTurn(axis, layers, quarterTurns) {
      if (!this.turnPivot) return;
      const currentAngle = quarterTurns * (Math.PI / 2);
      const currentQuat = this.turnPivot.quaternion.clone();
      const targetQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(axis[0], axis[1], axis[2]),
        currentAngle,
      );
      const angleDiff = Math.abs(currentQuat.angleTo(targetQuat));
      // Already aligned — just detach
      if (angleDiff < 0.01) {
        this.detachTurn();
        return;
      }
      const ms = this.reduceMotion ? 1 : Math.min(220, 60 + angleDiff * 140);
      const start = performance.now();
      await new Promise((resolve) => {
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms);
          const eased = 1 - Math.pow(1 - t, 3);
          this.turnPivot.quaternion.slerpQuaternions(currentQuat, targetQuat, eased);
          this.invalidate();
          if (t < 1) requestAnimationFrame(step);
          else {
            this.turnPivot.quaternion.copy(targetQuat);
            this.detachTurn();
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    }

    detachTurn() {
      if (!this.turnPivot) return;
      this.turnPivot.updateMatrixWorld(true);
      const children = [...this.turnPivot.children];
      children.forEach((group) => this.cubeGroup.attach(group));
      this.cubeGroup.remove(this.turnPivot);
      this.turnPivot = null;
      this.turnAxis = null;
      this.turnLayers = null;
      this.turnAngle = 0;
      this.invalidate();
    }

    cancelTurn() {
      this.detachTurn();
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
          this.invalidate();
          if (t < 1) requestAnimationFrame(step);
          else {
            pivot.quaternion.copy(target);
            pivot.updateMatrixWorld(true);
            selected.forEach((group) => this.cubeGroup.attach(group));
            this.cubeGroup.remove(pivot);
            this.invalidate();
            resolve();
          }
        };
        this.invalidate();
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
          this.invalidate();
          if (t < 1) requestAnimationFrame(step);
          else {
            this.cubeGroup.quaternion.copy(endQuaternion);
            this.invalidate();
            resolve();
          }
        };
        this.invalidate();
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
        this.invalidate();
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

    isBelow() {
      return this.camera.position.y < 0;
    }

    orbitBy(dx, dy) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta -= dx * 0.007;
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi - dy * 0.007,
        this.controls.minPolarAngle,
        this.controls.maxPolarAngle,
      );
      offset.setFromSpherical(spherical);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
      this.invalidate();
    }
  }

  window.RubikCubeView = CubeView;
})();
