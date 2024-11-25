// Polygon in EPSG:4032
const bound_path = 'tile/bounds.geojson';

// Extent of the tile in EPSG:3035
const polygon_west = 4526026.3630;
const polygon_east = 4556026.3630;
const polygon_north = 3284919.6080;
const polygon_south = 3254919.6080;
const polygon_gridSize = 1000;



function calculateCentroid(polygon) {
    const coordinates = polygon[0]; // Extract the first ring of the polygon
    let signedArea = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < coordinates.length - 1; i++) {
        const x0 = coordinates[i][1]; // Longitude
        const y0 = coordinates[i][0]; // Latitude
        const x1 = coordinates[i + 1][1]; // Next longitude
        const y1 = coordinates[i + 1][0]; // Next latitude

        const a = x0 * y1 - x1 * y0;
        signedArea += a;
        cx += (x0 + x1) * a;
        cy += (y0 + y1) * a;
    }

    signedArea *= 0.5;
    cx = cx / (6 * signedArea);
    cy = cy / (6 * signedArea);

    return [cy, cx]; // Return as [latitude, longitude]
}

var working_tile = null;

$.ajax({
    url: bound_path, // Path to your GeoJSON file
    dataType: "json",
    async: false,
    global: false,
    success: function(data) {
        // Store the polygon data for later use
        working_tile = data;

        // You can process the polygon here if needed
        console.log("Tile data loaded");
    },
    error: function(xhr) {
        console.error(`Failed to load GeoJSON: ${xhr.status} ${xhr.statusText}`);
    }
});

var tile_coords = working_tile.features[0].geometry.coordinates[0];

var tile_polygon = [[]];

for (let i = 0; i < tile_coords.length; i++) {
    tile_polygon[0].push([tile_coords[i][1], tile_coords[i][0]])
    
}

const center_tile_coords = calculateCentroid(tile_polygon);



var data_stack_LS = [];
var data_stack_S2 = [];
var doy_list_ls = 0;
var doy_list_s2 = 0;


async function fetchJson(url) {
    return $.ajax({
        url: url,
        dataType: "json"
    });
}

async function getImage(sensor, doy) {
    const url = `json_data/${sensor}_${doy}.json`;
    return fetchJson(url);
}

function display_progress(count, full_process){
    var progress = (count / full_process) * 100;
    progress = progress.toFixed(2);
    document.getElementById("loading_text").innerHTML = `${progress} % </div>`;
}

async function loadData() {
    try {
        var count = 0;
        doy_list_ls = await fetchJson('json_data/LS_doylist.json');
        doy_list_s2 = await fetchJson('json_data/S2_doylist.json');
        const full_process = doy_list_ls.length + doy_list_s2.length;

        // Load LS data using a for loop
        for (let i = 0; i < doy_list_ls.length; i++) {
            const doy = doy_list_ls[i];
            data_stack_LS.push(await getImage('LS', doy));
            count += 1
            display_progress(count, full_process);
        }

        // Load S2 data using a for loop
        for (let i = 0; i < doy_list_s2.length; i++) {
            const doy = doy_list_s2[i];
            data_stack_S2.push(await getImage('S2', doy));
            count += 1
            display_progress(count, full_process);
        }

    } catch (error) {
        console.error("Error loading data:", error);
    } finally {
        console.log("Finished loading data");
    }
}

const start = async function() {
    const loadingscreen = document.getElementById("loading");
    await loadData();
    loadingscreen.remove();
}

start();

var map = L.map('map').setView(center_tile_coords, 11);

var Esri_WorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });
Esri_WorldImagery.addTo(map);




// Add the polygon to the map
const polygon = L.polygon(tile_polygon, {
    color: 'red',   // Outline color
    fillColor: 'yellow', // Fill color
    fillOpacity: 0.0 // Transparency
}).addTo(map);

// Store the circle marker
let circleMarker = null;

orig_project = proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
target_project = proj4.defs("EPSG:3035", "+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +units=m +no_defs");


function calculateRowCol(x, y, west, east, north, south, gridSize) {
    // Calculate cell dimensions
    const cellWidth = (east - west) / gridSize;
    const cellHeight = (north - south) / gridSize;

    // Check if the point is within bounds
    if (x < west || x > east || y < south || y > north) {
        return { row: null, col: null }; // Point is outside the extent
    }

    // Calculate column and row
    const col = Math.floor((x - west) / cellWidth);
    const row = Math.floor((north - y) / cellHeight);

    return { row, col };
}



var global_col = null;
var global_row = null;
var tooltip_content = null;


// Add a click event listener for the polygon
polygon.on('click', function (e) {
    // Get the latitude and longitude of the click
    const latlng = e.latlng;

    // Remove the existing circle marker, if any
    if (circleMarker) {
        map.removeLayer(circleMarker);
    }

    // Add a new circle marker at the clicked location
    circleMarker = L.circleMarker(latlng, {
        radius: 10, // Circle size
        color: 'blue', // Outline color
        fillColor: 'cyan', // Fill color
        fillOpacity: 0.5 // Transparency
    }).addTo(map);

    // Log the latitude and longitude to the console
    // console.log(`Latitude: ${latlng.lat}, Longitude: ${latlng.lng}`);

    var inputCoordinates = [latlng.lng, latlng.lat]
    var outputCoordinates = proj4("EPSG:4326", "EPSG:3035", inputCoordinates);

    const { row, col } = calculateRowCol(outputCoordinates[0], outputCoordinates[1], polygon_west, polygon_east, polygon_north, polygon_south, polygon_gridSize);

    global_row = row;
    global_col = col;

    if (tooltip_content === null){
        tooltip_content = 
        `
        Showing data for:
        <div id="sensorGroup" onclick="createChart()">
            <label><input type="radio" name="option" value="Both" checked="checked">Both</label>
            <label><input type="radio" name="option" value="LS">Only Landsat</label>
            <label><input type="radio" name="option" value="S2">Only Sentinel-2</label>
        </div>`;
        document.getElementById("buttonLocation").innerHTML = tooltip_content;
    }

    createChart();

});


let currentChart = null;

function get_data_plot(sensor){
    var y_list = [];
    var x_list = [];
    if (sensor == 'LS') {
        var data_stack = data_stack_LS;
        var doy_list = doy_list_ls;
    } else if (sensor == 'S2'){
        var data_stack = data_stack_S2;
        var doy_list = doy_list_s2;
    }
    for (let index = 0; index < data_stack.length; index++) {
        var spectral = data_stack[index][global_row][global_col];
        if (spectral == -9999) continue;
        else {
            x_list.push(doy_list[index]);
            y_list.push(spectral);
        }
    }
    const chart_data = x_list.map((x, index) => {
        return { x: x, y: y_list[index] };
    });

    var min_y = Math.min(...y_list);
    return [chart_data, min_y]
}

function createChart() {

    if (currentChart) {
        currentChart.destroy();
    }

    const sensorGroup = document.getElementById('sensorGroup');
    const selectedsensor = sensorGroup.querySelector('input[type="radio"]:checked');

    if (selectedsensor.value == 'LS') {
        var hidden_LS = false;
        var hidden_S2 = true;
    } else if (selectedsensor.value == 'S2'){
        var hidden_LS = true;
        var hidden_S2 = false;
    } else {
        var hidden_LS = false;
        var hidden_S2 = false;
    }

    // x_list, y_list will be used for future development
    var [dataset_LS, min_y_LS] = get_data_plot('LS');
    var [dataset_S2, min_y_S2] = get_data_plot('S2');

    // console.log(x_list_s2);
    // console.log(y_list_s2);

    var min_y = 0;

    if (min_y_LS <= min_y_S2){
        if (min_y_LS > 0){
            min_y = 0;
        } else {
            min_y = min_y_LS;
        }
    } else {
        if (min_y_S2 > 0){
            min_y = 0;
        } else {
            min_y = min_y_S2;
        }
    }


    var data_plot = [
        {
            label: 'Landsat',  // Label for the dataset
            data: dataset_LS,  // Data array that contains {x, y} pairs
            backgroundColor: 'rgba(200, 200, 0, 1)',  // Point color
            borderColor: 'rgba(200, 200, 0, 1)',  // Border color
            borderWidth: 1,
            pointRadius: 5,
            hidden: hidden_LS
        },

        {
            label: 'Sentinel-2',  // Label for the dataset
            data: dataset_S2,  // Data array that contains {x, y} pairs
            backgroundColor: 'rgba(200, 0, 200, 1)',  // Point color
            borderColor: 'rgba(200, 0, 200, 1)',  // Border color
            borderWidth: 1,
            pointRadius: 5,
            hidden: hidden_S2
        },

];

    const ctx = document.getElementById('myScatterPlot').getContext('2d');
    currentChart = new Chart(ctx, {
        type: 'scatter',  // Define the chart type
        data: {
            datasets: data_plot
        },
            options: {
                animation: {
                    duration: 1000 
            },

            scales: {
                x: {
                    min: 1,
                    max: 365,
                    title: {
                        display: true,
                        text: 'Day of years'
                    }
                },
                y: {
                    min: min_y,
                    max: 10000,
                    title: {
                        display: true,
                        text: 'NDVI × 10,000'
                    }
                }

            },
            plugins: {
                tooltip: {
                    callbacks: {
                        // Customizing the tooltip label
                        title: function(tooltipItem) {
                            return 'DOY: ' + tooltipItem[0].raw.x;  // Display DOY as the title
                        },
                        label: function(tooltipItem) {
                            return 'NDVI: ' + tooltipItem.raw.y;  // Display Spectral Value as the label
                        }
                    }
                },
            }
        }
    });
}


    






