const { ipcRenderer } = require('electron');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

const treeContainer = document.getElementById('tree-container');
const svgContainer = document.getElementById('svg-container');
const homePath = os.homedir();

// Initialize folder state and pan functionality
const folderState = {};
let isPanning = false;
let startX = 0;
let startY = 0;

const INITIAL_VIEW_WIDTH = 3000;
const INITIAL_VIEW_HEIGHT = 2000;
const NODE_PADDING = 400;           // Increase padding for text in nodes
const MIN_NODE_WIDTH = 2500;        // Increase minimum width for nodes
const NODE_HEIGHT = 200;            // Increase node height for better visibility
const NODE_WIDTH_PADDING = 200;     // More padding for wider boxes
const MIN_HORIZONTAL_SPACING = 150; // Increase spacing between nodes
const VERTICAL_SPACING = 250;       // Increase vertical spacing between levels
const MAX_ZOOM = 5;                 // Maximum zoom level
const MIN_ZOOM = 0.1;               // Minimum zoom level
const ZOOM_STEP = 0.1;              // Zoom step size
const ZOOM_PAN_SPEED = 0.1;         // Speed of zoom and pan


// Variables to track the SVG viewBox dimensions
let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;

// Initialize SVG viewBox
function initializeSVG() {
    const centerX = INITIAL_VIEW_WIDTH / 2;
    const centerY = INITIAL_VIEW_HEIGHT / 2;
    treeContainer.setAttribute('viewBox', `${-centerX} ${-centerY} ${INITIAL_VIEW_WIDTH} ${INITIAL_VIEW_HEIGHT}`);
    treeContainer.setAttribute('width', '100%');
    treeContainer.setAttribute('height', '100%');
}

// Pan functionality
function initializePanAndZoom() {
    let viewBox = { x: -INITIAL_VIEW_WIDTH / 2, y: -INITIAL_VIEW_HEIGHT / 2, w: INITIAL_VIEW_WIDTH, h: INITIAL_VIEW_HEIGHT };

    svgContainer.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            isPanning = true;
            startX = e.clientX;
            startY = e.clientY;
            svgContainer.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;

        const dx = (e.clientX - startX) * (viewBox.w / svgContainer.clientWidth);
        const dy = (e.clientY - startY) * (viewBox.h / svgContainer.clientHeight);

        viewBox.x = Math.max(-INITIAL_VIEW_WIDTH, Math.min(INITIAL_VIEW_WIDTH, viewBox.x - dx));
        viewBox.y = Math.max(-INITIAL_VIEW_HEIGHT, Math.min(INITIAL_VIEW_HEIGHT, viewBox.y - dy));

        treeContainer.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);

        startX = e.clientX;
        startY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        svgContainer.style.cursor = 'grab';
    });

    svgContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY;
        const scale = delta > 0 ? 1.1 : 0.9;

        const pt = treeContainer.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(treeContainer.getScreenCTM().inverse());

        viewBox.w *= scale;
        viewBox.h *= scale;
        viewBox.x = svgP.x - (svgP.x - viewBox.x) * scale;
        viewBox.y = svgP.y - (svgP.y - viewBox.y) * scale;

        treeContainer.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    }, { passive: false });
}

function getTextWidth(text, fontSize = '240px') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${fontSize} sans-serif`;
    return context.measureText(text).width + NODE_PADDING * 2;
}

function calculateNodeWidth(text) {
    return Math.max(MIN_NODE_WIDTH, getTextWidth(text));
}

function initializeHomeButton() {
  const buttonWidth = 1500;
  const buttonHeight = 500;
  const centerX = 0;
  const centerY = 0;

  const homeButtonContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  
  const buttonBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  buttonBg.setAttribute('x', centerX - buttonWidth / 2);
  buttonBg.setAttribute('y', centerY - buttonHeight / 2);
  buttonBg.setAttribute('width', buttonWidth);
  buttonBg.setAttribute('height', buttonHeight);
  buttonBg.setAttribute('rx', '10');
  buttonBg.setAttribute('ry', '10');
  buttonBg.setAttribute('class', 'home-button-bg');
  
  const buttonText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  buttonText.setAttribute('x', centerX);
  buttonText.setAttribute('y', centerY + 10); // Adjusted y position for better centering
  buttonText.setAttribute('text-anchor', 'middle');
  buttonText.setAttribute('class', 'home-button-text');
  buttonText.style.fontSize = "20px";  // Increased font size for the button text
  buttonText.textContent = '🏠 Home';

  homeButtonContainer.appendChild(buttonBg);
  homeButtonContainer.appendChild(buttonText);
  treeContainer.appendChild(homeButtonContainer);

  homeButtonContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      treeContainer.innerHTML = '';
      addArrowMarker();
      initializeHomeButton();
      loadFolderTree(homePath, 0, centerY + 100, 0, INITIAL_VIEW_WIDTH - 100);
  });

  return centerY + 100;
}

async function loadFolderTree(folderPath, x, y, depth = 0, availableWidth = 1000) {
    minX = Infinity;
    maxX = -Infinity;
    minY = Infinity;
    maxY = -Infinity;

    try {
        const items = await ipcRenderer.invoke('get-folder-contents', folderPath);
        const visibleItems = items.filter(item => !item.name.startsWith('.'));

        if (visibleItems.length === 0) return;

        if (depth === 0) {
            const radius = VERTICAL_SPACING * 20;
            visibleItems.forEach((item, index) => {
                const angle = (index / visibleItems.length) * 2 * Math.PI;
                const nodeX = x + radius * Math.cos(angle);
                const nodeY = y + radius * Math.sin(angle);

                drawCurvedLineWithArrow(x, y, nodeX, nodeY);
                drawNode(item, nodeX, nodeY, folderPath, depth, calculateNodeWidth(item.name));

                minX = Math.min(minX, nodeX);
                maxX = Math.max(maxX, nodeX);
                minY = Math.min(minY, nodeY);
                maxY = Math.max(maxY, nodeY);

                if (item.isDirectory && folderState[path.join(folderPath, item.name)]) {
                    loadFolderTree(
                        path.join(folderPath, item.name),
                        nodeX,
                        nodeY,
                        depth + 1,
                        availableWidth / 1.5
                    );
                }
            });
        } else {
            const verticalSpacing = VERTICAL_SPACING * 20;
            let currentX = x - calculateChildrenWidth(visibleItems) / 2;
            const newY = y + verticalSpacing + 100;

            for (const item of visibleItems) {
                const nodeWidth = calculateNodeWidth(item.name);
                const nodeX = currentX + nodeWidth / 2;

                drawCurvedLineWithArrow(x, y, nodeX, newY);
                drawNode(item, nodeX, newY, folderPath, depth, nodeWidth);

                minX = Math.min(minX, nodeX);
                maxX = Math.max(maxX, nodeX);
                minY = Math.min(minY, newY);
                maxY = Math.max(maxY, newY);

                if (item.isDirectory && folderState[path.join(folderPath, item.name)]) {
                    await loadFolderTree(
                        path.join(folderPath, item.name),
                        nodeX,
                        newY,
                        depth + 1,
                        availableWidth / 1.5
                    );
                }

                currentX += nodeWidth + MIN_HORIZONTAL_SPACING * 20;
            }
        }

        updateSVGViewBox();
    } catch (error) {
        console.error('Error loading folder:', error);
    }
}

function updateSVGViewBox() {
    const padding = 100;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    const viewBoxX = minX - padding;
    const viewBoxY = minY - padding;

    treeContainer.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${width} ${height}`);
    treeContainer.setAttribute('width', '100%');
    treeContainer.setAttribute('height', '100%');
}


function drawNode(item, x, y, width, parentPath) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x - width / 2);
  rect.setAttribute('y', y - NODE_HEIGHT / 2);
  rect.setAttribute('width', width);
  rect.setAttribute('height', NODE_HEIGHT);
  rect.setAttribute('rx', '10');
  rect.setAttribute('ry', '10');
  rect.setAttribute('class', 'node-rect');
  
  // Set background color and border for better contrast
  rect.style.fill = "#f0f0f0";  // Light background color
  rect.style.stroke = "#666";  // Border color
  rect.style.strokeWidth = "0.5";  // Thinner border

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', x);
  text.setAttribute('y', y + 10); // Adjusted y position for better centering
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'node-text');
  text.textContent = item.name;

  // Increased font size for better readability
  text.style.fontSize = "20px";  // Increased font size
  text.style.fill = "#333";  // Darker text color

  rect.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.isDirectory) {
          folderState[path.join(parentPath, item.name)] = !folderState[path.join(parentPath, item.name)];
          loadFolderTree(homePath, 0, initializeHomeButton(), 0, INITIAL_VIEW_WIDTH - 100);
      } else {
          exec(`"${item.path}"`);
      }
  });

  group.appendChild(rect);
  group.appendChild(text);
  treeContainer.appendChild(group);
}



function drawCurvedLineWithArrow(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - VERTICAL_SPACING;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x1},${y1} Q${midX},${midY} ${x2},${y2}`);
  path.setAttribute('class', 'line');
  path.setAttribute('marker-end', 'url(#arrow)');

  // Set line thickness to a thinner stroke
  path.style.strokeWidth = "1";  // Adjust thickness to 1 or as needed
  path.style.stroke = "#333";  // Change color to a lighter shade for readability

  treeContainer.appendChild(path);
}


function addArrowMarker() {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '5');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    marker.setAttribute('class', 'arrow-marker');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    marker.appendChild(path);
    treeContainer.appendChild(marker);
}

document.addEventListener('DOMContentLoaded', () => {
    addArrowMarker();
    initializeSVG();
    initializeHomeButton();
    initializePanAndZoom();
    loadFolderTree(homePath, 0, initializeHomeButton(), 0, INITIAL_VIEW_WIDTH - 100);
});
