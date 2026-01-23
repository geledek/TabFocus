const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const storeDir = path.join(__dirname, '../store');

const assets = [
  { input: 'promo-small.svg', output: 'promo-small.png', width: 440, height: 280 },
  { input: 'promo-marquee.svg', output: 'promo-marquee.png', width: 1400, height: 560 },
];

async function convertAssets() {
  for (const asset of assets) {
    const inputFile = path.join(storeDir, asset.input);
    const outputFile = path.join(storeDir, asset.output);
    
    if (!fs.existsSync(inputFile)) {
      console.log(`Skipping ${asset.input} - file not found`);
      continue;
    }
    
    const svgContent = fs.readFileSync(inputFile, 'utf8');
    
    await sharp(Buffer.from(svgContent))
      .resize(asset.width, asset.height)
      .png()
      .toFile(outputFile);
    
    console.log(`Created ${outputFile}`);
  }
}

convertAssets().catch(console.error);
