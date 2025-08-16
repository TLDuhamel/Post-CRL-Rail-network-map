// Fetch Auckland railways GeoJSON and add to map
// Load Turf.js
const turfScript = document.createElement('script');
turfScript.src = 'https://cdn.jsdelivr.net/npm/@turf/turf@6.5.0/turf.min.js';
document.head.appendChild(turfScript);

fetch('./OpenData_RailService.geojson')
    .then(response => response.json())
    .then(data => {
        // Wait for Turf to load, or run immediately if already loaded
        function preprocessRailways() {
            console.log('Turf.js loaded, starting preprocessing...');
            // Dissolve features by ROUTENUMBER
            const groups = {};
            data.features.forEach(f => {
                const route = f.properties.ROUTENUMBER;
                if (!groups[route]) groups[route] = [];
                groups[route].push(f);
            });
            console.log('Grouped features by ROUTENUMBER:', Object.keys(groups));
            const dissolved = { type: 'FeatureCollection', features: [] };
            let objectId = 1;
            for (const route in groups) {
                console.log(`Processing route: ${route}, features:`, groups[route].length);
                // Combine all line features for this route into a MultiLineString
                const fc = { type: 'FeatureCollection', features: groups[route] };
                let combined = turf.combine(fc);
                console.log(`Combined geometry for ${route}:`, combined.features[0].geometry.type);
                // Snap lines into a single cohesive LineString if possible
                let snapped = combined;
                if (combined.features[0].geometry.type === 'MultiLineString') {
                    snapped = combined.features[0];
                }
                // Assign a new OBJECTID for each dissolved line
                snapped.properties = snapped.properties || {};
                snapped.properties.ROUTENUMBER = route;
                snapped.properties.OBJECTID = objectId++;
                dissolved.features.push(snapped);
            }
            console.log('Final dissolved FeatureCollection:', dissolved);
            map.addSource('auckland-railways', {
                type: 'geojson',
                data: dissolved
            });
            // ...existing code for adding layers and events...
            map.addLayer({
                id: 'auckland-railways',
                type: 'line',
                source: 'auckland-railways',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'ROUTENUMBER'],
                        'EAST', '#FFD100',      // Eastern Line (Yellow)
                        'WEST', '#009A44',      // Western Line (Green)
                        'SOUTH', '#E4002B',     // Southern Line (Red)
                        'ONE', '#4FC3F7',       // Onehunga Line (Light Blue)
                        'PUKE', '#A7A9AC',      // Pukekohe Line (Grey)
                        'HUIA', '#6C3483',      // Te Huia (Purple)
                        /* other */ '#e63946'
                    ],
                    'line-width': 3
                }
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
                        'EAST', '#FFD100',
                        'WEST', '#009A44',
                        'SOUTH', '#E4002B',
                        'ONE', '#4FC3F7',
                        'PUKE', '#A7A9AC',
                        'HUIA', '#6C3483',
                        /* other */ '#e63946'
                    ],
                    'line-width': 0,
                    'line-opacity': 0.8
                },
                filter: ['==', 'OBJECTID', -1]
            });
        }

        if (window.turf) {
            preprocessRailways();
        } else {
            turfScript.onload = preprocessRailways;
        }

        // Animation state
        let breathing = false;
        let breathFrame = null;
        let breathStart = null;
        let breathObjectId = null;

        function animateBreath() {
            if (!breathing || breathObjectId === null) return;
            const t = ((performance.now() - breathStart) / 1500) % 2;
            // Breathing between 6 and 12 px
            const width = 6 + 4 * Math.abs(Math.sin(Math.PI * t));
            map.setPaintProperty('auckland-railways-hover', 'line-width', width);
            breathFrame = requestAnimationFrame(animateBreath);
        }

        // Tooltip element
        let hoverTooltip = null;

    

    map.on('mousemove', 'auckland-railways-hover-hitbox', function (e) {
            const feature = e.features && e.features[0];
            if (!feature) return;
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
                // Get color and full name
                var color = '#e63946';
                var fullName = routeNum;
                if (routeNum === 'EAST') { color = '#FFD100'; fullName = 'Eastern Line'; }
                else if (routeNum === 'WEST') { color = '#009A44'; fullName = 'Western Line'; }
                else if (routeNum === 'SOUTH' || routeNum === 'STH') { color = '#E4002B'; fullName = 'Southern Line'; }
                else if (routeNum === 'ONE') { color = '#4FC3F7'; fullName = 'Onehunga Line'; }
                else if (routeNum === 'PUKE') { color = '#A7A9AC'; fullName = 'Pukekohe Line'; }
                else if (routeNum === 'HUIA') { color = '#6C3483'; fullName = 'Te Huia'; }
                hoverTooltip.innerHTML = fullName;
                hoverTooltip.style.color = color;
                // Position tooltip
                const mapRect = map.getContainer().getBoundingClientRect();
                hoverTooltip.style.left = (e.point.x + mapRect.left + 12) + 'px';
                hoverTooltip.style.top = (e.point.y + mapRect.top - 24) + 'px';
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
                hoverTooltip.style.fontFamily = 'Gotham Ultra Narrow, Arial Narrow, Arial, sans-serif';
                hoverTooltip.style.background = 'rgba(255,255,255,0.95)';
                hoverTooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                document.body.appendChild(hoverTooltip);
            }
        });

    map.on('mouseleave', 'auckland-railways-hover-hitbox', function () {
            map.setFilter('auckland-railways-hover', ['==', 'OBJECTID', -1]);
            breathing = false;
            breathObjectId = null;
            if (breathFrame) cancelAnimationFrame(breathFrame);
            map.setPaintProperty('auckland-railways-hover', 'line-width', 0);
            if (hoverTooltip) {
                hoverTooltip.remove();
                hoverTooltip = null;
            }
        });

        // Add click event for popup
    map.on('click', 'auckland-railways-hover-hitbox', function (e) {
            const feature = e.features && e.features[0];
            if (feature) {
                const coordinates = e.lngLat;
                const props = feature.properties;
                let table = '<table style="border-collapse:collapse;">';
                for (const key in props) {
                    if (props.hasOwnProperty(key)) {
                        table += `<tr><td style='border:1px solid #ccc;padding:2px 6px;'><strong>${key}</strong></td><td style='border:1px solid #ccc;padding:2px 6px;'>${props[key]}</td></tr>`;
                    }
                }
                table += '</table>';
                new maplibregl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(table)
                    .addTo(map);
            }
        });

        // Change cursor to pointer when hovering over rail lines
        map.on('mouseenter', 'auckland-railways-hover-hitbox', function () {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'auckland-railways-hover-hitbox', function () {
            map.getCanvas().style.cursor = '';
        });
    })
    .then(() => {

    // Add train stations as labeled points
    fetch('./OpenData_RailStation.geojson')
        .then(response => response.json())
        .then(stationData => {
            stationData.features.forEach(f => {
                var input = f.properties.STOPNAME;
                var name = input.replace(/\s*Train Station.*$/, "");
                f.properties.CLEANNAME = name;
            });
            map.addSource('auckland-rail-stations', {
                type: 'geojson',
                data: stationData
            });
            // Add station circles
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
            // Add station labels, only at zoom level 12 and above
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
                }
                ,
                minzoom: 11
            });
        });
    });


const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [174.7633, -36.8485], // Auckland, NZ
    zoom: 12
});
