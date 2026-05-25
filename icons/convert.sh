#!/bin/bash
# Convert all SVGs in this directory to 256x256 PNGs using macOS WebKit
DIR="$(cd "$(dirname "$0")" && pwd)"

for svg in "$DIR"/*.svg; do
  name=$(basename "$svg" .svg)
  png="$DIR/${name}.png"
  osascript -l JavaScript -e "
    ObjC.import('AppKit');
    ObjC.import('Foundation');
    const svgPath = '$svg';
    const pngPath = '$png';
    const size = 256;
    const data = \$.NSData.dataWithContentsOfFile(svgPath);
    const img = \$.NSImage.alloc.initWithData(data);
    const rep = \$.NSBitmapImageRep.alloc.initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(null, size, size, 8, 4, true, false, \$.NSCalibratedRGBColorSpace, 0, 0);
    \$.NSGraphicsContext.setCurrentContext(\$.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
    img.drawInRect_fromRect_operation_fraction(\$.NSMakeRect(0,0,size,size), \$.NSZeroRect, \$.NSCompositingOperationSourceOver, 1.0);
    const png = rep.representationUsingType_properties(\$.NSBitmapImageFileTypePNG, \$.NSDictionary.dictionary);
    png.writeToFile_atomically(pngPath, true);
  " 2>/dev/null
  echo "  $name.svg → $name.png"
done
