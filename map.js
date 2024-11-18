

function get_image(sensor, doy){
    var json_data = (function () {
        var json = null;
        $.ajax({
            'async': false,
            'global': false,
            'url': `json_data/${sensor}_${doy}.json`,
            'dataType': "json",
            'success': function (data) {
                json = data;
            }
        });
        return json;
    })();
    return json_data
}

var doy_list_ls = (function () {
    var json = null;
    $.ajax({
        'async': false,
        'global': false,
        'url': 'json_data/LS_doylist.json',
        'dataType': "json",
        'success': function (data) {
            json = data;
        }
    });
    return json;
})();

var doy_list_s2 = (function () {
    var json = null;
    $.ajax({
        'async': false,
        'global': false,
        'url': 'json_data/S2_doylist.json',
        'dataType': "json",
        'success': function (data) {
            json = data;
        }
    });
    return json;
})();

var data_stack_LS = [];
var data_stack_S2 = [];

for (let index = 0; index < doy_list_ls.length; index++) {
    data_stack_LS.push(get_image('LS', doy_list_ls[index]))
    
}

for (let index = 0; index < doy_list_s2.length; index++) {
    data_stack_S2.push(get_image('S2', doy_list_s2[index]))
    
}



var map = L.map('map').setView([52.48044, 13.23972], 11);

var Stadia_AlidadeSatellite = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.{ext}', {
    minZoom: 0,
    maxZoom: 20,
    attribution: '&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | &copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    ext: 'jpg'
});

Stadia_AlidadeSatellite.addTo(map);

const polygon_coordinates = [
    [
        [52.63492288657163, 13.02928873674335],
        [52.622877467237075, 13.471956009371267],
        [52.353626903441857, 13.450849545301722],
        [52.365588470916983, 13.010864900757348],
        [52.634922886571637, 13.02928873674335]
    ]
];

// Add the polygon to the map
const polygon = L.polygon(polygon_coordinates, {
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

// Example usage
const polygon_west = 4526026.3630;
const polygon_east = 4556026.3630;
const polygon_north = 3284919.6080;
const polygon_south = 3254919.6080;
const polygon_gridSize = 1000;
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
        Show time-series data for:
        <div id="sensorGroup" onclick="createChart()">
            <label><input type="radio" name="option" value="LS" checked="checked">Landsat</label>
            <label><input type="radio" name="option" value="S2">Sentinel-2</label>
            <label><input type="radio" name="option" value="Both">Both</label>
        </div>`;
        document.getElementById("buttonLocation").innerHTML = tooltip_content;
    }

    createChart()

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

    var [dataset_LS, min_y_LS] = get_data_plot('LS');
    var [dataset_S2, min_y_S2] = get_data_plot('S2');

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

    






