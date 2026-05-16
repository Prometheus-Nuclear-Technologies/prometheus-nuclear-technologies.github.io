#!/usr/bin/env python3
import sys
from pathlib import Path
try:
    import FreeCAD
    import Part
    from MeshPart import meshFromShape
except Exception as e:
    print('FREECAD_IMPORT_ERROR', e)
    sys.exit(3)

input_path = Path('geometria/iter_0000_nofluid.step')
output_path = Path('geometria/iter_0000_nofluid.stl')
if not input_path.exists():
    print('INPUT_NOT_FOUND', input_path)
    sys.exit(2)

print('Reading STEP:', input_path)
shape = Part.Shape()
shape.read(str(input_path))
print('Tessellating... (this may take a while)')
mesh = meshFromShape(shape, linearDeflection=1.0, angularDeflection=0.5235987756)
print('Writing STL:', output_path)
mesh.write(str(output_path))
print('Done')
