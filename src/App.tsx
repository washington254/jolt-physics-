import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { suspend } from "suspend-react";
import Jolt from "jolt-physics";
import { ReactNode, useContext, createContext, useRef, useEffect } from "react";
import { Group, Object3D } from "three";
import { useConst } from "./use-const";

type PhysicsContextType = {
  jolt: Awaited<ReturnType<typeof Jolt>>;
  settings: Jolt.JoltSettings;
  joltInterface: Jolt.JoltInterface;
  bodyInterface: Jolt.BodyInterface;
  physicsSystem: Jolt.PhysicsSystem;
  bodies: Map<number, { body: Jolt.Body; three: Object3D }>;
};

const physicsContext = createContext<PhysicsContextType>(null!);

const useJolt = () => useContext(physicsContext);

type PhysicsProps = {
  children: ReactNode;
};

const Physics = ({ children }: PhysicsProps) => {
  const { jolt, settings, physicsSystem, joltInterface, bodyInterface } =
    suspend(async () => {
      const jolt = await Jolt();

      const settings = new jolt.JoltSettings();
      const joltInterface = new jolt.JoltInterface(settings);
      const physicsSystem = joltInterface.GetPhysicsSystem();
      const bodyInterface = physicsSystem.GetBodyInterface();

      physicsSystem.SetGravity(new jolt.Vec3(0, -10, 0));

      return { jolt, settings, joltInterface, physicsSystem, bodyInterface };
    }, []);

  const bodies = useConst<PhysicsContextType["bodies"]>(() => new Map());

  useFrame((_, delta) => {
    // Don't go below 30 Hz to prevent spiral of death
    const deltaTime = Math.min(delta, 1.0 / 30.0);

    // When running below 55 Hz, do 2 steps instead of 1
    const numSteps = deltaTime > 1.0 / 55.0 ? 2 : 1;

    // Step the physics world
    joltInterface.Step(deltaTime, numSteps);

    // Update body transforms
    for (const [, { three, body }] of bodies) {
      let p = body.GetPosition();
      let q = body.GetRotation();
      three.position.set(p.GetX(), p.GetY(), p.GetZ());
      three.quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    }
  });

  return (
    <>
      <physicsContext.Provider
        value={{
          jolt,
          settings,
          joltInterface,
          physicsSystem,
          bodyInterface,
          bodies,
        }}
      >
        {children}
      </physicsContext.Provider>
    </>
  );
};

type ShapeType = "box" | "sphere";

type BoxShapeArgs = [number, number, number];
type SphereShapeArgs = [radius: number];

type RigidBodyProps = {
  // todo...
  type: "static" | "kinematic" | "dynamic";
  shape: ShapeType;
  args: BoxShapeArgs | SphereShapeArgs;
  children: React.ReactNode;
  position: [number, number, number];
};

const RigidBody = ({
  children,
  shape: shapeType,
  type,
  args,
  position,
}: RigidBodyProps) => {
  const { jolt, bodies, bodyInterface } = useJolt();
  const ref = useRef<Group>(null!);

  useEffect(() => {
    let shape;
    if (shapeType === "box") {
      let sx = args[0];
      let sy = args[1]!;
      let sz = args[2]!;
      shape = new jolt.BoxShape(
        new jolt.Vec3(sx * 0.5, sy * 0.5, sz * 0.5),
        0.05,
        null!
      );
    } else if (shapeType === "sphere") {
      let radius = args[0];
      shape = new jolt.SphereShape(radius, null!);
    } else {
      throw new Error("unsupported shape type " + shapeType);
    }

    let motionType: Jolt.EMotionType;
    let objectLayer: number;
    if (type === "static") {
      motionType = jolt.Static;
      objectLayer = jolt.NON_MOVING;
    } else if (type === "kinematic") {
      motionType = jolt.Kinematic;
      objectLayer = jolt.MOVING;
    } else if (type === "dynamic") {
      motionType = jolt.Dynamic;
      objectLayer = jolt.MOVING;
    } else {
      throw new Error("unsupported type " + type);
    }

    const creationSettings = new jolt.BodyCreationSettings(
      shape,
      new jolt.Vec3(position[0], position[1], position[2]),
      new jolt.Quat(0, 0, 0, 1),
      motionType,
      objectLayer
    );
    creationSettings.mRestitution = 0.5;

    const body = bodyInterface.CreateBody(creationSettings);
    bodyInterface.AddBody(body.GetID(), jolt.Activate);
    
    bodies.set(ref.current.id, {
      three: ref.current,
      body,
    });

    return () => {
      bodies.delete(ref.current.id);
      bodyInterface.DestroyBody(body.GetID());
    };
  }, []);

  return <group ref={ref}>{children}</group>;
};

function App() {
  return (
    <>
      {Array.from({ length: 100 }, (_, idx) => (
        <RigidBody
          key={idx}
          shape="box"
          type="dynamic"
          args={[1, 1, 1]}
          position={[
            Math.random() -0.5,
            10 + (idx * 2),
            Math.random() -0.5
          ]}
        >
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </RigidBody>
      ))}

      <RigidBody
        shape="box"
        type="static"
        args={[100, 1, 100]}
        position={[0, -1, 0]}
      >
        <mesh>
          <boxGeometry args={[100, 1, 100]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      </RigidBody>

      <Environment preset="city" />

      <OrbitControls />
    </>
  );
}

export default () => (
  <Canvas camera={{ position: [20, 20, 20] }}>
    <Physics>
      <App />
    </Physics>
  </Canvas>
);
