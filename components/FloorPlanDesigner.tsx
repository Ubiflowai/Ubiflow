'use client';

import React, { useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Group } from 'react-konva';
import useImage from 'use-image';
import DxfParser from 'dxf-parser';
import * as pdfjsLib from 'pdfjs-dist';

// IMPORTANT: Configure PDF Worker from CDN to avoid Next.js build errors
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// --- HELPER: Load Image ---
const URLImage = ({ src, scale }: { src: string, scale: number }) => {
  const [image] = useImage(src);
  return <KonvaImage image={image} scaleX={scale} scaleY={scale} />;
};

interface DesignerProps {
  currentRoomType: string;
  onBedCountChange: (n: number) => void;
}

export default function FloorPlanDesigner({ currentRoomType, onBedCountChange }: DesignerProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  
  // AutoCAD DXF State
  const [dxfLines, setDxfLines] = useState<any[]>([]); 
  const [dxfScale, setDxfScale] = useState(1);
  
  const [pixelsPerMeter, setPixelsPerMeter] = useState(50);
  const [items, setItems] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  
  const [drawMode, setDrawMode] = useState(false);
  const [selectedStartId, setSelectedStartId] = useState<number | null>(null);

  // --- 1. HANDLE UPLOAD (Image, DXF, or PDF) ---
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // A. Handle PDF
    if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
            try {
                await processPdf(typedarray);
            } catch (err) {
                console.error(err);
                alert("Error reading PDF. Please ensure it is a valid file.");
            }
        };
        reader.readAsArrayBuffer(file);
    }
    // B. Handle Standard Images
    else if (file.type.includes('image')) {
        const url = URL.createObjectURL(file);
        setImageSrc(url);
        setDxfLines([]); 
    } 
    // C. Handle AutoCAD DXF
    else if (file.name.endsWith('.dxf')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const parser = new DxfParser();
            try {
                const dxf = parser.parseSync(text);
                processDxf(dxf);
            } catch (err) {
                alert("Error parsing DXF.");
            }
        };
        reader.readAsText(file);
    }
  };

// --- 2. PROCESS PDF (Convert to Image) ---
  const processPdf = async (data: Uint8Array) => {
      // Load the PDF
      const pdf = await pdfjsLib.getDocument(data).promise;
      // Get the first page
      const page = await pdf.getPage(1);
      
      // Determine scale (high quality)
      const viewport = page.getViewport({ scale: 2.0 });
      
      // Create a hidden canvas to render the PDF
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render PDF page into the hidden canvas
      // FIX: We cast 'renderContext' to 'any' to solve the TypeScript error
      const renderContext = { canvasContext: context, viewport: viewport };
      await page.render(renderContext as any).promise;

      // Convert hidden canvas to an Image URL that Konva can read
      const imgUrl = canvas.toDataURL();
      setImageSrc(imgUrl);
      setDxfLines([]); // Clear any DXF lines
  };
  // --- 3. PROCESS DXF ---
  const processDxf = (dxf: any) => {
      if (!dxf || !dxf.entities) return;
      const lines: any[] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      dxf.entities.forEach((entity: any) => {
          if (entity.type === 'LINE') {
              lines.push({
                  points: [entity.vertices[0].x, -entity.vertices[0].y, entity.vertices[1].x, -entity.vertices[1].y]
              });
              minX = Math.min(minX, entity.vertices[0].x, entity.vertices[1].x);
              maxX = Math.max(maxX, entity.vertices[0].x, entity.vertices[1].x);
              minY = Math.min(minY, -entity.vertices[0].y, -entity.vertices[1].y);
              maxY = Math.max(maxY, -entity.vertices[0].y, -entity.vertices[1].y);
          }
          else if (entity.type === 'LWPOLYLINE') {
              for (let i = 0; i < entity.vertices.length - 1; i++) {
                  lines.push({
                    points: [entity.vertices[i].x, -entity.vertices[i].y, entity.vertices[i+1].x, -entity.vertices[i+1].y]
                  });
              }
          }
      });

      const width = maxX - minX;
      const scale = 600 / width; 
      setDxfScale(scale);
      setDxfLines(lines);
      setImageSrc(null); 
  };

  // --- 4. ADD ITEM (FIXED) ---
  const addItem = (type: 'Bed' | 'Source') => {
    let label: string = type;
    if (type === 'Bed') {
        const cleanName = currentRoomType ? currentRoomType.split('_')[0].toUpperCase() : 'BED'; 
        label = cleanName; 
    }

    const newItem = { 
        id: Date.now(), 
        x: 100, 
        y: 100, 
        type, 
        label, 
        color: type === 'Source' ? '#dc2626' : '#10b981' 
    };

    const newItems = [...items, newItem];
    setItems(newItems);

    if (type === 'Bed') {
        const count = newItems.filter(i => i.type !== 'Source').length;
        onBedCountChange(count);
    }
  };

  const handleItemClick = (id: number) => {
    if (!drawMode) return;
    if (selectedStartId === null) {
      setSelectedStartId(id);
    } else {
      if (selectedStartId !== id) {
        setConnections([...connections, { id: Date.now(), start: selectedStartId, end: id }]);
        setSelectedStartId(null);
      }
    }
  };

  // --- 5. DELETE ITEM ---
  const handleItemDblClick = (id: number) => {
    const itemToDelete = items.find(i => i.id === id);
    const newItems = items.filter(i => i.id !== id);
    setItems(newItems);
    setConnections(connections.filter(c => c.start !== id && c.end !== id));

    if (itemToDelete && itemToDelete.type !== 'Source') {
        const count = newItems.filter(i => i.type !== 'Source').length;
        onBedCountChange(count);
    }
  };

  const handleDragEnd = (e: any, id: number) => {
    setItems(items.map(i => i.id === id ? { ...i, x: e.target.x(), y: e.target.y() } : i));
  };

  // --- 6. MANHATTAN DISTANCE ---
  const getManhattanDistance = (startId: number, endId: number) => {
    const start = items.find((i) => i.id === startId);
    const end = items.find((i) => i.id === endId);
    if (!start || !end) return "0";
    const dist = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    return (dist / pixelsPerMeter).toFixed(2);
  };

  return (
    <div className="w-full p-6 bg-white rounded-xl border-2 border-slate-200 mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-slate-900">Interactive Pipe Sizer</h2>
        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg">
            <span className="text-xs font-bold text-slate-500">SCALE:</span>
            <input type="number" value={pixelsPerMeter} onChange={(e) => setPixelsPerMeter(Number(e.target.value))} className="w-16 p-1 text-sm font-bold border rounded"/>
            <span className="text-xs text-slate-400">px = 1m</span>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 items-center">
        <div className="mr-auto flex flex-col">
            <label className="text-xs font-bold text-slate-500 mb-1">Upload Plan (DXF, PDF, Image)</label>
            {/* UPDATED ACCEPT ATTRIBUTE */}
            <input 
                type="file" 
                onChange={handleUpload} 
                accept=".dxf,.pdf,image/*" 
                className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 font-semibold"
            />
        </div>

        <button onClick={() => addItem('Source')} className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-red-700 text-sm">+ Add Source</button>
        <button onClick={() => addItem('Bed')} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-emerald-700 text-sm">
            + Add {currentRoomType ? currentRoomType.split('_')[0].toUpperCase() : 'Bed'}
        </button>
        <button onClick={() => { setDrawMode(!drawMode); setSelectedStartId(null); }} className={`px-6 py-2 rounded-lg font-bold shadow text-sm border-2 ${drawMode ? 'bg-blue-100 border-blue-500 text-blue-800' : 'bg-white border-slate-300 text-slate-600'}`}>
            {drawMode ? 'Click items to Connect' : 'Draw Pipe (Off)'}
        </button>
      </div>

      <div className="relative w-full h-[600px] bg-slate-100 rounded-xl overflow-hidden border-2 border-dashed border-slate-300 shadow-inner">
        {!imageSrc && dxfLines.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 font-bold pointer-events-none opacity-50">
                <p className="text-lg">1. Upload DXF, PDF, or Image</p>
                <p className="text-lg">2. Add Source & Beds</p>
                <p className="text-sm mt-4 text-blue-500">Supported: .DXF, .PDF, .PNG, .JPG</p>
            </div>
        )}
        
        <Stage width={800} height={600} draggable>
          <Layer>
            {/* THIS IS WHERE THE CONVERTED PDF OR IMAGE SHOWS */}
            {imageSrc && <URLImage src={imageSrc} scale={0.5} />}

            {/* DXF LINES */}
            {dxfLines.length > 0 && (
                <Group x={100} y={500} scaleX={dxfScale} scaleY={dxfScale}>
                    {dxfLines.map((line, i) => (
                        <Line
                            key={i}
                            points={line.points}
                            stroke="black"
                            strokeWidth={1 / dxfScale}
                        />
                    ))}
                </Group>
            )}

            {/* ORTHOGONAL PIPES */}
            {connections.map((conn) => {
                const start = items.find(i => i.id === conn.start);
                const end = items.find(i => i.id === conn.end);
                if (!start || !end) return null;

                const midX = (start.x + end.x) / 2;
                const points = [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y];

                return (
                    <Group key={conn.id}>
                        <Line points={points} stroke="#3b82f6" strokeWidth={4} lineCap="round" lineJoin="round" shadowColor="rgba(0,0,0,0.1)" shadowBlur={2} shadowOffset={{x: 2, y: 2}}/>
                        <Text x={midX + 5} y={(start.y + end.y)/2} text={`${getManhattanDistance(conn.start, conn.end)}m`} fontSize={12} fontStyle="bold" fill="#1e3a8a" padding={4} fillAfterStrokeEnabled={true} stroke="white" strokeWidth={3}/>
                        <Text x={midX + 5} y={(start.y + end.y)/2} text={`${getManhattanDistance(conn.start, conn.end)}m`} fontSize={12} fontStyle="bold" fill="#1e3a8a" padding={4}/>
                    </Group>
                );
            })}

            {/* ITEMS */}
            {items.map((item) => (
              <Group 
                key={item.id} 
                draggable 
                x={item.x} 
                y={item.y}
                onDragEnd={(e) => handleDragEnd(e, item.id)}
                onClick={() => handleItemClick(item.id)}
                onDblClick={() => handleItemDblClick(item.id)}
              >
                {selectedStartId === item.id && <Circle radius={20} stroke="#3b82f6" strokeWidth={3} dash={[4, 4]} />}
                <Circle radius={12} fill={item.color} shadowColor="black" shadowBlur={4} shadowOpacity={0.3}/>
                <Text y={16} x={-15} text={item.label} fontSize={10} fill="black" fontStyle="bold" />
              </Group>
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}