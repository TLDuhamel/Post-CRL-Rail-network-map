const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [174.7633, -36.8485], // Auckland, NZ
    zoom: 11
});

// Consolidated train service properties
const SERVICE_PROPERTIES = {
    EAST:   { color: '#FFD100', fullName: 'Eastern Line',    offset: -1 },
    WEST:   { color: '#8bc750', fullName: 'East-West Line',  offset: -1 },
    STH:    { color: '#ee3a31', fullName: 'South-City Line', offset: 0  },
    ONE:    { color: '#00b1ee', fullName: 'Onehunga-West Line', offset: -1 },
    HUIA:   { color: '#f6be16', fullName: 'Te Huia',         offset: -1 }
};

// Add this after map initialization, before map.on('load', ...)
const toggleContainer = document.createElement('div');
toggleContainer.style.cursor = 'pointer';
toggleContainer.style.position = 'absolute';
toggleContainer.style.top = '16px';
toggleContainer.style.right = '16px';
toggleContainer.style.zIndex = '10';
toggleContainer.style.background = 'rgba(255,255,255,0.95)';
toggleContainer.style.padding = '6px 6px';
toggleContainer.style.borderRadius = '6px';
toggleContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
toggleContainer.style.fontFamily = 'Arial, sans-serif';

const toggleLabel = document.createElement('label');
toggleLabel.style.cursor = 'pointer';
toggleLabel.style.fontWeight = 'bold';
toggleLabel.style.userSelect = 'none';
toggleLabel.innerText = 'Show Te Huia';

const toggleCheckbox = document.createElement('input');
toggleCheckbox.style.cursor = 'pointer';
toggleCheckbox.type = 'checkbox';
toggleCheckbox.checked = false;
toggleCheckbox.style.marginRight = '8px';

toggleLabel.prepend(toggleCheckbox);
toggleContainer.appendChild(toggleLabel);
document.body.appendChild(toggleContainer);

toggleContainer.addEventListener('click', () => {
    toggleCheckbox.checked = !toggleCheckbox.checked;
    toggleCheckbox.dispatchEvent(new Event('change'));
});

// Prevent label/checkbox default click from double-toggling
toggleCheckbox.addEventListener('click', (e) => {
    e.stopPropagation();
});
toggleLabel.addEventListener('click', (e) => {
    e.stopPropagation();
});

map.on('load', () => {
    Promise.all([
        fetch('./post-CRL-lines.geojson').then(res => res.json()),
        fetch('./OpenData_RailStation.geojson').then(res => res.json())
    ]).then(([railData, stationData]) => {
        // --- Add train stations ---
        stationData.features.forEach(f => {
            var input = f.properties.STOPNAME;
            var name = input.replace(/\s*Train Station.*$/, "");
            f.properties.CLEANNAME = name;
        });
        map.addSource('auckland-rail-stations', {
            type: 'geojson',
            data: stationData
        });
        map.addLayer({
            id: 'auckland-rail-stations-circle',
            type: 'circle',
            source: 'auckland-rail-stations',
            paint: {
                'circle-radius': 6,
                'circle-color': '#f5f5f5ff',
                'circle-stroke-width': 1.4,
                'circle-stroke-color': '#727272ff'
            },
            minzoom: 10
        });
        map.addLayer({
            id: 'auckland-rail-stations-label',
            type: 'symbol',
            source: 'auckland-rail-stations',
            layout: {
                'text-field': ['get', 'CLEANNAME'],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 12,
                'text-offset': [0, .9],
                'text-anchor': 'top'
            },
            paint: {
                'text-color': '#656565ff',
                'text-halo-color': '#fff',
                'text-halo-width': 2
            },
            minzoom: 11
        });

        // --- Process and add rail lines ---
        function preprocessRailways() {
            // Dissolve features by ROUTENUMBER
            const groups = {};
            railData.features.forEach(f => {
                const route = f.properties.ROUTENUMBER;
                if (!groups[route]) groups[route] = [];
                groups[route].push(f);
            });
            const dissolved = { type: 'FeatureCollection', features: [] };
            let objectId = 1;
            for (const route in groups) {
                // Combine all line features for this route into a MultiLineString
                const fc = { type: 'FeatureCollection', features: groups[route] };
                let combined = turf.combine(fc);
                let snapped = combined;
                if (combined.features[0].geometry.type === 'MultiLineString') {
                    console.log('Snapping MultiLineString to LineString');
                    snapped = combined.features[0];
                }
                snapped.properties = snapped.properties || {};
                snapped.properties.ROUTENUMBER = route;
                snapped.properties.OBJECTID = objectId++;
                dissolved.features.push(snapped);
                console.log(snapped)
            }
            map.addSource('auckland-railways', {
                type: 'geojson',
                data: dissolved
            });
            // Add invisible wide line layer for easier hover hitbox
            map.addLayer({
                id: 'auckland-railways-hover-hitbox',
                type: 'line',
                source: 'auckland-railways',
                layout: {},
                paint: {
                    'line-color': 'rgba(0,0,0,0)',
                    'line-width': 18,
                    'line-opacity': 0
                }
            });
            // Add highlight layer for breathing effect
            map.addLayer({
                id: 'auckland-railways-hover',
                type: 'line',
                source: 'auckland-railways',
                layout: {},
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'ROUTENUMBER'],
                        ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.color]),
                        /* other */ '#e63946'
                    ],
                    'line-width': 0,
                    'line-opacity': 1,
                    'line-offset': [
                        'interpolate', ['linear'], ['zoom'],
                        10, [
                            'match',
                            ['get', 'ROUTENUMBER'],
                            ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.offset * 4]),
                            /* other */ 0
                        ],
                        16, [
                            'match',
                            ['get', 'ROUTENUMBER'],
                            ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.offset * 12]),
                            /* other */ 0
                        ]
                    ]
                },
                filter: ['==', 'OBJECTID', -1]
            }, 'auckland-rail-stations-circle'); // Add below stations

            // Add main rail line layer below stations
            map.addLayer({
                id: 'auckland-railways',
                type: 'line',
                source: 'auckland-railways',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'ROUTENUMBER'],
                        ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.color]),
                        /* other */ '#e63946'
                    ],
                    'line-width': [
                        'interpolate', ['linear'], ['zoom'],
                        10, 4, // at zoom 10, 4 pixels
                        16, 13  // at zoom 16, 13 pixels
                    ],
                    'line-offset': [
                        'interpolate', ['linear'], ['zoom'],
                        10, [
                            'match',
                            ['get', 'ROUTENUMBER'],
                            ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.offset * 4]),
                            /* other */ 0
                        ],
                        16, [
                            'match',
                            ['get', 'ROUTENUMBER'],
                            ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.offset * 12]),
                            /* other */ 0
                        ]
                    ]
                }
            }, 'auckland-railways-hover'); // Add below the hover layer

            // --- Te Huia toggle logic ---
            function setTeHuiaVisibility(visible) {
                // Filter out Te Huia from the main railways layer
                const filter = visible
                    ? ['all']
                    : ['all', ['!=', ['get', 'ROUTENUMBER'], 'HUIA']];
                map.setFilter('auckland-railways', filter);
                map.setFilter('auckland-railways-hover-hitbox', filter);
                map.setFilter('auckland-railways-hover', filter);
            }

            toggleCheckbox.addEventListener('change', () => {
                setTeHuiaVisibility(toggleCheckbox.checked);
            });

            // Ensure initial state
            setTeHuiaVisibility(toggleCheckbox.unchecked);

            // --- Breathing hover and tooltip logic ---
            let breathing = false;
            let breathFrame = null;
            let breathStart = null;
            let breathObjectId = null;
            let previousBreathObjectId = null;
            let hoverTooltip = null;

            function animateBreath() {
                if (!breathing || breathObjectId === null) return;
                const t = ((performance.now() - breathStart) / 1500) % 2;
                const width = 4 + 7 * Math.abs(Math.sin(Math.PI * t));
                map.setPaintProperty('auckland-railways-hover', 'line-width', width);
                breathFrame = requestAnimationFrame(animateBreath);
            }

            map.on('mousemove', 'auckland-railways-hover-hitbox', function (e) {
                const features = e.features;
                if (breathObjectId || !features || features.length === 0) return;
                let feature;

                // Filter out previously selected ID
                const selectable = features.filter(f => f.properties.OBJECTID !== previousBreathObjectId);
                if (selectable.length === 0)  {
                    feature = features[0]; // Only the one feature is at this location, we want that one.
                } else {
                    feature = selectable[Math.floor(Math.random() * selectable.length)];
                }
                const objectId = feature.properties.OBJECTID;
                const routeNum = feature.properties.ROUTENUMBER;
                // Set highlight filter
                map.setFilter('auckland-railways-hover', ['==', 'OBJECTID', objectId]);
                breathObjectId = objectId;
                if (!breathing) {
                    breathing = true;
                    breathStart = performance.now();
                    animateBreath();
                }
                // Tooltip
                if (!hoverTooltip) {
                    hoverTooltip = document.createElement('div');
                    hoverTooltip.style.position = 'absolute';
                    hoverTooltip.style.pointerEvents = 'none';
                    hoverTooltip.style.padding = '4px 10px';
                    hoverTooltip.style.borderRadius = '4px';
                    hoverTooltip.style.fontWeight = 'bold';
                    hoverTooltip.style.fontFamily = 'Arial, Arial Bold, Arial Black, sans-serif';
                    hoverTooltip.style.background = 'rgba(255,255,255,0.95)';
                    hoverTooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                    document.body.appendChild(hoverTooltip);
                }
                // Get color and full name from SERVICE_PROPERTIES
                const props = SERVICE_PROPERTIES[routeNum] || {};
                const color = props.color || '#e63946';
                const fullName = props.fullName || routeNum;
                hoverTooltip.innerHTML = fullName;
                hoverTooltip.style.color = color;
                // Position tooltip
                const mapRect = map.getContainer().getBoundingClientRect();
                hoverTooltip.style.left = (e.point.x + mapRect.left + 12) + 'px';
                hoverTooltip.style.top = (e.point.y + mapRect.top - 24) + 'px';
            });

            map.on('mouseleave', 'auckland-railways-hover-hitbox', function () {
                map.setFilter('auckland-railways-hover', ['==', 'OBJECTID', -1]);
                breathing = false;
                previousBreathObjectId = breathObjectId;
                breathObjectId = null;
                if (breathFrame) cancelAnimationFrame(breathFrame);
                map.setPaintProperty('auckland-railways-hover', 'line-width', 0);
                if (hoverTooltip) {
                    hoverTooltip.remove();
                    hoverTooltip = null;
                }
            });

            map.on('click', 'auckland-railways-hover-hitbox', function (e) {
                // Implement popup functionality here 
            });

            map.on('mouseenter', 'auckland-railways-hover-hitbox', function () {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'auckland-railways-hover-hitbox', function () {
                map.getCanvas().style.cursor = '';
            });
        }

        if (window.turf) {
            preprocessRailways();
        } else {
            turfScript.onload = preprocessRailways;
        }
    });

    // Add a new railway layer using the online source
    fetch('https://services2.arcgis.com/JkPEgZJGxhSjYOo0/arcgis/rest/services/TrainService/FeatureServer/1/query?outFields=*&where=1%3D1&f=geojson')
        .then(response => response.json())
        .then(onlineRailData => {
            // Preprocessing: only keep the longest route for each ROUTENUMBER,
            // and only keep ROUTENAMEs containing "To Brit" or "Onehunga To Newmarket"
            const filtered = {};
            onlineRailData.features.forEach(f => {
                const routeNum = f.properties.ROUTENUMBER;
                const routeName = f.properties.ROUTENAME || '';
                const length = f.properties.Shape__Length || 0;
                if (
                    routeName.includes('To Brit') ||
                    routeName.includes('Onehunga To Newmarket')
                ) {
                    if (!filtered[routeNum] || length > filtered[routeNum].properties.Shape__Length) {
                        filtered[routeNum] = f;
                    }
                }
            });
            const longestFeatures = Object.values(filtered);
            const processedGeojson = {
                type: 'FeatureCollection',
                features: longestFeatures
            };

            map.addSource('auckland-railways-online', {
                type: 'geojson',
                data: processedGeojson
            });
            map.addLayer({
                id: 'auckland-railways-online',
                type: 'line',
                source: 'auckland-railways-online',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'ROUTENUMBER'],
                        ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.color]),
                        /* other */ '#e63946'
                    ],
                    'line-width': [
                        'interpolate', ['linear'], ['zoom'],
                        10, 4, // at zoom 10, 4 pixels
                        16, 13  // at zoom 16, 13 pixels
                    ],
                    'line-offset': [
                        'interpolate', ['linear'], ['zoom'],
                        10, [
                            'match',
                            ['get', 'ROUTENUMBER'],
                            ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.offset * 4]),
                            /* other */ 0
                        ],
                        16, [
                            'match',
                            ['get', 'ROUTENUMBER'],
                            ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.offset * 12]),
                            /* other */ 0
                        ]
                    ],
                }
            }, 'auckland-railways-hover'); // Add below the hover layer
        });
});

// Add UI toggle for railways source
const railSourceToggleContainer = document.createElement('div');
railSourceToggleContainer.style.position = 'absolute';
railSourceToggleContainer.style.top = '16px';
railSourceToggleContainer.style.left = '50%';
railSourceToggleContainer.style.transform = 'translateX(-50%)';
railSourceToggleContainer.style.zIndex = '20';
railSourceToggleContainer.style.background = 'rgba(255,255,255,0.95)';
railSourceToggleContainer.style.padding = '8px 20px';
railSourceToggleContainer.style.borderRadius = '8px';
railSourceToggleContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
railSourceToggleContainer.style.fontFamily = 'Arial, sans-serif';
railSourceToggleContainer.style.display = 'flex';
railSourceToggleContainer.style.gap = '16px';
railSourceToggleContainer.style.alignItems = 'center';

const afterCRLLabel = document.createElement('label');
afterCRLLabel.style.cursor = 'pointer';
afterCRLLabel.style.fontWeight = 'bold';
afterCRLLabel.innerText = 'After CRL';

const beforeCRLLabel = document.createElement('label');
beforeCRLLabel.style.cursor = 'pointer';
beforeCRLLabel.style.fontWeight = 'bold';
beforeCRLLabel.innerText = 'Before CRL';

const afterCRLRadio = document.createElement('input');
afterCRLRadio.type = 'radio';
afterCRLRadio.name = 'railSource';
afterCRLRadio.checked = true;
afterCRLRadio.style.marginRight = '6px';

const beforeCRLRadio = document.createElement('input');
beforeCRLRadio.type = 'radio';
beforeCRLRadio.name = 'railSource';
beforeCRLRadio.checked = false;
beforeCRLRadio.style.marginRight = '6px';

afterCRLLabel.prepend(afterCRLRadio);
beforeCRLLabel.prepend(beforeCRLRadio);
railSourceToggleContainer.appendChild(afterCRLLabel);
railSourceToggleContainer.appendChild(beforeCRLLabel);
document.body.appendChild(railSourceToggleContainer);

// Helper to set visibility of layers
function setRailLayerVisibility(showOnline) {
    if (map.getLayer('auckland-railways-online')) {
        map.setLayoutProperty('auckland-railways-online', 'visibility', showOnline ? 'visible' : 'none');
    }
    if (map.getLayer('auckland-railways')) {
        map.setLayoutProperty('auckland-railways', 'visibility', showOnline ? 'none' : 'visible');
    }
    if (map.getLayer('auckland-railways-hover')) {
        map.setLayoutProperty('auckland-railways-hover', 'visibility', showOnline ? 'none' : 'visible');
    }
    if (map.getLayer('auckland-railways-hover-hitbox')) {
        map.setLayoutProperty('auckland-railways-hover-hitbox', 'visibility', showOnline ? 'none' : 'visible');
    }
}

// Toggle logic
afterCRLRadio.addEventListener('change', () => {
    if (afterCRLRadio.checked) {
        setRailLayerVisibility(false);
    }
});
beforeCRLRadio.addEventListener('change', () => {
    if (beforeCRLRadio.checked) {
        setRailLayerVisibility(true);
    }
});

// Ensure correct initial visibility after all layers are loaded
map.on('idle', () => {
    setRailLayerVisibility(beforeCRLRadio.checked);
});
