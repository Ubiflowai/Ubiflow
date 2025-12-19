'use client';

import React, { useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Group } from 'react-konva';
import useImage from 'use-image';
import DxfParser from 'dxf-parser';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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
  
  // CAD Editor State
  const [dxfEntities, setDxfEntities] = useState<any[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<number[]>([]);
  const [dxfScale, setDxfScale] = useState(1);
  const [editMode, setEditMode] = useState<'PIPE' | 'CAD'>('PIPE');
  
  const [pixelsPerMeter, setPixelsPerMeter] = useState(50);
  const [items, setItems] = useState<any[]>([]);
  
  // --- NEW: PIPE STATE with Offset ---
  // connections now store 'bendOffset' to remember where you dragged the line
  const [connections, setConnections] = useState<any[]>([]); 
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  
  const [drawPipeMode, setDrawPipeMode] = useState(false);
  const [selectedStartId, setSelectedStartId] = useState<number | null>(null);

  // --- 1. HANDLE UPLOAD ---
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
            try { await processPdf(typedarray); } catch (err) { alert("PDF Error"); }
        };
        reader.readAsArrayBuffer(file);
    }
    else if (file.type.includes('image')) {
        const url = URL.createObjectURL(file);
        setImageSrc(url);
        setDxfEntities([]); 
    } 
    else if (file.name.endsWith('.dxf')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const parser = new DxfParser();
            try {
                const dxf = parser.parseSync(event.target?.result as string);
                processDxf(dxf);
            } catch (err) { alert("DXF Parsing Error"); }
        };
        reader.readAsText(file);
    }
  };

  const processPdf = async (data: Uint8Array) => {
      const pdf = await pdfjsLib.getDocument(data).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const renderContext = { canvasContext: context, viewport: viewport };
      await page.render(renderContext as any).promise;
      setImageSrc(canvas.toDataURL());
      setDxfEntities([]);
  };

  const processDxf = (dxf: any) => {
      if (!dxf || !dxf.entities) return;
      const newEntities: any[] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      dxf.entities.forEach((entity: any, index: number) => {
          const id = Date.now() + index; 
          if (entity.type === 'LINE') {
              newEntities.push({
                  id, type: 'LINE',
                  points: [entity.vertices[0].x, -entity.vertices[0].y, entity.vertices[1].x, -entity.vertices[1].y],
                  stroke: 'black'
              });
              minX = Math.min(minX, entity.vertices[0].x, entity.vertices[1].x);
              maxX = Math.max(maxX, entity.vertices[0].x, entity.vertices[1].x);
              minY = Math.min(minY, -entity.vertices[0].y, -entity.vertices[1].y);
              maxY = Math.max(maxY, -entity.vertices[0].y, -entity.vertices[1].y);
          }
          else if (entity.type === 'LWPOLYLINE') {
              for (let i = 0; i < entity.vertices.length - 1; i++) {
                  newEntities.push({
                    id: id + i, type: 'LINE',
                    points: [entity.vertices[i].x, -entity.vertices[i].y, entity.vertices[i+1].x, -entity.vertices[i+1].y],
                    stroke: 'black'
                  });
              }
          }
      });
      const width = maxX - minX;
      setDxfScale(600 / width);
      setDxfEntities(newEntities);
      setImageSrc(null); 
  };

  // --- 2. INTERACTION HANDLERS ---
  const handleEntityClick = (id: number) => {
      if (editMode !== 'CAD') return;
      if (selectedEntityIds.includes(id)) setSelectedEntityIds(selectedEntityIds.filter(sid => sid !== id));
      else setSelectedEntityIds([...selectedEntityIds, id]);
  };

  const deleteSelectedEntities = () => {
      setDxfEntities(dxfEntities.filter(ent => !selectedEntityIds.includes(ent.id)));
      setSelectedEntityIds([]);
  };

  const addItem = (type: 'Bed' | 'Source') => {
    let label = type === 'Bed' ? (currentRoomType ? currentRoomType.split('_')[0].toUpperCase() : 'BED') : type;
    const newItem = { id: Date.now(), x: 100, y: 100, type, label, color: type === 'Source' ? '#dc2626' : '#10b981' };
    const newItems = [...items, newItem];
    setItems(newItems);
    if (type === 'Bed') onBedCountChange(newItems.filter(i => i.type !== 'Source').length);
  };

  const handleItemClick = (id: number) => {
      if (editMode !== 'PIPE' || !drawPipeMode) return;
      if (selectedStartId === null) setSelectedStartId(id);
      else if (selectedStartId !== id) {
          // Create new connection with bendOffset = 0
          setConnections([...connections, { id: Date.now(), start: selectedStartId, end: id, bendOffset: 0 }]);
          setSelectedStartId(null);
      }
  };

  const deleteSelectedPipe = () => {
      if (selectedConnectionId) {
          setConnections(connections.filter(c => c.id !== selectedConnectionId));
          setSelectedConnectionId(null);
      }
  };

  // --- 3. MATH HELPERS ---
  const getManhattanDistance = (start: any, end: any) => {
    const dist = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    return (dist / pixelsPerMeter).toFixed(2);
  };

  return (
    <div className="w-full p-6 bg-white rounded-xl border-2 border-slate-200 mt-8">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-slate-900">Editor & Pipe Sizer</h2>
        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg">
            <span className="text-xs font-bold text-slate-500">SCALE:</span>
            <input type="number" value={pixelsPerMeter} onChange={(e) => setPixelsPerMeter(Number(e.target.value))} className="w-16 p-1 text-sm font-bold border rounded"/>
            <span className="text-xs text-slate-400">px = 1m</span>
        </div>
      </div>
      
      {/* TOOLBAR */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 items-center shadow-sm">
        <div className="mr-auto flex flex-col">
            <label className="text-xs font-bold text-slate-500 mb-1">Import File</label>
            <input type="file" onChange={handleUpload} accept=".dxf,.pdf,image/*" className="text-xs text-slate-500"/>
        </div>

        <div className="flex bg-white rounded-lg border border-slate-300 overflow-hidden">
            <button onClick={() => setEditMode('PIPE')} className={`px-4 py-2 text-sm font-bold ${editMode === 'PIPE' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Pipe Mode</button>
            <button onClick={() => setEditMode('CAD')} className={`px-4 py-2 text-sm font-bold ${editMode === 'CAD' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>CAD Edit Mode</button>
        </div>

        {editMode === 'PIPE' ? (
            <>
                <button onClick={() => addItem('Source')} className="bg-red-600 text-white px-3 py-2 rounded font-bold text-sm">+ Source</button>
                <button onClick={() => addItem('Bed')} className="bg-emerald-600 text-white px-3 py-2 rounded font-bold text-sm">+ Bed</button>
                <button onClick={() => { setDrawPipeMode(!drawPipeMode); setSelectedStartId(null); }} className={`px-3 py-2 rounded font-bold text-sm border ${drawPipeMode ? 'bg-blue-100 border-blue-500 text-blue-800' : 'bg-white border-slate-300'}`}>
                    {drawPipeMode ? 'Click to Connect' : 'Draw Pipe'}
                </button>
                {selectedConnectionId && (
                     <button onClick={deleteSelectedPipe} className="bg-red-500 text-white px-3 py-2 rounded font-bold text-sm hover:bg-red-600">
                        Delete Selected Pipe
                     </button>
                )}
            </>
        ) : (
            <>
                <div className="text-xs font-bold text-orange-600 px-2">Selected: {selectedEntityIds.length}</div>
                <button onClick={deleteSelectedEntities} disabled={selectedEntityIds.length === 0} className="bg-red-500 text-white px-3 py-2 rounded font-bold text-sm disabled:opacity-50 hover:bg-red-600">Delete Selected</button>
                <button onClick={() => setDxfEntities([])} className="text-red-500 text-xs font-bold underline px-2">Clear All CAD</button>
            </>
        )}
      </div>

      {/* CANVAS */}
      <div className={`relative w-full h-[600px] bg-slate-100 rounded-xl overflow-hidden border-2 border-dashed ${editMode === 'CAD' ? 'border-orange-300' : 'border-slate-300'} shadow-inner`}>
        <Stage width={800} height={600} draggable onClick={(e) => {
             // Deselect pipe if clicking on empty space
             if (e.target === e.target.getStage()) setSelectedConnectionId(null);
        }}>
          <Layer>
            {imageSrc && <URLImage src={imageSrc} scale={0.5} />}

            {/* CAD LAYER */}
            {dxfEntities.length > 0 && (
                <Group x={100} y={500} scaleX={dxfScale} scaleY={dxfScale}>
                    {dxfEntities.map((line) => {
                        const isSelected = selectedEntityIds.includes(line.id);
                        return (
                            <Line
                                key={line.id}
                                points={line.points}
                                stroke={isSelected ? '#f97316' : 'black'} 
                                strokeWidth={isSelected ? (2 / dxfScale) : (1 / dxfScale)}
                                hitStrokeWidth={10 / dxfScale}
                                draggable={editMode === 'CAD'}
                                onClick={() => handleEntityClick(line.id)}
                            />
                        );
                    })}
                </Group>
            )}

            {/* PIPE LAYER */}
            {connections.map((conn) => {
                const start = items.find(i => i.id === conn.start);
                const end = items.find(i => i.id === conn.end);
                if (!start || !end) return null;

                const isSelected = selectedConnectionId === conn.id;
                
                // MATH: Calculate the bend position with the custom offset
                // Default midX is average of start/end. We add 'bendOffset' to shift it left/right.
                const defaultMidX = (start.x + end.x) / 2;
                const midX = defaultMidX + (conn.bendOffset || 0);
                
                const points = [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y];

                return (
                    <Group key={conn.id}>
                        {/* The Pipe Line */}
                        <Line 
                            points={points} 
                            stroke={isSelected ? '#f97316' : '#3b82f6'} // Orange if selected, Blue otherwise
                            strokeWidth={4} 
                            lineCap="round" 
                            lineJoin="round" 
                            onClick={() => setSelectedConnectionId(conn.id)}
                            onTap={() => setSelectedConnectionId(conn.id)}
                            hitStrokeWidth={15} // Make it easier to click
                        />
                        
                        {/* Text Label */}
                        <Text 
                            x={midX + 5} 
                            y={(start.y + end.y)/2} 
                            text={`${getManhattanDistance(start, end)}m`} 
                            fontSize={12} 
                            fontStyle="bold" 
                            fill={isSelected ? '#c2410c' : '#1e3a8a'}
                            padding={4} 
                            fillAfterStrokeEnabled 
                            stroke="white" 
                            strokeWidth={3}
                        />
                        <Text x={midX+5} y={(start.y+end.y)/2} text={`${getManhattanDistance(start, end)}m`} fontSize={12} fontStyle="bold" fill={isSelected ? '#c2410c' : '#1e3a8a'} padding={4}/>

                        {/* DRAG HANDLE (Only visible when selected) */}
                        {isSelected && (
                            <Circle 
                                x={midX} 
                                y={(start.y + end.y) / 2} 
                                radius={6} 
                                fill="#f97316" 
                                stroke="white" 
                                strokeWidth={2}
                                draggable
                                onDragMove={(e) => {
                                    // Calculate new offset based on drag X position
                                    // newOffset = currentMouseX - defaultCenter
                                    const newX = e.target.x();
                                    const newOffset = newX - defaultMidX;
                                    
                                    // Update State
                                    setConnections(connections.map(c => 
                                        c.id === conn.id ? { ...c, bendOffset: newOffset } : c
                                    ));
                                }}
                            />
                        )}
                    </Group>
                );
            })}

            {/* ITEMS (Beds/Sources) */}
            {items.map((item) => (
              <Group 
                key={item.id} 
                draggable={editMode === 'PIPE'}
                x={item.x} y={item.y}
                onDragEnd={(e) => {
                    setItems(items.map(i => i.id === item.id ? { ...i, x: e.target.x(), y: e.target.y() } : i));
                }}
                onClick={() => handleItemClick(item.id)}
                onDblClick={() => {
                     // Delete logic
                    const newItems = items.filter(i => i.id !== item.id);
                    setItems(newItems);
                    setConnections(connections.filter(c => c.start !== item.id && c.end !== item.id));
                    if (item.type !== 'Source') onBedCountChange(newItems.filter(i => i.type !== 'Source').length);
                }}
              >
                {selectedStartId === item.id && <Circle radius={20} stroke="#3b82f6" strokeWidth={3} dash={[4, 4]} />}
                <Circle radius={12} fill={item.color} shadowColor="black" shadowBlur={4} shadowOpacity={0.3}/>
                <Text y={16} x={-15} text={item.label} fontSize={10} fill="black" fontStyle="bold" />
              </Group>
            ))}
          </Layer>
        </Stage>
      </div>
      <p className="text-center text-xs text-slate-400 mt-2 font-mono">
          {editMode === 'CAD' ? "CAD MODE: Click lines to select. Drag to move." : "PIPE MODE: Click pipe to Select/Edit. Drag orange dot to move bend."}
      </p>
    </div>
  );
}