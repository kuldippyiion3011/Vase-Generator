function onWindowResize() {
  const viewer = document.getElementById("viewer");
  camera.aspect = viewer.clientWidth / viewer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
}
import * as THREE from './three.module.js';
import { OrbitControls } from './OrbitControls.js';
import { STLLoader } from './STLLoader.js';
import { STLExporter } from './STLExporter.js';
// Helper to create cap geometry between two rings
function createCap(ringOuter, ringInner, y, color) {
  const capGeom = new THREE.BufferGeometry();
  const vertices = [];
  const indices = [];
  const n = ringOuter.length;
  for (let i = 0; i < n; i++) {
    // Outer vertex
    vertices.push(ringOuter[i].x, y, ringOuter[i].z);
    // Inner vertex
    vertices.push(ringInner[i].x, y, ringInner[i].z);
  }
  // Triangles
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    // Quad split into two triangles
    indices.push(i * 2, next * 2, i * 2 + 1);
    indices.push(next * 2, next * 2 + 1, i * 2 + 1);
  }
  capGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  capGeom.setIndex(indices);
  capGeom.computeVertexNormals();
  return new THREE.Mesh(capGeom, new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.7, side: THREE.DoubleSide }));
}


let scene, camera, renderer, controls, mesh;
let isAnimating = true;
let currentParams = {};
// let currentMode = 'procedural'; // for future expansion
let currentMode = 'table'; // 'vase' or 'table'
let animationId;
let selectedMaterial = null;
let isImportedModel = false;
let originalImportedGeometry = null;

// ========== INIT ==========
init();
animate();

// ========== INITIAL SETUP ==========
function init() {
  const viewer = document.getElementById("viewer");

  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141f);

  // Camera
  camera = new THREE.PerspectiveCamera(
    60,
    viewer.clientWidth / viewer.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 5, 10);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  viewer.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.update();

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // Default model (table mode)
  mesh = createVaseMesh(getParams());
  scene.add(mesh);

  // Set mode button text to match initial mode
  document.getElementById("modeBtn").textContent = `Mode: Table`;
  // Hide wall thickness slider in table mode
  document.getElementById("wallThickness").parentElement.style.display = "none";

  // ✅ Center after mesh added
  updateDimensionsDisplay(); // ✅ show initial dimensions

  setupEventListeners();
  loadObjectTypes();

  window.addEventListener("resize", onWindowResize);
}

function centerCameraOnVase() {
  // Compute vase center and size
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Reposition camera to center vase perfectly
  controls.target.copy(center);
  camera.lookAt(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 1.6; // fit view comfortably

  // ✅ Center camera at vase midpoint (no upward shift)
  camera.position.set(center.x, center.y, center.z + distance);

  controls.update();
}

function updateDimensionsDisplay() {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());

  // Convert from cm to inches (if 1 unit = 1 cm)
  const heightInches = (size.y * 0.393701).toFixed(2);
  const diameterInches = (Math.max(size.x, size.z) * 0.393701).toFixed(2);

  document.getElementById("heightInches").textContent = heightInches;
  document.getElementById("diameterInches").textContent = diameterInches;
}



// ========== PARAMETER COLLECTION ==========
function getParams() {
  return {
    height: parseFloat(document.getElementById("height").value),
    baseRadius: parseFloat(document.getElementById("baseRadius").value),
    topRadius: parseFloat(document.getElementById("topRadius").value),
    // bodyRadius: parseFloat(document.getElementById("bodyRadius").value),
    // neckHeight: parseFloat(document.getElementById("neckHeight").value),
    // wallThickness: parseFloat(document.getElementById("wallThickness").value),
    curvature: parseFloat(document.getElementById("curvature").value),
    taper: parseFloat(document.getElementById("taper").value),
    segments: parseInt(document.getElementById("segments").value),
    twist: parseFloat(document.getElementById("twist").value),
    waveAmplitude: parseFloat(document.getElementById("waveAmplitude").value),
    waveFrequency: parseFloat(document.getElementById("waveFrequency").value),
    grooveDepth: parseFloat(document.getElementById("grooveDepth").value),
    spiral: parseFloat(document.getElementById("spiral").value),
    color: document.getElementById("colorPicker").value,
    width: parseFloat(document.getElementById("width").value),
    wallThickness: parseFloat(document.getElementById("wallThickness").value)
  };
}

// ========== GENERATE VASE ==========
function createVaseMesh(params) {
  const {
    height,
    baseRadius,
    topRadius,
    curvature,
    taper,
    segments,
    twist,
    waveAmplitude,
    waveFrequency,
    grooveDepth,
    spiral,
    color,
    width = 1,
    wallThickness = 0.2
  } = params;

  const radialSegments = segments;
  const heightSegments = 100;

  if (currentMode === "table") {
    // Solid table: single mesh, ignore wall thickness, closed ends
    const geometry = new THREE.CylinderGeometry(
      topRadius,
      baseRadius,
      height,
      radialSegments,
      heightSegments,
      false // closed ends for solid
    );
    // Deform geometry
    const pos = geometry.attributes.position;
    const vec = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      vec.fromBufferAttribute(pos, i);
      const yNorm = (vec.y + height / 2) / height;
      let radiusScale = 1 + curvature * Math.pow(Math.sin(yNorm * Math.PI), 2);
      radiusScale *= 1 - (1 - taper) * yNorm;
      const x = vec.x * radiusScale * width;
      const z = vec.z * radiusScale * width;
      const twistAngle = THREE.MathUtils.degToRad(twist) * yNorm;
      const wave = Math.sin(yNorm * waveFrequency * Math.PI * 2) * waveAmplitude;
      const spiralOffset = Math.sin(yNorm * Math.PI * 2) * spiral;
      const grooveTwist = 0;
      let finalX = x * Math.cos(twistAngle) - z * Math.sin(twistAngle) + spiralOffset + grooveTwist;
      let finalZ = x * Math.sin(twistAngle) + z * Math.cos(twistAngle) + wave * grooveDepth;
      pos.setXYZ(i, finalX, vec.y, finalZ);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  } else {
    // Vase mode: hollow mesh with wall thickness
    // Outer geometry
    const geometryOuter = new THREE.CylinderGeometry(
      topRadius,
      baseRadius,
      height,
      radialSegments,
      heightSegments,
      true
    );
    // Inner geometry (smaller radii)
    const geometryInner = new THREE.CylinderGeometry(
      Math.max(topRadius - wallThickness, 0.01),
      Math.max(baseRadius - wallThickness, 0.01),
      height,
      radialSegments,
      heightSegments,
      true
    );

    // Store top/bottom rings for capping
    let ringOuterTop = [], ringOuterBottom = [], ringInnerTop = [], ringInnerBottom = [];
    function deformGeometryWithRings(geometry, inward = false, storeRings = false) {
      const pos = geometry.attributes.position;
      const vec = new THREE.Vector3();
      const n = radialSegments;
      for (let i = 0; i < pos.count; i++) {
        vec.fromBufferAttribute(pos, i);
        const yNorm = (vec.y + height / 2) / height;
        let radiusScale = 1 + curvature * Math.pow(Math.sin(yNorm * Math.PI), 2);
        radiusScale *= 1 - (1 - taper) * yNorm;
        const x = vec.x * radiusScale * width;
        const z = vec.z * radiusScale * width;
        const twistAngle = THREE.MathUtils.degToRad(twist) * yNorm;
        const wave = Math.sin(yNorm * waveFrequency * Math.PI * 2) * waveAmplitude;
        const spiralOffset = Math.sin(yNorm * Math.PI * 2) * spiral;
        const grooveTwist = 0;
        let finalX = x * Math.cos(twistAngle) - z * Math.sin(twistAngle) + spiralOffset + grooveTwist;
        let finalZ = x * Math.sin(twistAngle) + z * Math.cos(twistAngle) + wave * grooveDepth;
        if (inward) {
          finalX *= 1;
          finalZ *= 1;
        }
        pos.setXYZ(i, finalX, vec.y, finalZ);
        // Store top/bottom rings
        if (storeRings) {
          if (Math.abs(vec.y - height / 2) < 1e-3) {
            // Top ring
            if (!inward) ringOuterTop.push({ x: finalX, z: finalZ });
            else ringInnerTop.push({ x: finalX, z: finalZ });
          }
          if (Math.abs(vec.y + height / 2) < 1e-3) {
            // Bottom ring
            if (!inward) ringOuterBottom.push({ x: finalX, z: finalZ });
            else ringInnerBottom.push({ x: finalX, z: finalZ });
          }
        }
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    deformGeometryWithRings(geometryOuter, false, true);
    deformGeometryWithRings(geometryInner, true, true);

    // Reverse inner geometry normals
    for (let i = 0; i < geometryInner.index.count; i += 3) {
      const a = geometryInner.index.getX(i);
      const b = geometryInner.index.getX(i + 1);
      const c = geometryInner.index.getX(i + 2);
      geometryInner.index.setX(i, c);
      geometryInner.index.setX(i + 1, b);
      geometryInner.index.setX(i + 2, a);
    }

    const materialOuter = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    // Inner mesh: shadow/darker color
    const materialInner = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color(0x222222), 0.6),
      metalness: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });

    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometryOuter, materialOuter));
    group.add(new THREE.Mesh(geometryInner, materialInner));
    // Add caps to join top and bottom
    if (ringOuterTop.length && ringInnerTop.length) {
      group.add(createCap(ringOuterTop, ringInnerTop, height / 2, materialOuter.color));
    }
    if (ringOuterBottom.length && ringInnerBottom.length) {
      group.add(createCap(ringOuterBottom, ringInnerBottom, -height / 2, materialOuter.color));
    }
    return group;
  }
}

// ========== UPDATE VASE ==========
function updateVase() {
  const params = getParams();
  currentParams = params;

  if (isImportedModel && originalImportedGeometry) {
    // Apply only height, width, and twist transformations to imported model
    if (mesh) scene.remove(mesh);

    const geometry = originalImportedGeometry.clone();
    const positions = geometry.attributes.position;

    // Get transformation parameters
    const height = params.height;
    const width = params.width;
    const twist = params.twist;

    // Calculate original bounding box
    geometry.computeBoundingBox();
    const originalSize = new THREE.Vector3();
    geometry.boundingBox.getSize(originalSize);
    const originalCenter = new THREE.Vector3();
    geometry.boundingBox.getCenter(originalCenter);

    // Apply transformations
    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3();
      vertex.fromBufferAttribute(positions, i);

      // Translate to origin
      vertex.sub(originalCenter);

      // Apply height scaling (uniform scaling in Y direction)
      vertex.y *= height / originalSize.y;

      // Apply width scaling (uniform scaling in X and Z directions)
      vertex.x *= width;
      vertex.z *= width;

      // Apply twist (rotation around Y axis based on height)
      const normalizedHeight = (vertex.y + (height / 2)) / height; // 0 to 1
      const twistAngle = THREE.MathUtils.degToRad(twist) * normalizedHeight;
      const cos = Math.cos(twistAngle);
      const sin = Math.sin(twistAngle);
      const newX = vertex.x * cos - vertex.z * sin;
      const newZ = vertex.x * sin + vertex.z * cos;
      vertex.x = newX;
      vertex.z = newZ;

      // Translate back
      vertex.add(originalCenter);

      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: params.color,
      metalness: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
  } else {
    // Normal procedural model generation
    if (mesh) scene.remove(mesh);
    mesh = createVaseMesh(params);
    scene.add(mesh);
  }

  updateDimensionsDisplay(); // ✅ update live when sliders move
}

// ========== LOAD OBJECT TYPES ==========
function loadObjectTypes() {
  fetch('/get_object_types')
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('objectType');
      select.innerHTML = '<option value="">Select Object Type</option>';
      data.forEach(type => {
        const option = document.createElement('option');
        option.value = type.id;
        option.textContent = type.object_type_name;
        select.appendChild(option);
      });
    })
    .catch(err => console.error('Error loading object types:', err));
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  document.getElementById("modeBtn").addEventListener("click", () => {
    currentMode = currentMode === "vase" ? "table" : "vase";
    document.getElementById("modeBtn").textContent = `Mode: ${currentMode.charAt(0).toUpperCase() + currentMode.slice(1)}`;
    // Optionally hide wall thickness slider in table mode
    document.getElementById("wallThickness").parentElement.style.display = currentMode === "table" ? "none" : "";
    updateVase();
  });
  const sliders = document.querySelectorAll("input[type=range], input[type=color]");
  sliders.forEach(slider => {
    slider.addEventListener("input", updateVase);
  });

  document.getElementById("objectType").addEventListener("change", (e) => {
    const selectedValue = e.target.value;
    const showMaterialBtn = document.getElementById("showMaterialBtn");
    const materialPanel = document.getElementById("materialPanel");
    if (selectedValue) {
      showMaterialBtn.style.display = "block";
      // Reset selected material when object type changes
      selectedMaterial = null;
      updateSelectedMaterialDisplay();
      // Hide material panel if it was open
      materialPanel.style.display = "none";
      showMaterialBtn.textContent = "Show Material";
    } else {
      showMaterialBtn.style.display = "none";
      selectedMaterial = null;
      updateSelectedMaterialDisplay();
      materialPanel.style.display = "none";
    }
  });

  document.getElementById("showMaterialBtn").addEventListener("click", toggleMaterialSection);

  document.getElementById("generateBtn").addEventListener("click", updateVase);
  document.getElementById("animationToggle").addEventListener("click", toggleAnimation);
  document.getElementById("saveBtn").addEventListener("click", saveFavorite);
  document.getElementById("importBtn").addEventListener("click", importSTL);
  document.getElementById("exportBtn").addEventListener("click", exportSTL);
  document.getElementById("favoritesBtn").addEventListener("click", showFavorites);
  document.getElementById("searchBox").addEventListener("input", handleSearch);
}

// ========== ANIMATION ==========
function animate() {
  animationId = requestAnimationFrame(animate);
  if (isAnimating && mesh) mesh.rotation.y += 0.01;
  controls.update();
  renderer.render(scene, camera);
}

function toggleAnimation() {
  isAnimating = !isAnimating;
  document.getElementById("animationToggle").textContent = isAnimating ? "⏸ Stop Animation" : "▶ Start Animation";
}

// ========== SAVE / EXPORT / FAVORITES ==========
function handleSearch() {
  // Placeholder: Implement search/filter logic for favorites if needed
}
function showFavorites() {
  // --- Original favoritesPanel logic (active) ---
  fetch('/get_favorites')
    .then(res => res.json())
    .then(favorites => {
      const panel = document.getElementById('favoritesPanel');
      const container = document.getElementById('favoritesContainer');
      if (!panel || !container) return;
      container.innerHTML = '';
      panel.style.display = 'block';
      if (!favorites.length) {
        container.innerHTML = '<div class="no-favorites">No favorites saved yet.</div>';
        return;
      }
      favorites.forEach((fav, idx) => {
        const card = document.createElement('div');
        card.className = 'favorite-card';
        card.style.margin = '12px 0';
        card.style.padding = '10px';
        card.style.background = '#fff';
        card.style.borderRadius = '8px';
        card.style.color = '#222';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        card.innerHTML = `
          <div class="preview" style="background:${fav.color};width:32px;height:32px;border-radius:6px;margin-bottom:8px;"></div>
          <div class="params" style="font-size:13px;">
            <b>Height:</b> ${fav.height} <br>
            <b>Base:</b> ${fav.baseRadius} <br>
            <b>Top:</b> ${fav.topRadius} <br>
            <b>Width:</b> ${fav.width} <br>
            <b>Wall:</b> ${fav.wallThickness} <br>
            <b>Mode:</b> ${fav.mode || 'vase'}
          </div>
          <button class="load-btn" data-idx="${idx}" style="margin:6px 6px 0 0;">Load</button>
          <button class="delete-btn" data-filename="${fav.filename}" style="margin:6px 0 0 0;">Delete</button>
        `;
        container.appendChild(card);
      });
      container.querySelectorAll('.load-btn').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation(); // Prevent event bubbling
          const fav = favorites[btn.dataset.idx];
          loadFavorite(fav);
          panel.style.display = 'none';
        };
      });
      container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation(); // Prevent event bubbling
          const filename = btn.dataset.filename;
          
          if (confirm('Are you sure you want to delete this favorite?')) {
            fetch(`/delete_favorite/${filename}`, { method: 'DELETE' })
              .then(res => res.json())
              .then(() => showFavorites())
              .catch(err => console.error('Delete failed:', err));
          }
        };
      });
      // Hide panel when clicking outside
      panel.onclick = e => {
        if (e.target === panel) panel.style.display = 'none';
      };
    });
}

function importSTL() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.stl';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const loader = new STLLoader();
      const reader = new FileReader();
      reader.onload = (event) => {
        const arrayBuffer = event.target.result;
        const geometry = loader.parse(arrayBuffer);

        // Remove current mesh
        if (mesh) scene.remove(mesh);

        // Store original geometry for transformations
        originalImportedGeometry = geometry.clone();
        isImportedModel = true;

        // Create new mesh from imported geometry
        const material = new THREE.MeshStandardMaterial({
          color: document.getElementById("colorPicker").value,
          metalness: 0.3,
          roughness: 0.7,
          side: THREE.DoubleSide,
        });
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Center camera on imported model
        centerCameraOnVase();
        updateDimensionsDisplay();

        alert('STL model imported successfully! You can now modify height, width, and twist using the sliders.');
      };
      reader.readAsArrayBuffer(file);
    }
  };
  input.click();
}

function exportSTL() {
  const exporter = new STLExporter();
  let exportMesh = mesh;
  // If mesh is a group, merge children for export
  if (exportMesh.type === 'Group') {
    // Use BufferGeometryUtils to merge geometries
    const geometries = exportMesh.children.map(child => {
      child.updateMatrixWorld();
      const geom = child.geometry.clone();
      geom.applyMatrix4(child.matrixWorld);
      return geom;
    });
    // BufferGeometryUtils is available in Three.js examples
    // If not imported, add: import { BufferGeometryUtils } from './BufferGeometryUtils.js';
    const merged = window.BufferGeometryUtils
      ? window.BufferGeometryUtils.mergeBufferGeometries(geometries)
      : geometries[0];
    exportMesh = new THREE.Mesh(merged);
  }
  const stlString = exporter.parse(exportMesh);
  const blob = new Blob([stlString], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'vase_model.stl';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function saveFavorite() {
  // Save current parameters and mode
  const paramsToSave = { ...currentParams, mode: currentMode };
  fetch("/save_favorite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paramsToSave)
  })
    .then(res => res.json())
    .then(() => {
      alert("Favorite Saved Successfully ✅");
      // showSavePopup();
    });

// Show popup notification for successful save
function showSavePopup() {
  let popup = document.getElementById('savePopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'savePopup';
    popup.style.position = 'fixed';
    popup.style.top = '24px';
    popup.style.right = '24px';
    popup.style.background = '#0091ff';
    popup.style.color = '#fff';
    popup.style.padding = '14px 28px';
    popup.style.borderRadius = '8px';
    popup.style.fontSize = '16px';
    popup.style.zIndex = '2000';
    popup.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
    popup.textContent = 'Saved to favorites!';
    document.body.appendChild(popup);
  } else {
    popup.textContent = 'Saved to favorites!';
    popup.style.display = 'block';
  }
  setTimeout(() => {
    popup.style.display = 'none';
  }, 1500);
}
}

function updateSelectedMaterialDisplay() {
  const display = document.getElementById('selectedMaterialDisplay');
  if (selectedMaterial) {
    display.textContent = `Selected Material: ${selectedMaterial.material_name}`;
    display.style.color = '#00afd7';
  } else {
    display.textContent = 'No material selected';
    display.style.color = '#666';
  }
}

function toggleMaterialSection() {
  const objectTypeId = document.getElementById("objectType").value;
  if (!objectTypeId) return;

  const materialPanel = document.getElementById('materialPanel');
  const materialContainer = document.getElementById('materialContainer');
  const showMaterialBtn = document.getElementById('showMaterialBtn');

  if (materialPanel.style.display === 'none') {
    // Show the panel and load materials
    fetch(`/get_materials/${objectTypeId}`)
      .then(res => res.json())
      .then(materials => {
        materialContainer.innerHTML = '';

        if (materials.length === 0) {
          materialContainer.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #666; margin: 20px 0;">No materials available for this object type.</p>';
        } else {
          materials.forEach(material => {
            const card = document.createElement('div');
            card.style.border = '1px solid #ddd';
            card.style.borderRadius = '8px';
            card.style.padding = '15px';
            card.style.backgroundColor = '#f9f9f9';
            card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
            card.style.transition = 'all 0.2s';
            card.style.width = '100%';
            card.style.cursor = 'pointer';

            // Highlight selected material
            if (selectedMaterial && selectedMaterial.id === material.id) {
              card.style.border = '2px solid #007bff';
              card.style.backgroundColor = '#00afd7';
            }

            card.onmouseover = () => {
              if (!selectedMaterial || selectedMaterial.id !== material.id) {
                card.style.transform = 'scale(1.02)';
                card.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
              }
            };
            card.onmouseout = () => {
              if (!selectedMaterial || selectedMaterial.id !== material.id) {
                card.style.transform = 'scale(1)';
                card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
              }
            };

            card.onclick = () => {
              // Toggle selection
              if (selectedMaterial && selectedMaterial.id === material.id) {
                selectedMaterial = null;
              } else {
                selectedMaterial = material;
              }
              updateSelectedMaterialDisplay();
              // Update all cards to reflect selection change
              document.querySelectorAll('#materialContainer > div').forEach(c => {
                if (selectedMaterial && c === card) {
                  c.style.border = '2px solid #007bff';
                  c.style.backgroundColor = '#00afd7';
                } else {
                  c.style.border = '1px solid #ddd';
                  c.style.backgroundColor = '#f9f9f9';
                }
              });
            };

            const nameContainer = document.createElement('div');
            nameContainer.style.display = 'flex';
            nameContainer.style.justifyContent = 'space-between';
            nameContainer.style.alignItems = 'center';
            nameContainer.style.marginBottom = '10px';

            const materialName = document.createElement('h4');
            materialName.textContent = material.material_name;
            materialName.style.margin = '0';
            materialName.style.color = '#333';
            materialName.style.flex = '1';

            const infoBtn = document.createElement('button');
            infoBtn.textContent = 'ℹ️';
            infoBtn.style.background = 'none';
            infoBtn.style.border = 'none';
            infoBtn.style.fontSize = '16px';
            infoBtn.style.cursor = 'pointer';
            infoBtn.style.padding = '2px 6px';
            infoBtn.style.borderRadius = '3px';
            infoBtn.style.transition = 'background-color 0.2s';
            infoBtn.title = 'View material images';

            infoBtn.onmouseover = () => infoBtn.style.backgroundColor = '#e0e0e0';
            infoBtn.onmouseout = () => infoBtn.style.backgroundColor = 'transparent';

            infoBtn.onclick = (e) => {
              e.stopPropagation(); // Prevent card selection
              showMaterialImages(material.id, material.material_name);
            };

            nameContainer.appendChild(materialName);
            nameContainer.appendChild(infoBtn);
            card.appendChild(nameContainer);

            const fields = [
              { label: 'Source', value: material.source },
              { label: 'Aged Cycling', value: material.aged_cycling },
              { label: 'Exposure Type', value: material.exposure_type },
              { label: 'Age Duration', value: material.age_duration },
              { label: 'Additive/Filler Type', value: material.additive_filler_type },
              { label: 'Extrusion Method', value: material.extrusion_method },
              { label: 'Test Name', value: material.test_name },
              { label: 'Metric', value: material.metric },
              { label: 'Value', value: material.value ? `${material.value} ${material.units || ''}` : null },
              { label: 'Notes', value: material.notes }
            ];

            fields.forEach(field => {
              if (field.value) {
                const fieldDiv = document.createElement('div');
                fieldDiv.style.marginBottom = '5px';
                fieldDiv.style.fontSize = '14px';

                const label = document.createElement('strong');
                label.textContent = `${field.label}: `;
                label.style.color = '#555';

                const value = document.createElement('span');
                value.textContent = field.value;
                value.style.color = '#333';

                fieldDiv.appendChild(label);
                fieldDiv.appendChild(value);
                card.appendChild(fieldDiv);
              }
            });

            materialContainer.appendChild(card);
          });
        }

        materialPanel.style.display = 'block';
        showMaterialBtn.textContent = 'Hide Material';
      })
      .catch(err => console.error('Error fetching materials:', err));
  } else {
    // Hide the panel
    materialPanel.style.display = 'none';
    showMaterialBtn.textContent = 'Show Material';
  }
}

function showMaterialImages(materialId, materialName) {
  fetch(`/get_material_images/${materialId}`)
    .then(res => res.json())
    .then(images => {
      // Create popup overlay
      const popup = document.createElement('div');
      popup.style.position = 'fixed';
      popup.style.top = '0';
      popup.style.left = '0';
      popup.style.width = '100%';
      popup.style.height = '100%';
      popup.style.background = 'rgba(0,0,0,0.8)';
      popup.style.zIndex = '3000';
      popup.style.display = 'flex';
      popup.style.alignItems = 'center';
      popup.style.justifyContent = 'center';
      popup.onclick = () => document.body.removeChild(popup);

      // Content container
      const content = document.createElement('div');
      content.style.background = 'white';
      content.style.padding = '20px';
      content.style.borderRadius = '10px';
      content.style.maxWidth = '80%';
      content.style.maxHeight = '80%';
      content.style.overflow = 'auto';
      content.onclick = (e) => e.stopPropagation();

      // Title
      const title = document.createElement('h3');
      title.textContent = `Images for ${materialName}`;
      title.style.marginTop = '0';
      content.appendChild(title);

      // Images or no images message
      if (images.length === 0) {
        const noImages = document.createElement('p');
        noImages.textContent = 'No images available for this material.';
        content.appendChild(noImages);
      } else {
        images.forEach(img => {
          const imgEl = document.createElement('img');
          imgEl.src = `${img.image_path}`;
          imgEl.style.maxWidth = '100%';
          imgEl.style.margin = '10px 0';
          imgEl.style.borderRadius = '5px';
          imgEl.alt = img.description || img.image_name;
          content.appendChild(imgEl);

          // Optional: Add description if available
          if (img.description) {
            const desc = document.createElement('p');
            desc.textContent = img.description;
            desc.style.fontSize = '14px';
            desc.style.color = '#666';
            content.appendChild(desc);
          }
        });
      }

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.style.marginTop = '20px';
      closeBtn.style.padding = '10px 20px';
      closeBtn.style.background = '#007bff';
      closeBtn.style.color = 'white';
      closeBtn.style.border = 'none';
      closeBtn.style.borderRadius = '5px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.onclick = () => document.body.removeChild(popup);
      content.appendChild(closeBtn);

      popup.appendChild(content);
      document.body.appendChild(popup);
    })
    .catch(err => {
      console.error('Error fetching material images:', err);
      alert('Failed to load images. Please try again.');
    });
}

function loadFavorite(fav) {
  // Reset imported model state when loading favorites
  isImportedModel = false;
  originalImportedGeometry = null;

  // Set all sliders and color picker to favorite values
  document.getElementById("height").value = fav.height;
  document.getElementById("baseRadius").value = fav.baseRadius;
  document.getElementById("topRadius").value = fav.topRadius;
  document.getElementById("curvature").value = fav.curvature;
  document.getElementById("taper").value = fav.taper;
  document.getElementById("segments").value = fav.segments;
  document.getElementById("twist").value = fav.twist;
  document.getElementById("waveAmplitude").value = fav.waveAmplitude;
  document.getElementById("waveFrequency").value = fav.waveFrequency;
  document.getElementById("grooveDepth").value = fav.grooveDepth;
  document.getElementById("spiral").value = fav.spiral;
  document.getElementById("colorPicker").value = fav.color;
  document.getElementById("width").value = fav.width;
  document.getElementById("wallThickness").value = fav.wallThickness;
  // Set mode and update button
  currentMode = fav.mode || "vase";
  document.getElementById("modeBtn").textContent = `Mode: ${currentMode.charAt(0).toUpperCase() + currentMode.slice(1)}`;
  document.getElementById("wallThickness").parentElement.style.display = currentMode === "table" ? "none" : "";
  updateVase();
  alert("Favorite loaded ✅");
}
