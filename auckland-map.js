const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [174.7633, -36.8485], // Auckland, NZ
    zoom: 11
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
                        'EAST', '#FFD100',
                        'WEST', '#009A44',
                        'SOUTH', '#E4002B',
                        'ONE', '#4FC3F7',
                        'PUKE', '#A7A9AC',
                        'HUIA', '#6C3483',
                        /* other */ '#e63946'
                    ],
                    'line-width': 3,
                    'line-offset': [
                        'match',
                        ['get', 'ROUTENUMBER'],
                        'WEST', -4,
                        'ONE', -4,
                        'SOUTH', 0,
                        'EAST', -4,
                        /* other */ 0
                    ]
                }
            }, 'auckland-railways-hover'); // Add below the hover layer

            // --- Breathing hover and tooltip logic ---
            let breathing = false;
            let breathFrame = null;
            let breathStart = null;
            let breathObjectId = null;
            let hoverTooltip = null;

            function animateBreath() {
                if (!breathing || breathObjectId === null) return;
                const t = ((performance.now() - breathStart) / 1500) % 2;
                const width = 4 + 7 * Math.abs(Math.sin(Math.PI * t));
                map.setPaintProperty('auckland-railways-hover', 'line-width', width);
                breathFrame = requestAnimationFrame(animateBreath);
            }

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
                if (routeNum === 'WEST') { color = '#009A44'; fullName = 'East-West Line'; }
                else if (routeNum === 'SOUTH' || routeNum === 'STH') { color = '#E4002B'; fullName = 'South-City Line'; }
                else if (routeNum === 'ONE') { color = '#4FC3F7'; fullName = 'Onehunga-West Line'; }
                else if (routeNum === 'HUIA') { color = '#6C3483'; fullName = 'Te Huia'; }
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
                breathObjectId = null;
                if (breathFrame) cancelAnimationFrame(breathFrame);
                map.setPaintProperty('auckland-railways-hover', 'line-width', 0);
                if (hoverTooltip) {
                    hoverTooltip.remove();
                    hoverTooltip = null;
                }
            });

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
