'use client';

import React from 'react';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';

interface DimensionsProps {
  width: number;
  length: number;
  depth: number;
}

/**
 * Dimensions - 3D dimension lines and labels for the pond
 */
function Dimensions({ width, length, depth }: DimensionsProps) {
  return (
    <group position={[0, depth/2, 0]}>
      {/* Length Dimension */}
      <group position={[0, -depth/2, length/2 + 10]}>
         <mesh rotation={[-Math.PI/2, 0, 0]}>
             <boxGeometry args={[width, 0.5, 0.5]} />
             <meshBasicMaterial color="#64748b" />
         </mesh>
         <Text position={[0, 2, 0]} fontSize={3} color="#94a3b8" anchorX="center" anchorY="bottom">
           {length} ft
         </Text>
      </group>

      {/* Width Dimension */}
      <group position={[width/2 + 10, -depth/2, 0]} rotation={[0, -Math.PI/2, 0]}>
         <mesh rotation={[-Math.PI/2, 0, 0]}>
             <boxGeometry args={[length, 0.5, 0.5]} />
             <meshBasicMaterial color="#64748b" />
         </mesh>
         <Text position={[0, 2, 0]} rotation={[0, Math.PI, 0]} fontSize={3} color="#94a3b8" anchorX="center" anchorY="bottom">
           {width} ft
         </Text>
      </group>

      {/* Depth Dimension */}
      <group position={[-width/2 - 10, 0, -length/2]}>
         <mesh position={[0, 0, 0]}>
             <boxGeometry args={[0.5, depth, 0.5]} />
             <meshBasicMaterial color="#64748b" />
         </mesh>
          <Text position={[-2, 0, 0]} rotation={[0, 0, Math.PI/2]} fontSize={3} color="#94a3b8" anchorX="center" anchorY="bottom">
           {depth} ft
         </Text>
      </group>
    </group>
  );
}

interface WaterLevel {
  level: number;
  color: string;
  label: string;
}

interface PondMeshProps {
  width: number;
  length: number;
  depth: number;
  waterLevels: WaterLevel[];
}

/**
 * PondMesh - 3D visualization of the pond with water levels
 * 
 * Displays:
 * - Pond bottom/walls as a rectangular prism outline
 * - Water surface planes for each storm event at calculated depth
 * - Dimension lines and labels
 */
export function PondMesh({ width, length, depth, waterLevels }: PondMeshProps) {
  return (
    <group position={[0, depth / 2, 0]}>
      {/* Pond Bottom/Walls */}
      <mesh position={[0, -depth/2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color="#334155" side={2} />
      </mesh>
      
      {/* Water Levels */}
      {waterLevels.map((wl, idx) => (
        <group key={idx} position={[0, wl.level - depth/2, 0]}>
           <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width, length]} />
            <meshStandardMaterial color={wl.color} transparent opacity={0.6} side={2} />
          </mesh>
          <Html position={[width/2 + 2, 0, 0]} center>
             <div className="px-2 py-1 rounded shadow-sm text-xs font-bold whitespace-nowrap" style={{ backgroundColor: wl.color, color: 'black' }}>
                {wl.label}
             </div>
          </Html>
        </group>
      ))}

      {/* Wireframe Outline */}
      <lineSegments position={[0, 0, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, depth, length)]} />
        <lineBasicMaterial color="#94a3b8" />
      </lineSegments>

      <Dimensions width={width} length={length} depth={depth} />
    </group>
  );
}

export default PondMesh;
