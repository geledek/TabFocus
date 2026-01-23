#!/bin/bash

# Build the extension first
npm run build

# Create package directory
PACKAGE_DIR="package"
rm -rf $PACKAGE_DIR
mkdir -p $PACKAGE_DIR

# Get version from manifest
VERSION=$(grep '"version"' dist/manifest.json | sed 's/.*"version": "\([^"]*\)".*/\1/')

# Create zip file
ZIP_NAME="tabfocus-v${VERSION}.zip"
cd dist
zip -r "../${PACKAGE_DIR}/${ZIP_NAME}" . -x "*.map"
cd ..

echo ""
echo "============================================"
echo "Package created: ${PACKAGE_DIR}/${ZIP_NAME}"
echo "============================================"
echo ""
echo "Ready for Chrome Web Store upload!"
