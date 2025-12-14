'use client';

import React, { useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text } from 'react-konva';
import useImage from 'use-image';

// Helper component to load and display the floor plan image
const URLImage = ({ src, scale }: { src: string, scale: number }) => {
  const [image] = useImage(src);
  return <KonvaImage image={image} scaleX={scale} scaleY={scale} />;
};

export default function FloorPlanDesigner() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]); // Stores beds
  
  // 1. Handle File Upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
    }
  };

  // 2. Add a Bed to the Plan
  const addBed = () => {
    const newBed = {
      id: Date.now(),
      x: 100,
      y: 100,
      type: 'Bed',
    };
    setItems([...items, newBed]);
  };

  // 3. Update Bed Position on Drag End
  const handleDragEnd = (e: any, id: number) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        return { ...item, x: e.target.x(), y: e.target.y() };
      }
      return item;
    });
    setItems(newItems);
  };

  return (
    <div className="flex flex-col gap-4 w-full h-[600px] bg-slate-100 p-4 border rounded-xl">
      
      {/* TOOLBAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm flex gap-4 items-center justify-between">
        <div className="flex gap-4">
            <input type="file" onChange={handleUpload} className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <button 
            onClick={addBed}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 shadow-md transition-all active:scale-95"
            >
            + Add Bed
            </button>
        </div>
        <div className="text-sm font-bold text-slate-500">
          Items: {items.length}
        </div>
      </div>

      {/* CANVAS WORKSPACE */}
      <div className="flex-1 bg-gray-200 rounded-xl overflow-hidden border-2 border-slate-300 relative shadow-inner">
        
        {!imageSrc && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 font-bold pointer-events-none">
            <p>Upload a Floor Plan to Start Designing</p>
          </div>
        )}

        <Stage width={800} height={500} className="bg-white cursor-crosshair">
          <Layer>
            {/* The Floor Plan Image */}
            {imageSrc && <URLImage src={imageSrc} scale={0.5} />}

            {/* The Draggable Items (Beds) */}
            {items.map((item) => (
              <React.Fragment key={item.id}>
                <Circle
                  x={item.x}
                  y={item.y}
                  radius={12}
                  fill="#10b981" // Emerald Green
                  stroke="white"
                  strokeWidth={2}
                  draggable
                  onDragEnd={(e) => handleDragEnd(e, item.id)}
                  shadowColor="black"
                  shadowBlur={5}
                  shadowOpacity={0.3}
                />
                <Text 
                  x={item.x - 15} 
                  y={item.y + 15} 
                  text="Bed" 
                  fontSize={10} 
                  fill="#334155"
                  fontStyle="bold"
                />
              </React.Fragment>
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}