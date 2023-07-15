const interpolate = (p, a, b) => p*(b-a)+a;



var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6;
var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Step 2: Create the skybox
var skyGeometry = new THREE.BoxGeometry(1000, 500, 1000);
let blue = new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.BackSide  });
let green = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.BackSide  });
var skyMaterials = [
    blue,
    blue,
    blue,
    green,
    blue,
    blue,
];
var skyBox = new THREE.Mesh(skyGeometry, skyMaterials);
skyBox.position.y=250;
scene.add(skyBox);
class Petal{
    constructor({tip,rectangle,material}){
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
        this.geometry = new THREE.BufferGeometry();
        const vertexNodeIndices=[
            0, 1, 2,
            1, 3, 2,
            2, 3, 4,
            4, 3, 5,
        ]
        const vertices = new Float32Array( vertexNodeIndices.flatMap( i=> [...petalNodesXY[i], 0]));
        this.vertices = vertices;//debug
        this.geometry.setAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
        const skinIndices = vertexNodeIndices.map( x => x+1 >> 1).flatMap(i => [i,0,0,0]);
        const skinWeights = vertexNodeIndices.flatMap(_ => [1,0,0,0]);
        this.geometry.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( skinIndices, 4 ) );
        this.geometry.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute( skinWeights, 4 ) );
        this.material = material
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
            flatShading: true
        });

        this.group = new THREE.Group();
        this.petals = Array.from({length:config.petals.count},(_,i)=>{
            const petal=new Petal({ tip, rectangle, material:petalsMaterial});
            // petal.bones[0].rotation.z=(i/config.petals.count)*2*Math.PI;
            petal.root.rotation.z=(i/config.petals.count)*2*Math.PI;
            petal.root.rotation.x=-Math.PI/2;
            this.group.add(petal.root);
            return petal;
        });
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

// // Step 3: Create the floor
//  var floorGeometry = new THREE.PlaneGeometry(100, 100);
//  var floorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//  var floor = new THREE.Mesh(floorGeometry, floorMaterial);
//  floor.rotation.x = -Math.PI / 2; // Rotate the floor to lay flat
//    scene.add(floor);

// Step 4: Create the cube

const plants = Array.from({length:100},(_,i)=>{
    const plant = new Plant({
        petals: {
            count: 3+Math.random()*6|0,
            foldAngle: Math.PI/4,
            openAngle: Math.PI/2*1.1,
            color: new THREE.Color().setHSL(Math.random()*360, 0.5,0.5),
        },
        flower: {
            radius:.1+Math.random()*0.2,
            height:.5,
        },
    });
    plant.root.position.y = 0.2;
    plant.root.position.x = -5+i%10*1;
    plant.root.position.z = -3-(i/10|0);
    return plant;
});
plants.forEach(plant => scene.add(plant.root));


// Step 5: Create the light
var light = new THREE.DirectionalLight(0xffffff); // White light
light.position.set(1000, 1000, 1000); // Sun position
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
    mouseY = -Math.PI/10*((event.clientY / window.innerHeight) * 2 - 1);
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

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    // plant.root.rotation.y +=0.01;
    // plant.root.rotation.x +=0.01;
    //plants.forEach(plant => plant.setOpenRatio(0));
    //plants.forEach(plant => plant.setOpenRatio(1));
    //plants.forEach(plant => plant.setOpenRatio(Math.abs(Date.now()%2000/1000-1)));
    plants.forEach(plant => plant.setOpenRatio((1+Math.sin(Date.now()/1000))/2));
    //camera.updateProjectionMatrix();
    renderer.render(scene, camera);
}

// Start the animation loop
animate();
