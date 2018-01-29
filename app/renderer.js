// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var THREE = require('three');
var STLLoader = require('three-stl-loader')(THREE)
var OrbitControls = require('three-orbit-controls')(THREE)

var MeshLine = require( 'three.meshline' );
var TrackballControls = require('three-trackballcontrols')


//var CSG = require('threeCSG.es6')

//var ColladaLoader = require('three-collada-loader');
window.THREE = THREE;
var ColladaLoader = require('three/examples/js/loaders/ColladaLoader.js');
//var <script src="../node_modules/three/examples/js/loaders/ColladaLoader.js"></script>

var app = require('electron').remote;
var dialog = app.dialog;



var scene, camera, renderer;
var geometry, material, mesh, boxMesh;

var stlMesh = null;
var stlGeom = null;
var polyhedronMesh = null;
var polyGeom = null;

// var slicerPlane = null;
var slicerEdges = null;
var controls;

var showPlasticBox = false;
var showPoly = true;
var stlWireframe = false;

//var spinScene = false;

var renderer = null;

init();


var slider = document.getElementById("slice-slider");
slider.addEventListener("input", function(e) {

    let val = .1*slider.value;
    // slicerPlane.position.z = val ;
    slicerEdges.position.z = val;

    exports.sliceMesh(val);
    render();
});

document.getElementById('stl-open').addEventListener('click', _ => {
    dialog.showOpenDialog((fileNames) => {
        // fileNames is an array that contains all the selected
        if(fileNames === undefined){
            alert("No file selected");
            return;
        }

        var loader = new STLLoader();

        loader.load(fileNames[0], function (geometry) {

            let vertCt = geometry.attributes.position.array.length;
            let triCt = geometry.attributes.position.count;
            // fill out some Stats
            document.getElementById("stl-stats").style.visibility = "visible";
            document.getElementById("stl-tri-ct").textContent=(vertCt/3).toLocaleString('en', {useGrouping:true});
            document.getElementById("stl-pos-ct").textContent=vertCt.toLocaleString('en', {useGrouping:true});

            scene.remove(stlMesh);

            stlGeom = geometry;

            var material = new THREE.MeshPhongMaterial( { color: 0xff5533, specular: 0x111111, shininess: 200, side: THREE.DoubleSide } );
            stlMesh = new THREE.Mesh( geometry, material );

            var bbox = new THREE.Box3();
            bbox.setFromObject(stlMesh);
            var dist = bbox.max.sub(bbox.min);
            var maxDim = Math.max(dist.x, dist.y, dist.z);
            var desiredSize = .1;
            var scale = desiredSize / maxDim;

            stlMesh.position.set( 0, 0, 0 );
            //stlMesh.rotation.set( 0, - Math.PI / 2, 0 );
            //stlMesh.scale.set( scale, scale, scale );
            stlGeom.attributes.position.array.forEach(function(g,i) { stlGeom.attributes.position.array[i] = g*scale;})

            stlMesh.castShadow = true;
            stlMesh.receiveShadow = true;

            scene.add( stlMesh );
            render();
        })

    });
})

/////////////////////////////////////////
// Render Loop
/////////////////////////////////////////

function render() {
	renderer.render( scene, camera );
}

exports.THREE = THREE;

exports.togglePlasticBox = function togglePlasticBox() {
	showPlasticBox = !showPlasticBox;
	plasticBox.visible = showPlasticBox;
	render();
}

exports.toggleStl = function toggleStl() {
	showStl = !showStl;
	stlMesh.visible = showStl;
	render();
}

exports.toggleStlWireframe = function toggleStlWireframe() {
	stlWireframe = !stlWireframe;
	stlMesh.material.wireframe = stlWireframe;
	render();
}

exports.toggleShowPoly = function toggleShowPoly() {
	showPoly = !showPoly;
	polyhedronMesh.visible = showPoly;
	render();
}

exports.sliceMesh = function sliceMesh (zpos) {

    // first, turn on the slider
    slider.style.visibility = 'visible';

    var mesh = stlMesh ? stlMesh : polyhedronMesh;
    var geom = stlGeom ? stlGeom : polyGeom;
    var pos = geom.getAttribute('position');
    var vertCt = pos.count;
    var triCt = vertCt / 3;

    if (!slicerEdges) {
        var geometry = new THREE.PlaneGeometry( .2, .2, 2 );
        // var material = new THREE.MeshBasicMaterial( {color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity:.2} );
        // slicerPlane = new THREE.Mesh( geometry, material );
        var edges = new THREE.EdgesGeometry( geometry );
        slicerEdges = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0xffff00 } ) );
        scene.add( slicerEdges );

        // how to control position
        //slicerPlane.rotation.z += Math.PI/4;
        //slicerPlane.position.z += zpos;
        //scene.add( slicerPlane );
        render();
    }

    // go thru triangles
    // if a vertex has z above plane and another below, reorder to front
    var isectTriCt = 0;
    for (var itri = 0; itri < pos.count; itri += 3) {
        var v1z = pos.getZ(itri),
            v2z = pos.getZ(itri + 1),
            v3z = pos.getZ(itri + 2);

        if ( !((v1z > zpos && v2z > zpos && v3z > zpos) ||
               (v1z < zpos && v2z < zpos && v3z < zpos)) ) {

            console.log('swapping tri ' + isectTriCt + ' at idx ' + isectTriCt * 3 + 'with tri ' + itri + ' at idx ' + itri*3);
            swapTriangles(pos, isectTriCt*3*3, itri*3);
            isectTriCt ++;
        }
    }

    // now we know the first isectTriCt*3 triangles are the ones intersecting this z
    // make edges for each of those
    // var arrayPtPairs = findPointsIntersectingPlane(zpos, isectTriCt*3, pos);
    // var edgeMesh = makeEdgeCurve(arrayPtPairs);
    //scene.add(edgeMesh);

    geom.attributes.position.needsUpdate = true;
    geom.setDrawRange(0, isectTriCt*3);
    render();

}

function makeEdgeCurve(array) {
    var geometry = new THREE.BufferGeometry();
    // create a simple square shape. We duplicate the top left and bottom right
    // vertices because each vertex needs to appear once per triangle.
    var vertices = new Float32Array( array );

    // itemSize = 3 because there are 3 values (components) per vertex
    //geometry.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
     var material = new THREE.MeshBasicMaterial( { color: 0xff0000 } );
     var mesh = new THREE.Mesh( geometry, material );

    //var edges = new THREE.EdgesGeometry( geometry );
    //var slicedEdges = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0xffff00 } ) );
    scene.add( mesh );
    return mesh;
}

function findPointsIntersectingPlane(zpos, posCt, posArray) {
    let ret = []; // point3s, so each idx 0,1,2 is a vertex (edge end)

    let array = posArray.array;
    // each 9 elements of posArray is 3 verts, which is 1 triangle
    for (let ipos = 0; ipos < posCt; ipos+=9) {
        let v1 = [array[ipos], array[ipos+1], array[ipos+2]];
        let v2 = [array[ipos+3], array[ipos+4], array[ipos+5]];
        let v3 = [array[ipos+6], array[ipos+7], array[ipos+8]];

        // we expect the z of one v to be on the other side of zpos from the other 2
        let a1 = v1[2] - zpos;
        let a2 = v2[2] - zpos;
        let a3 = v3[2] - zpos;

        if ((a1>0 && a2>0 && a3>0) || (a1<0 && a2<0 && a3<0)) {
            console.log("ACK");
            continue;
        }

        var loner = v1;
        var sameSide0 = v2;
        var sameSide1 = v3;
        if (a1 * a2 > 0) {
            loner = v3;
            sameSide0 = v1;
            sameSide1 = v2;
        } else if (a1 * a3 > 0) {
            loner = v2;
            sameSide0 = v1;
            sameSide1 = v3;
        }

        var pv0 = [sameSide0[0] - loner[0], sameSide0[1] - loner[1], sameSide0[2] - loner[2]];
        var pv1 = [sameSide1[0] - loner[0], sameSide1[1] - loner[1], sameSide1[2] - loner[2]];

        let eps = .0001;
        if (sameSide0[2] - loner[2] < eps || sameSide1[2] - loner[2] < eps) {
            continue;
        }
        var z0 = (zpos - loner[2])/(sameSide0[2] - loner[2]);
        var z1 = (zpos - loner[2])/(sameSide1[2] - loner[2]);

        pv0 = [z0*pv0[0] + loner[0], z0*pv0[1]+ loner[1], z0*pv0[2]+ loner[2]];
        pv1 = [z1*pv1[0] + loner[0], z1*pv1[1]+ loner[1], z1*pv1[2] + loner[2]];

        ret = ret.concat(pv0.concat(pv1));
    }

    return ret;
}

function swapTriangles(pts, idx0, idx1) {

    var pos = pts.array;
    var tmp0 = pos.slice(idx0, idx0+9);
    var tmp1 = pos.slice(idx1, idx1+9);
    pos.set(tmp1, idx0);
    // pos.copyWithin(idx0, idx1, 3); // not working?
    pos.set(tmp0, idx1);
}


// Avoid constantly rendering the scene by only
// updating the controls every requestAnimationFrame
// loop needed for orbit/trackball controls
function animationLoop() {
	requestAnimationFrame(animationLoop);
	controls.update();
}


function initPoly() {

    var mesh = new THREE.Object3D();
    var geom = new THREE.DodecahedronBufferGeometry(.1, 0);
    polyGeom = geom;

	mesh.add( new THREE.LineSegments(

		geom,
		new THREE.LineBasicMaterial( {
			color: 0xffffff,
			transparent: true,
			opacity: 0.5
		} )
	) );

	mesh.add( new THREE.Mesh(

		geom,
		new THREE.MeshPhongMaterial( {
			color: 0x156289,
			emissive: 0x072534,
			side: THREE.DoubleSide,
			flatShading: true
		} )
	) );

    scene.add( mesh );
    return mesh;
}


var dae,
    loader = new THREE.ColladaLoader();


function loadPlasticBox( collada ) {

    dae = collada.scene;

//  dae.rotation.z += 3.14/2;
    dae.scale.x = .1;
    dae.scale.y = .1;
    dae.scale.z = .25;

    dae.rotation.x += 3.14/2;
    dae.position.set(-4.2, -3.1, -.2);

    // override some materials to make it transparent
    dae.children[0].children[1].material[1].transparent = true;
    dae.children[0].children[1].material[1].opacity = .3;
    dae.children[0].children[1].material[0].opacity = .3

    plasticBox = dae;
    plasticBox.visible = showPlasticBox;
    scene.add(dae);
    render();
}


/////////////////////////////////////////
// Window Resizing
/////////////////////////////////////////

window.addEventListener( 'resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
    controls.handleResize();
    render();
}, false );



function init() {

    document.getElementById("stl-stats").style.visibility = "hidden";

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera( 3, window.innerWidth / window.innerHeight, .1, 200 );
    camera.position.set(-6, -6, 4);
    camera.up.y = 0;
    camera.up.z = 1;
    camera.lookAt( scene.position );

    renderer = new THREE.WebGLRenderer({
     	alpha: true,
        antialias: true
    });
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setClearColor( 0x333344, 1 );

    document.body.appendChild( renderer.domElement );


    /////////////////////////////////////////
    // Trackball Controller
    /////////////////////////////////////////

    controls = new TrackballControls( camera, renderer.domElement );
    controls.rotateSpeed = 5.0;
    controls.zoomSpeed = 3.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = true;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.2;
    controls.minDistance = 0.2;
    controls.maxDistance = 100;


    /////////////////////////////////////////
    // Lighting
    /////////////////////////////////////////

    var lightGrey  = '#FAFAFA',
        ambientLight  = new THREE.AmbientLight( '#EEEEEE' ),
        hemiLight     = new THREE.HemisphereLight( lightGrey, lightGrey, 0 ),
        light         = new THREE.PointLight( lightGrey, 1, 100 );

    hemiLight.position.set( 0, 50, 0 );
    light.position.set( 0, 20, 10 );

    scene.add( ambientLight );
    scene.add( hemiLight );
    scene.add( light );



    var axisHelper = new THREE.AxesHelper( 1 );
    scene.add( axisHelper );

    polyhedronMesh = initPoly();


    // Render the scene when the controls have changed.
    // If you don’t have other animations or changes in your scene,
    // you won’t be draining system resources every frame to render a scene.
    controls.addEventListener( 'change', render );

}

// for orbit controls
animationLoop();

loader.load( '../collada/skp-simple-plastic-box/model.dae', loadPlasticBox);

//render();
