// Advanced GIS preprocessing for snapping and merging adjacent lines in a group using Turf.js
// Usage: preprocessRailLines(features, options)
// Returns a FeatureCollection with merged lines

// Requires Turf.js loaded globally as 'turf'

function processRailLines(features, options = {}) {
    // Default buffer distance in meters (adjust as needed)
    const bufferDist = options.bufferDist || 10;
    // Buffer all lines
    const buffered = features.map(f => turf.buffer(f, bufferDist, { units: 'meters' }));
    // Union all buffered polygons
    let unioned = buffered[0];
    for (let i = 1; i < buffered.length; i++) {
        unioned = turf.union(unioned, buffered[i]);
    }
    // Extract centerlines from unioned polygon
    // Turf does not have true centerline extraction, so we approximate by converting boundaries to lines
    let mergedLines = [];
    if (unioned.geometry.type === 'MultiPolygon') {
        unioned.geometry.coordinates.forEach(poly => {
            mergedLines.push(turf.polygonToLineString({ type: 'Polygon', coordinates: poly }));
        });
    } else if (unioned.geometry.type === 'Polygon') {
        mergedLines.push(turf.polygonToLineString(unioned));
    }
    // Optionally, merge lines if endpoints touch
    let finalLines = mergedLines;
    if (finalLines.length > 1) {
        // Combine into MultiLineString and try to merge
        const fc = turf.featureCollection(finalLines);
        if (turf.lineMerge) {
            finalLines = [turf.lineMerge(turf.combine(fc).features[0])];
        }
    }
    // Return as FeatureCollection
    return turf.featureCollection(finalLines);
}

// Export for use in main app
if (typeof window !== 'undefined') {
    window.preprocessRailLines = preprocessRailLines;
}
