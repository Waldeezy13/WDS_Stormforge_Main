'use client';

import React from 'react';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { StageStorageCurve } from '@/utils/stageStorage';

interface DimensionsProps {
  width: number;
  length: number;
  depth: number;
}

/**
 * Dimensions - 3D dimension lines and labels for the pond
 */
function Dimensions({ width, length, depth }: DimensionsProps) {
  const color = '#64748b';
  const labelColor = '#94a3b8';
  const lineThickness = 0.35;
  const tickLength = 2;
  const offset = 7;
  const yBottom = -depth / 2;

  return (
    <group>
      {/* Width (X-axis) - offset just beyond front edge near pond bottom */}
      <group position={[0, yBottom, length / 2 + offset]}>
        <mesh>
          <boxGeometry args={[width, lineThickness, lineThickness]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[-width / 2, 0, 0]}>
          <boxGeometry args={[lineThickness, tickLength, lineThickness]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[width / 2, 0, 0]}>
          <boxGeometry args={[lineThickness, tickLength, lineThickness]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <Text position={[0, 2.4, 0]} fontSize={2.8} color={labelColor} anchorX="center" anchorY="bottom">
          {width} ft
        </Text>
      </group>

      {/* Length (Z-axis) - offset just beyond right edge near pond bottom */}
      <group position={[width / 2 + offset, yBottom, 0]}>
        <mesh>
          <boxGeometry args={[lineThickness, lineThickness, length]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, 0, -length / 2]}>
          <boxGeometry args={[lineThickness, tickLength, lineThickness]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, 0, length / 2]}>
          <boxGeometry args={[lineThickness, tickLength, lineThickness]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <Text position={[0, 2.4, 0]} fontSize={2.8} color={labelColor} anchorX="center" anchorY="bottom">
          {length} ft
        </Text>
      </group>

      {/* Depth (Y-axis) - aligned to back-left pond corner */}
      <group position={[-width / 2 - offset, 0, -length / 2]}>
        <mesh>
          <boxGeometry args={[lineThickness, depth, lineThickness]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, -depth / 2, 0]}>
          <boxGeometry args={[tickLength, lineThickness, lineThickness]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, depth / 2, 0]}>
          <boxGeometry args={[tickLength, lineThickness, lineThickness]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <Text position={[-2.6, 0, 0]} fontSize={2.8} color={labelColor} anchorX="center" anchorY="middle">
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
  stageStorageCurve?: StageStorageCurve | null;
}

function getEquivalentRectangle(area: number, perimeter: number): { width: number; length: number } {
  const safeArea = Math.max(0, area);
  const safePerimeter = Math.max(0, perimeter);

  if (safeArea <= 0) {
    return { width: 0.5, length: 0.5 };
  }

  if (safePerimeter <= 0) {
    const side = Math.sqrt(safeArea);
    return { width: side, length: side };
  }

  const semiPerimeter = safePerimeter / 2;
  const discriminant = semiPerimeter * semiPerimeter - 4 * safeArea;

  if (discriminant < 0) {
    const side = Math.sqrt(safeArea);
    return { width: side, length: side };
  }

  const root = Math.sqrt(discriminant);
  const length = (semiPerimeter + root) / 2;
  const width = (semiPerimeter - root) / 2;

  return {
    width: Math.max(0.5, width),
    length: Math.max(0.5, length),
  };
}

function getInterpolatedRectangleAtDepth(curve: StageStorageCurve, depthFromBottom: number): { width: number; length: number } {
  const points = curve.points;
  if (points.length === 0) {
    return { width: 1, length: 1 };
  }

  const baseElevation = points[0].elevation;
  const targetElevation = baseElevation + Math.max(0, depthFromBottom);

  if (targetElevation <= points[0].elevation) {
    return getEquivalentRectangle(points[0].area, points[0].perimeter);
  }

  if (targetElevation >= points[points.length - 1].elevation) {
    const top = points[points.length - 1];
    return getEquivalentRectangle(top.area, top.perimeter);
  }

  for (let i = 0; i < points.length - 1; i++) {
    const lower = points[i];
    const upper = points[i + 1];
    if (targetElevation >= lower.elevation && targetElevation <= upper.elevation) {
      const t = (targetElevation - lower.elevation) / (upper.elevation - lower.elevation);
      const area = lower.area + t * (upper.area - lower.area);
      const perimeter = lower.perimeter + t * (upper.perimeter - lower.perimeter);
      return getEquivalentRectangle(area, perimeter);
    }
  }

  return { width: 1, length: 1 };
}

/**
 * PondMesh - 3D visualization of the pond with water levels
 * 
 * Displays:
 * - Pond bottom/walls as a rectangular prism outline
 * - Water surface planes for each storm event at calculated depth
 * - Dimension lines and labels
 */
export function PondMesh({ width, length, depth, waterLevels, stageStorageCurve }: PondMeshProps) {
  const isCustom = !!stageStorageCurve && stageStorageCurve.points.length >= 2;

  const customSlices = React.useMemo(() => {
    if (!isCustom || !stageStorageCurve) return [];

    const points = stageStorageCurve.points;
    const baseElevation = points[0].elevation;

    return points.map((point) => {
      const dims = getEquivalentRectangle(point.area, point.perimeter);
      return {
        yFromBottom: point.elevation - baseElevation,
        width: dims.width,
        length: dims.length,
      };
    });
  }, [isCustom, stageStorageCurve]);

  return (
    <group position={[0, depth / 2, 0]}>
      {/* Pond Bottom/Walls */}
      {!isCustom && (
        <mesh position={[0, -depth/2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, length]} />
          <meshStandardMaterial color="#334155" side={2} />
        </mesh>
      )}

      {/* Custom pond shell using stage slices (area+perimeter approximation) */}
      {isCustom && customSlices.length >= 2 && (
        <group>
          {customSlices.slice(0, -1).map((slice, idx) => {
            const next = customSlices[idx + 1];
            const segmentHeight = Math.max(0.01, next.yFromBottom - slice.yFromBottom);
            const avgWidth = (slice.width + next.width) / 2;
            const avgLength = (slice.length + next.length) / 2;
            const yCenter = -depth / 2 + slice.yFromBottom + segmentHeight / 2;

            return (
              <mesh key={`segment-${idx}`} position={[0, yCenter, 0]}>
                <boxGeometry args={[avgWidth, segmentHeight, avgLength]} />
                <meshStandardMaterial color="#334155" transparent opacity={0.18} />
              </mesh>
            );
          })}

          {customSlices.map((slice, idx) => {
            const y = -depth / 2 + slice.yFromBottom;
            return (
              <lineSegments key={`slice-outline-${idx}`} position={[0, y, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(slice.width, 0.01, slice.length)]} />
                <lineBasicMaterial color="#64748b" />
              </lineSegments>
            );
          })}
        </group>
      )}
      
      {/* Water Levels */}
      {waterLevels.map((wl, idx) => (
        <group key={idx} position={[0, wl.level - depth/2, 0]}>
           <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry
              args={
                isCustom && stageStorageCurve
                  ? (() => {
                      const dims = getInterpolatedRectangleAtDepth(stageStorageCurve, wl.level);
                      return [dims.width, dims.length] as [number, number];
                    })()
                  : [width, length]
              }
            />
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
      {!isCustom && (
        <lineSegments position={[0, 0, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(width, depth, length)]} />
          <lineBasicMaterial color="#94a3b8" />
        </lineSegments>
      )}

      <Dimensions width={width} length={length} depth={depth} />
    </group>
  );
}

export default PondMesh;
