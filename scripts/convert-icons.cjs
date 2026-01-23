const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const inputDir = path.join(__dirname, '../src/assets/icons');
const outputDir = path.join(__dirname, '../src/assets/icons');

// Ensure output directory exists
fs.mkdirSync(outputDir, { recursive: true });

async function convertIcons() {
  for (const size of sizes) {
    const inputFile = path.join(inputDir, `icon${size}.svg`);
    const outputFile = path.join(outputDir, `icon${size}.png`);
    
    const svgContent = fs.readFileSync(inputFile, 'utf8');
    
    await sharp(Buffer.from(svgContent))
      .resize(size, size)
      .png()
      .toFile(outputFile);
    
    console.log(`Created ${outputFile}`);
  }
}

convertIcons().catch(console.error);
