const fs = require('fs');
const path = require('path');

// Generate a simple SVG thumbnail
const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#6A5ACD" />
  <text x="50%" y="180" font-family="Arial, sans-serif" font-size="36" fill="#ffffff" text-anchor="middle">
    ChatterTV
  </text>
  <text x="50%" y="220" font-family="Arial, sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">
    Recovered Video
  </text>
</svg>
`;

// Save this as an SVG
fs.writeFileSync('thumbnails/default-thumbnail.svg', svgContent);
console.log('Created SVG thumbnail');

// Now the application should use the SVG thumbnail
