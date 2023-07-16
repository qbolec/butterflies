import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const interpolate = (p, a, b) => p*(b-a)+a;


var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6;
var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
document.body.appendChild( VRButton.createButton( renderer ) );
renderer.xr.enabled = true;


const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.008, 0.01, 15),
  new THREE.MeshBasicMaterial({ color: 'pink' })
);
reticle.position.z = -0.5;
camera.add(reticle);
scene.add(camera);

// skyBox
const skyGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
const skyMaterials = ['ft','bk','up','dn','rt','lf'].map(side => new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load( `img/nightsky_${side}.png` ),
    side: THREE.DoubleSide
}));
const skyBox = new THREE.Mesh(skyGeometry, skyMaterials);
// skyBox.position.y=250;
skyBox.position.y=0;
scene.add(skyBox);

class Butterfly{
    static {
        const vertices = new Float32Array( [
            0, 0, 0,
            240, 105, 0,
            110, 230, 0,

            0, 0, 0,
            125, -340, 0,
            200, -100, 0,
        ].map(v => v/3000));
        Butterfly.geometry = new THREE.BufferGeometry();
        Butterfly.geometry.setAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
        Butterfly.material = new THREE.MeshPhongMaterial({
            color: 0xFFFFFF,
            flatShading: true,
            side: THREE.DoubleSide,
        });
    }
    constructor(){
        this.root = new THREE.Group();
        this.wings = Array.from({length:2},()=>{
            const wing = new THREE.Mesh(Butterfly.geometry, Butterfly.material);
            this.root.add(wing);
            return wing;
        });
        this.root.rotation.order = 'YXZ';
        this.setOpenRatio(0);
    }
    setOpenRatio(r){
        const a=r*Math.PI/2;
        this.wings[0].rotation.y = Math.PI/2+a;
        this.wings[1].rotation.y = Math.PI/2-a;
    }
}
class Petal{
    static {
        /*
             0
            / \
            1-2
            |\|
            3-4
            \ /
             5
        */
        Petal.vertexNodeIndices=[
            0, 1, 2,
            1, 3, 2,
            2, 3, 4,
            4, 3, 5,
        ];
        const skinIndices = Petal.vertexNodeIndices.map( x => x+1 >> 1).flatMap(i => [i,0,0,0]);
        const skinWeights = Petal.vertexNodeIndices.flatMap(_ => [1,0,0,0]);
        Petal.skinIndex = new THREE.Uint16BufferAttribute( skinIndices, 4 ) ;
        Petal.skinWeight = new THREE.Float32BufferAttribute( skinWeights, 4 );

    }
    constructor({tip,rectangle,material,geometry}){
        if(!geometry){
            /* Single petal looks like this
             .            ---->x                   .
            / \           |                        | config.tip.height
            *-*           v y             *-- config.tip.width --*
            |\|                           | config.rectangle.height
            *-*
            \ /
             *
            */
            const petalNodesXY = [
                                                        /* 0 */[0,0],
                /*1*/[-tip.width/2, tip.height],                   /*2*/[+tip.width/2, tip.height],
                /*3*/[-tip.width/2, tip.height+rectangle.height],  /*4*/[+tip.width/2, tip.height+rectangle.height],
                                                   /*5*/[0,2*tip.height+rectangle.height],
            ];
            geometry = new THREE.BufferGeometry();
            const vertices = new Float32Array( Petal.vertexNodeIndices.flatMap( i=> [...petalNodesXY[i], 0]));
            // this.vertices = vertices;//debug
            geometry.setAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
            geometry.setAttribute( 'skinIndex', Petal.skinIndex);
            geometry.setAttribute( 'skinWeight', Petal.skinWeight);
        }
        this.geometry = geometry;
        this.material = material;
        this.mesh = new THREE.SkinnedMesh( this.geometry, this.material );
        this.bones = [];
        let prevBone = new THREE.Bone();
        this.bones.push( prevBone );
        [tip.height, rectangle.height, tip.height].forEach( distance => {
            const bone = new THREE.Bone();
            bone.position.y = distance;
            this.bones.push( bone );
            prevBone.add( bone );
            prevBone = bone;
        });
        this.mesh.add( this.bones[0] );
        this.skeleton = new THREE.Skeleton( this.bones );
        this.mesh.bind( this.skeleton );
        this.root = this.mesh;
    }
    setAngles({near,mid,far}){
        this.bones[0].rotation.x = near;
        this.bones[1].rotation.x = mid;
        this.bones[2].rotation.x = far;
    }
}
class Stem{
    constructor(config){
        this.material = new THREE.MeshPhongMaterial({
            color: config.color,
            flatShading: false,
        });
        this.geometry = new THREE.CylinderGeometry(config.radius, config.radius, config.height, 3, 1, false);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.root = this.mesh;
    }
}
class Plant{
    constructor(config){
        config.petals.width = Math.sin(2*Math.PI/config.petals.count/2)*config.flower.radius*2;
        /* There is some number of petals. Each of them looks like this:
         .            ---->x
        / \           |
        *-*           v y
        |\|
        *-*
        \ /
         *
        The 3 bones are located on vertical symmetry axis.
        We want the flower to be able to fold petals into a closed shape,
        so the angle in the triangle (tip.angle) must allow for that (tip.angle < 2PI/config.petals.count).
        To be more specific we want the folded petal to look like this looking from a side:
           .
          /
         *   <-- distance of this bone (at symmetry axis of petal) from symmetry axis of whole Plant is r
         |
         *
          \
           *
        Where the angle between vertical axis and bent petal part has absolut value config.petals.foldAngle.
        This implies some very particular tip.angle.
        The width of the rectangular part (config.petals.width), together with tip.angle determines height of the triangle part (tip.height).
            tan(tip.angle/2)*tip.height = config.petals.width/2
            tan(2PI/config.petals.count/2)*r = config.petals.width/2
            sin(config.petals.foldAngle) = r/tip.height
        So:
            tip.height = (config.petals.width/2)/tan(2PI/config.petals.count/2)/sin(config.petals.foldAngle)
        The only missing part then is the height of rectangular part (rect.height), which can be deduced from config.flower.height - 2*tip.height*cos(config.petals.foldAngle).
        */
        const tip = {
            height: (config.petals.width/2)/Math.tan(2*Math.PI/config.petals.count/2)/Math.sin(config.petals.foldAngle),
            width: config.petals.width,
        };
        // tip.angle = 2*Math.atan2(config.petals.width/2, tip.height);
        const rectangle = {
            width: config.petals.width,
            height: config.flower.height - 2 * tip.height * Math.cos(config.petals.foldAngle),
        };
        const petalsMaterial = new THREE.MeshPhongMaterial( {
            side: THREE.DoubleSide,
            color: config.petals.color,
            flatShading: true,
        });

        this.group = new THREE.Group();
        let geometry;
        this.petals = Array.from({length:config.petals.count},(_,i)=>{
            const petal=new Petal({ tip, rectangle, material:petalsMaterial, geometry});
            petal.root.rotation.z=(i/config.petals.count)*2*Math.PI;
            petal.root.rotation.x=-Math.PI/2;
            petal.root.position.y=config.stem.height;
            geometry=petal.geometry;
            this.group.add(petal.root);
            return petal;
        });
        this.stem = new Stem(config.stem);
        this.stem.root.position.y = +config.stem.height/2;
        this.group.add(this.stem.root);
        this.foldAngle = config.petals.foldAngle;
        this.openAngle = config.petals.openAngle;
        this.root = this.group;
    }
    setOpenRatio(r){
        this.petals.forEach(petal=>{
            petal.setAngles({
                near:interpolate(r, Math.PI/2-this.foldAngle, Math.PI/2-this.openAngle),
                mid:interpolate(r, this.foldAngle, 0),
                far:interpolate(r, this.foldAngle, 0),
            });
        });
    }

}

var floorGeometry = new THREE.PlaneGeometry(100, 100);
var floorMaterial = new THREE.MeshPhongMaterial({ color: 0x44cc88 });
var floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2; // Rotate the floor to lay flat
scene.add(floor);

// Step 4: Create the cube
const PLANTS_SQRT=10;
const plants = Array.from({length:PLANTS_SQRT*PLANTS_SQRT},(_,i)=>{
    const plant = new Plant({
        petals: {
            count: 3+Math.random()*6|0,
            foldAngle: Math.PI/4,
            openAngle: Math.PI/2*1.1,
            color: new THREE.Color().setHSL(Math.random(), 0.5,0.5),
        },
        flower: {
            radius:.05+Math.random()*0.1,
            height:.3,
        },
        stem: {
            radius:0.01,
            height:0.2+Math.random()*0.5,
            color: new THREE.Color().setHSL(i%3*1/3,1,0.5),
        },
    });
    plant.root.position.y = 0;
    plant.root.position.x = -PLANTS_SQRT/2+i%PLANTS_SQRT*1;
    plant.root.position.z = -PLANTS_SQRT/2+(i/PLANTS_SQRT|0);
    return plant;
});
plants.forEach(plant => scene.add(plant.root));

const BUTTERFLIES = 50;
const butterflies = Array.from({length:BUTTERFLIES},(_,i)=>{
    const butterfly = new Butterfly();
    butterfly.root.position.y = 1+Math.random();
    butterfly.root.position.x = -PLANTS_SQRT/2+Math.random()*PLANTS_SQRT;
    butterfly.root.position.z = -PLANTS_SQRT/2+Math.random()*PLANTS_SQRT;
    return butterfly;
});
butterflies.forEach(butterfly => scene.add(butterfly.root));


// Step 5: Create the light
var light = new THREE.DirectionalLight(0x8888ff);
light.position.set(1000, 1000, 1000);
scene.add(light);

// const sunlight = new THREE.HemisphereLight( 0xffffbb, 0x080820, 1 );
// scene.add( sunlight );
const ambient_light = new THREE.AmbientLight( 0x404040 ); // soft white light
scene.add( ambient_light );

// Variables to track mouse movement
var mouseX = 0;
var mouseY = 0;

// Event listener for mouse movement
document.addEventListener('mousemove', function(event) {
    mouseX = -Math.PI*((event.clientX / window.innerWidth) * 2 - 1);
    mouseY = -Math.PI*((event.clientY / window.innerHeight) * 2 - 1);
    var combinedRotation = new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().makeRotationY(mouseX),
        new THREE.Matrix4().makeRotationX(mouseY)
    );
    camera.rotation.setFromRotationMatrix(combinedRotation);

});

// Update the camera's aspect ratio on window resize
window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const framesAt=[];
let lastUpdateAt=Date.now();
function updateState(){
    const now=Date.now();
    const dt = now - lastUpdateAt;
    plants.forEach(plant => plant.setOpenRatio((1+Math.sin(now/1000))/2));
    butterflies.forEach((butterfly,i) => {
        butterfly.setOpenRatio((1+Math.sin(4*2*Math.PI*now/1000))/2);
        //butterfly.setOpenRatio(1);
        butterfly.root.position.y += Math.sin((now*(1+i/10)/2+i)/100)/100;
        butterfly.root.rotation.y = now*(1+i/10)/1000;
        butterfly.root.rotation.x = Math.PI/4;

        butterfly.root.position.z += Math.cos(butterfly.root.rotation.y)*dt/500;
        butterfly.root.position.x += Math.sin(butterfly.root.rotation.y)*dt/500;
    });
    lastUpdateAt=now;
}
window.setInterval(updateState,10);

renderer.setAnimationLoop( function () {
    updateState();
    framesAt.push(Date.now());
    if(10<framesAt.length)framesAt.shift()
    const fps=(framesAt.length-1)*1000/(framesAt.at(-1)-framesAt[0]);
    document.getElementById('fps').innerText=Math.round(fps);
    renderer.render(scene, camera);
});
