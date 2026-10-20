import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

window.THREE = THREE;
window.OrbitControls = OrbitControls;
window.RoomEnvironment = RoomEnvironment;
window.RoundedBoxGeometry = RoundedBoxGeometry;

await import('./notation.js');
await import('./state.js');
await import('./f2l-cases.js');
await import('./cube-view.js');
await import('./cube-thumbnails.js');
await import('./f2l-dialog.js');
await import('./main.js');
