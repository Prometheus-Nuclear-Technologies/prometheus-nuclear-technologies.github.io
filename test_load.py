import sys
import FreeCAD
import Import
import Mesh
import Part

print("Loading step file...")
try:
    doc = FreeCAD.newDocument("Test")
    Import.insert("geometria/iter_0000.stp", doc.Name)
    print(f"Loaded {len(doc.Objects)} objects")
except Exception as e:
    print(f"Error: {e}")
