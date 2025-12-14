'use client';

import React, { useState, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Group } from 'react-konva';
import useImage from 'use-image';

// --- HELPER: Load Image ---
const URLImage = ({ src, scale }: { src: string, scale: number }) => {
  const [image] = useImage(src);
  return <KonvaImage image={image} scaleX={scale} scaleY={scale} />;
};

// Define the "Props" we expect from the parent (page.tsx)
interface DesignerProps {
  currentRoomType: string;         // The department selected in the dropdown
  onBedCountChange: (n: number) => void; // Function to update the main calculator
}

export default function FloorPlanDesigner({ currentRoomType, onBedCountChange }: DesignerProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  
  // State for Scale (Calibration)
  const [pixelsPerMeter, setPixelsPerMeter] = useState(50); // Default: 50px = 1m
  
  // State for Items (Beds/Sources) and Connections (Pipes)
  const [items, setItems] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  
  // Drawing Mode State
  const [drawMode, setDrawMode] = useState(false);
  const [selectedStartId, setSelectedStartId] = useState<number | null>(null);

  // --- EFFECT: SYNC BED COUNT ---
  // Whenever 'items' changes, we count the beds and update the parent calculator
  useEffect(() => {
    // Filter out "Source" items, only count Beds
    const bedCount = items.filter(i => i.type !== 'Source').length;
    onBedCountChange(bedCount);
  }, [items, onBedCountChange]);

  // 1. Handle Upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
    }
  };

  // 2. Add Items (With Dynamic Labels)
  const addItem = (type: 'Bed' | 'Source') => {
    // Generate a label. If it's a bed, use the room type (e.g. "ICU")
    let label: string = type;
    if (type === 'Bed') {
        // Convert "ward_single_4bed" -> "WARD" or "ICU"
        const cleanName = currentRoomType.split('_')[0].toUpperCase(); 
        label = `${cleanName}`; 
    }

    const newItem = {
      id: Date.now(),
      x: type === 'Source' ? 50 : 150,
      y: 100,
      type: type,
      label: label, 
      color: type === 'Source' ? '#dc2626' : '#10b981', // Red for Source, Green for Bed
    };
    setItems([...items, newItem]);
  };

  // 3. Handle Item Click (For connecting pipes)
  const handleItemClick = (id: number) => {
    if (!drawMode) return;

    if (selectedStartId === null) {
      // Step A: Select the starting point
      setSelectedStartId(id);
    } else {
      // Step B: Select the ending point & Create Line
      if (selectedStartId !== id) {
        const newConnection = {
          id: Date.now(),
          start: selectedStartId,
          end: id,
        };
        setConnections([...connections, newConnection]);
        setSelectedStartId(null); // Reset selection
      }
    }
  };

  // 4. Handle Double Click (Delete Item)
  const handleItemDblClick = (id: number) => {
    // Remove the item
    const newItems = items.filter(i => i.id !== id);
    setItems(newItems);
    
    // Also remove any pipes connected to this item
    setConnections(connections.filter(c => c.start !== id && c.end !== id));
  };

  // 5. Update Item Position on Drag
  const handleDragEnd = (e: any, id: number) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        return { ...item, x: e.target.x(), y: e.target.y() };
      }
      return item;
    });
    setItems(newItems);
  };

  // 6. Helper: Calculate Distance between two items
  const getDistance = (startId: number, endId: number) => {
    const start = items.find((i) => i.id === startId);
    const end = items.find((i) => i.id === endId);
    if (!start || !end) return 0;

    // Pythagorean Theorem: a^2 + b^2 = c^2
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    // Convert to meters
    return (pixelDistance / pixelsPerMeter).toFixed(2); 
  };

  return (
    <div className="w-full p-6 bg-white rounded-xl border-2 border-slate-200 mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-slate-900">Interactive Pipe Sizer</h2>
        
        {/* CALIBRATION INPUT */}
        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg">
            <span className="text-xs font-bold text-slate-500">SCALE:</span>
            <input 
                type="number" 
                value={pixelsPerMeter} 
                onChange={(e) => setPixelsPerMeter(Number(e.target.value))}
                className="w-16 p-1 text-sm font-bold border rounded"
            />
            <span className="text-xs text-slate-400">px = 1m</span>
        </div>
      </div>
      
      {/* TOOLBAR */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 items-center">
        
        {/* Upload */}
        <div className="mr-auto">
            <input 
                type="file" 
                onChange={handleUpload} 
                accept="image/*"
                className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 font-semibold"
            />
        </div>

        {/* Tools */}
        <button onClick={() => addItem('Source')} className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-red-700 text-sm">
            + Add Source
        </button>
        
        {/* Dynamic Label for Bed Button */}
        <button onClick={() => addItem('Bed')} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-emerald-700 text-sm">
            + Add {currentRoomType ? currentRoomType.split('_')[0].toUpperCase() : 'Bed'}
        </button>
        
        {/* Draw Mode Toggle */}
        <button 
            onClick={() => { setDrawMode(!drawMode); setSelectedStartId(null); }} 
            className={`px-6 py-2 rounded-lg font-bold shadow text-sm border-2 ${
                drawMode ? 'bg-blue-100 border-blue-500 text-blue-800' : 'bg-white border-slate-300 text-slate-600'
            }`}
        >
            {drawMode ? 'Click items to Connect' : 'Draw Pipe (Off)'}
        </button>
      </div>

      {/* CANVAS */}
      <div className="relative w-full h-[600px] bg-slate-100 rounded-xl overflow-hidden border-2 border-dashed border-slate-300 shadow-inner">
        {!imageSrc && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 font-bold pointer-events-none opacity-50">
                <p className="text-lg">1. Upload Plan</p>
                <p className="text-lg">2. Add Source & Beds</p>
                <p className="text-lg">3. Enable "Draw Pipe" and connect them</p>
                <p className="text-sm mt-4">(Double-click any item to delete it)</p>
            </div>
        )}
        
        <Stage width={800} height={600}>
          <Layer>
            {imageSrc && <URLImage src={imageSrc} scale={0.5} />}

            {/* DRAW PIPES (LINES) */}
            {connections.map((conn) => {
                const start = items.find(i => i.id === conn.start);
                const end = items.find(i => i.id === conn.end);
                
                if (!start || !end) return null;

                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2;
                const meters = getDistance(conn.start, conn.end);

                return (
                    <Group key={conn.id}>
                        {/* The Pipe Line */}
                        <Line
                            points={[start.x, start.y, end.x, end.y]}
                            stroke="#3b82f6" // Blue Pipe
                            strokeWidth={4}
                            lineCap="round"
                            lineJoin="round"
                        />
                        {/* Distance Label */}
                        <Text 
                            x={midX} 
                            y={midY - 10} 
                            text={`${meters}m`} 
                            fontSize={14} 
                            fontStyle="bold"
                            fill="#1e3a8a"
                            align="center"
                            shadowColor="white"
                            shadowBlur={2}
                        />
                    </Group>
                );
            })}

            {/* DRAW ITEMS (DOTS) */}
            {items.map((item) => (
              <Group 
                key={item.id} 
                draggable 
                x={item.x} 
                y={item.y}
                onDragEnd={(e) => handleDragEnd(e, item.id)}
                onClick={() => handleItemClick(item.id)}
                onDblClick={() => handleItemDblClick(item.id)} // Double click to delete
              >
                {/* Highlight ring if selected for drawing */}
                {selectedStartId === item.id && (
                    <Circle radius={20} stroke="#3b82f6" strokeWidth={3} dash={[4, 4]} />
                )}
                
                {/* The Item Dot */}
                <Circle
                  radius={12}
                  fill={item.color}
                  shadowColor="black"
                  shadowBlur={4}
                  shadowOpacity={0.3}
                />
                <Text 
                    y={16} 
                    x={-15}
                    text={item.label || item.type} 
                    fontSize={10} 
                    fill="black" 
                    fontStyle="bold" 
                />
              </Group>
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}