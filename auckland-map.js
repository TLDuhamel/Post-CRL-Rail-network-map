const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [174.7633, -36.8485], // Auckland, NZ
    zoom: 11
});

// Consolidated train service properties
const SERVICE_PROPERTIES = {
    EAST:   { color: '#FFD100', fullName: 'Eastern Line',    offset: -4 },
    WEST:   { color: '#8bc750', fullName: 'East-West Line',  offset: -4 },
    SOUTH:  { color: '#ee3a31', fullName: 'South-City Line', offset: 0  },
    STH:    { color: '#ee3a31', fullName: 'South-City Line', offset: 0  },
    ONE:    { color: '#00b1ee', fullName: 'Onehunga-West Line', offset: -4 },
    PUKE:   { color: '#A7A9AC', fullName: 'Pukekohe Line',   offset: 0  },
    HUIA:   { color: '#f6be16', fullName: 'Te Huia',         offset: -4 }
};


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
                'circle-radius': 5,
                'circle-color': '#ffffffff',
                'circle-stroke-width': 1,
                'circle-stroke-color': '#585858'
            }
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
                    'line-opacity': 0.8
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
                    'line-width': 3,
                    'line-offset': [
                        'match',
                        ['get', 'ROUTENUMBER'],
                        ...Object.entries(SERVICE_PROPERTIES).flatMap(([key, val]) => [key, val.offset]),
                        /* other */ 0
                    ]
                }
            }, 'auckland-railways-hover'); // Add below the hover layer

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
                if (!features || features.length === 0) return;
                let feature;
                // Only select randomly if nothing is already selected
                if (breathObjectId === null) {
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
                } else {
                    // Find the currently selected feature in the hovered features
                    feature = features.find(f => f.properties.OBJECTID === breathObjectId);
                    if (!feature) {
                        // If not found, clear selection
                        map.setFilter('auckland-railways-hover', ['==', 'OBJECTID', -1]);
                        breathing = false;
                        breathObjectId = null;
                        if (breathFrame) cancelAnimationFrame(breathFrame);
                        map.setPaintProperty('auckland-railways-hover', 'line-width', 0);
                        if (hoverTooltip) {
                            hoverTooltip.remove();
                            hoverTooltip = null;
                        }
                        return;
                    }
                }
                const objectId = feature.properties.OBJECTID;
                const routeNum = feature.properties.ROUTENUMBER;
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
});
