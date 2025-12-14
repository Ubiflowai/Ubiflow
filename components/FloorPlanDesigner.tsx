'use client';

import React, { useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text } from 'react-konva';
import useImage from 'use-image';

const URLImage = ({ src, scale }: { src: string, scale: number }) => {
  const [image] = useImage(src);
  return <KonvaImage image={image} scaleX={scale} scaleY={scale} />;
};

export default function FloorPlanDesigner() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
    }
  };

  const addBed = () => {
    setItems([...items, { id: Date.now(), x: 100, y: 100 }]);
  };

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
    <div className="w-full p-6 bg-white rounded-xl border-2 border-slate-200 mt-8">
      <h2 className="text-2xl font-black text-slate-900 mb-4">Floor Plan Visualizer</h2>
      
      {/* CONTROLS */}
      <div className="flex gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex flex-col">
            <label className="text-xs font-bold text-slate-500 uppercase mb-1">Step 1: Upload Plan</label>
            <input 
                type="file" 
                onChange={handleUpload} 
                accept="image/*"
                className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
        </div>
        
        <div className="flex flex-col justify-end">
             <button 
              onClick={addBed}
              className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 shadow-md transition-all active:scale-95"
            >
              + Add Bed Icon
            </button>
        </div>
      </div>

      {/* CANVAS AREA */}
      <div className="relative w-full h-[500px] bg-slate-100 rounded-xl overflow-hidden border-2 border-dashed border-slate-300">
        {!imageSrc && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-bold pointer-events-none">
                <p>Upload a floor plan image above to start</p>
            </div>
        )}
        
        <Stage width={800} height={500}>
          <Layer>
            {imageSrc && <URLImage src={imageSrc} scale={0.5} />}
            {items.map((item) => (
              <React.Fragment key={item.id}>
                <Circle
                  x={item.x}
                  y={item.y}
                  radius={15}
                  fill="#10b981"
                  draggable
                  onDragEnd={(e) => handleDragEnd(e, item.id)}
                />
                <Text x={item.x - 20} y={item.y + 20} text="BED" fontSize={14} fill="black" fontStyle="bold" />
              </React.Fragment>
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}