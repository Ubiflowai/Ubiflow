'use client';

import React, { useState, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Group, Rect } from 'react-konva';
import useImage from 'use-image';
import DxfParser from 'dxf-parser';
import * as pdfjsLib from 'pdfjs-dist';

// --- CONFIG & ASSETS ---
// 1. Worker Config MUST happen after import
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Placeholder Icons
const BED_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/3054/3054889.png';
const SOURCE_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/4492/4492453.png';

// Helper to load images for items
const ItemImage = ({ src, width, height }: { src: string, width: number, height: number }) => {
    const [image] = useImage(src, 'anonymous');
    return <KonvaImage image={image} width={width} height={height} offsetX={width/2} offsetY={height/2} />;
};

const URLImage = ({ src, scale }: { src: string, scale: number }) => {
  const [image] = useImage(src);
  return <KonvaImage image={image} scaleX={scale} scaleY={scale} />;
};

interface DesignerProps {
  currentRoomType: string;
  onBedCountChange: (n: number) => void;
}

// Types for drawn objects
type Drawable = 
    | { id: number, type: 'LINE', points: number[], stroke: string }
    | { id: number, type: 'RECT', x: number, y: number, width: number, height: number, stroke: string }
    | { id: number, type: 'TEXT', x: number, y: number, text: string, fill: string };

export default function FloorPlanDesigner({ currentRoomType, onBedCountChange }: DesignerProps) {
  // --- STATE DEFINITIONS MUST BE INSIDE THE COMPONENT ---
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const stageRef = useRef<any>(null);
  
  // Modes
  const [editMode, setEditMode] = useState<'PIPE' | 'CAD'>('PIPE');
  const [cadTool, setCadTool] = useState<'NONE' | 'LINE' | 'RECT' | 'TEXT'>('NONE');

  // Data
  const [dxfEntities, setDxfEntities] = useState<any[]>([]); // Imported DXF lines
  const [drawables, setDrawables] = useState<Drawable[]>([]); // User-drawn CAD
  const [items, setItems] = useState<any[]>([]); // Smart Items (Beds/Source)
  const [connections, setConnections] = useState<any[]>([]); // Pipes

  // Selections & Editing
  const [selectedIds, setSelectedIds] = useState<number[]>([]); // For CAD items
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null); // For Pipes
  
  // Drawing Temp State
  const [tempDrawable, setTempDrawable] = useState<Drawable | null>(null);
  const isDrawing = useRef(false);

  // Pipe Drawing State
  const [drawPipeMode, setDrawPipeMode] = useState(false);
  const [selectedStartId, setSelectedStartId] = useState<number | null>(null);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(50);
  const [dxfScale, setDxfScale] = useState(1);


  // --- 1. UPLOAD HANDLERS ---
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async (evt) => { 
            try { 
                await processPdf(new Uint8Array(evt.target?.result as ArrayBuffer)); 
            } catch (e) { 
                console.error(e);
                alert("PDF Error: See console for details"); 
            } 
        };
        reader.readAsArrayBuffer(file);
    } else if (file.type.includes('image')) {
        setImageSrc(URL.createObjectURL(file)); 
        setDxfEntities([]);
    } else if (file.name.endsWith('.dxf')) {
        const reader = new FileReader();
        reader.onload = (evt) => { 
            try { 
                processDxf(new DxfParser().parseSync(evt.target?.result as string)); 
            } catch (e) { 
                alert("DXF Error"); 
            } 
        };
        reader.readAsText(file);
    }
  };

  // --- PROCESS PDF (MUST BE INSIDE COMPONENT TO ACCESS STATE) ---
  const processPdf = async (data: Uint8Array) => {
      const pdf = await pdfjsLib.getDocument(data).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d'); 
      if (!ctx) return;
      
      canvas.width = viewport.width; 
      canvas.height = viewport.height;
      
      const renderContext = { canvasContext: ctx, viewport };
      await page.render(renderContext as any).promise;
      
      setImageSrc(canvas.toDataURL()); 
      setDxfEntities([]);
  };

  const processDxf = (dxf: any) => {
      if (!dxf || !dxf.entities) return;
      const newEntities: any[] = [];
      let minX = Infinity, maxX = -Infinity;
      dxf.entities.forEach((entity: any, idx: number) => {
          const id = Date.now() + idx;
          if (entity.type === 'LINE') {
              newEntities.push({ id, type: 'LINE', points: [entity.vertices[0].x, -entity.vertices[0].y, entity.vertices[1].x, -entity.vertices[1].y] });
              minX = Math.min(minX, entity.vertices[0].x, entity.vertices[1].x); maxX = Math.max(maxX, entity.vertices[0].x, entity.vertices[1].x);
          }
      });
      setDxfScale(600 / (maxX - minX || 1));
      setDxfEntities(newEntities); setImageSrc(null);
  };

  // --- 2. ITEM HANDLERS ---
  const addItem = (type: 'Bed' | 'Source') => {
    let label = type === 'Bed' ? (currentRoomType ? currentRoomType.split('_')[0].toUpperCase() : 'BED') : type;
    const iconUrl = type === 'Bed' ? BED_ICON_URL : SOURCE_ICON_URL;
    const newItem = { id: Date.now(), x: 100, y: 100, type, label, iconUrl };
    
    const newItems = [...items, newItem];
    setItems(newItems);
    if (type === 'Bed') onBedCountChange(newItems.filter(i => i.type !== 'Source').length);
  };

  const handleItemClick = (id: number) => {
      if (editMode === 'PIPE' && drawPipeMode) {
          if (selectedStartId === null) setSelectedStartId(id);
          else if (selectedStartId !== id) {
              setConnections([...connections, { id: Date.now(), start: selectedStartId, end: id, bendOffset: 0 }]);
              setSelectedStartId(null);
          }
      }
  };

  // --- 3. DRAWING HANDLERS ---
  const handleStageMouseDown = (e: any) => {
      if (e.target === e.target.getStage()) {
          setSelectedConnectionId(null);
          if(cadTool === 'NONE') setSelectedIds([]);
      }

      if (editMode !== 'CAD' || cadTool === 'NONE') return;

      isDrawing.current = true;
      const pos = e.target.getStage().getPointerPosition();
      const id = Date.now();

      if (cadTool === 'LINE') {
          setTempDrawable({ id, type: 'LINE', points: [pos.x, pos.y, pos.x, pos.y], stroke: 'black' });
      } else if (cadTool === 'RECT') {
          setTempDrawable({ id, type: 'RECT', x: pos.x, y: pos.y, width: 0, height: 0, stroke: 'black' });
      } else if (cadTool === 'TEXT') {
          const text = prompt("Enter text:");
          if (text) {
              setDrawables([...drawables, { id, type: 'TEXT', x: pos.x, y: pos.y, text, fill: 'black' }]);
          }
          setCadTool('NONE'); 
          isDrawing.current = false;
      }
  };

  const handleStageMouseMove = (e: any) => {
      if (!isDrawing.current || !tempDrawable) return;
      const pos = e.target.getStage().getPointerPosition();

      if (tempDrawable.type === 'LINE') {
          setTempDrawable({ ...tempDrawable, points: [tempDrawable.points[0], tempDrawable.points[1], pos.x, pos.y] });
      } else if (tempDrawable.type === 'RECT') {
          setTempDrawable({ ...tempDrawable, width: pos.x - tempDrawable.x, height: pos.y - tempDrawable.y });
      }
  };

  const handleStageMouseUp = () => {
      isDrawing.current = false;
      if (tempDrawable) {
          setDrawables([...drawables, tempDrawable]);
          setTempDrawable(null);
      }
  };

  // --- 4. EDITING HANDLERS ---
  const handleSelect = (id: number) => {
      if (editMode !== 'CAD' || cadTool !== 'NONE') return;
      if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(sid => sid !== id));
      else setSelectedIds([...selectedIds, id]);
  };

  const deleteSelected = () => {
      setDxfEntities(dxfEntities.filter(e => !selectedIds.includes(e.id)));
      setDrawables(drawables.filter(d => !selectedIds.includes(d.id)));
      setSelectedIds([]);
  };

  const getDistance = (start: any, end: any) => {
    return ((Math.abs(end.x - start.x) + Math.abs(end.y - start.y)) / pixelsPerMeter).toFixed(2);
  };

  return (
    <div className="w-full p-6 bg-white rounded-xl border-2 border-slate-200 mt-8">
      
      {/* --- TOP TOOLBAR --- */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => {setEditMode('PIPE'); setCadTool('NONE')}} className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${editMode === 'PIPE' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Pipe System Mode</button>
            <button onClick={() => {setEditMode('CAD'); setDrawPipeMode(false)}} className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${editMode === 'CAD' ? 'bg-white shadow text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}>CAD Edit Mode</button>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">SCALE: 1m =</span>
            <input type="number" value={pixelsPerMeter} onChange={(e) => setPixelsPerMeter(Number(e.target.value))} className="w-12 p-1 text-sm font-bold border rounded text-center"/>
            <span className="text-xs text-slate-500">px</span>
        </div>
      </div>
      
      {/* --- SECONDARY TOOLBAR --- */}
      <div className={`flex flex-wrap gap-3 mb-4 p-3 rounded-lg border items-center ${editMode === 'PIPE' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
        
        <div className="mr-4 relative group">
            <button className="px-3 py-2 bg-white border rounded text-sm font-bold text-slate-600 hover:bg-slate-50">📁 Import Plan</button>
            <input type="file" onChange={handleUpload} accept=".dxf,.pdf,image/*" className="absolute inset-0 opacity-0 cursor-pointer"/>
        </div>

        {editMode === 'PIPE' ? (
            <>
                <button onClick={() => addItem('Source')} className="flex items-center gap-2 bg-white border-2 border-red-200 text-red-700 px-3 py-2 rounded font-bold text-sm hover:bg-red-50"><img src={SOURCE_ICON_URL} width={16}/> Add Source</button>
                <button onClick={() => addItem('Bed')} className="flex items-center gap-2 bg-white border-2 border-emerald-200 text-emerald-700 px-3 py-2 rounded font-bold text-sm hover:bg-emerald-50"><img src={BED_ICON_URL} width={16}/> Add Bed</button>
                <div className="h-6 w-px bg-blue-200 mx-2"></div>
                <button onClick={() => { setDrawPipeMode(!drawPipeMode); setSelectedStartId(null); }} className={`px-3 py-2 rounded font-bold text-sm border-2 ${drawPipeMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-blue-300 text-blue-600'}`}>
                    {drawPipeMode ? '🔴 Drawing Pipe...' : 'Draw Pipe Connection'}
                </button>
                {selectedConnectionId && (
                     <button onClick={() => { setConnections(connections.filter(c => c.id !== selectedConnectionId)); setSelectedConnectionId(null); }} className="ml-auto bg-red-500 text-white px-3 py-2 rounded font-bold text-sm hover:bg-red-600">Delete Pipe</button>
                )}
            </>
        ) : (
            <>
                <div className="flex gap-1 bg-white rounded-md border p-1">
                    <button onClick={() => setCadTool('NONE')} className={`p-2 rounded ${cadTool === 'NONE' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Select/Move">👆</button>
                    <button onClick={() => setCadTool('LINE')} className={`p-2 rounded ${cadTool === 'LINE' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Draw Line">📏</button>
                    <button onClick={() => setCadTool('RECT')} className={`p-2 rounded ${cadTool === 'RECT' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Draw Rectangle">⬜</button>
                    <button onClick={() => setCadTool('TEXT')} className={`p-2 rounded ${cadTool === 'TEXT' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Add Text">A̱</button>
                </div>
                <div className="h-6 w-px bg-orange-200 mx-2"></div>
                <button onClick={deleteSelected} disabled={selectedIds.length === 0} className="bg-red-500 text-white px-3 py-2 rounded font-bold text-sm disabled:opacity-50 hover:bg-red-600">Delete Selected ({selectedIds.length})</button>
                <button onClick={() => {setDxfEntities([]); setDrawables([]);}} className="text-red-500 text-xs font-bold underline px-2 ml-auto">Clear All CAD</button>
            </>
        )}
      </div>

      {/* --- CANVAS --- */}
      <div className={`relative w-full h-[600px] bg-slate-100 rounded-xl overflow-hidden border-2 ${editMode === 'CAD' ? 'border-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.2)]' : 'border-slate-300'} shadow-inner cursor-${cadTool !== 'NONE' ? 'crosshair' : 'default'}`}>
        <Stage 
            ref={stageRef} width={800} height={600} 
            draggable={cadTool === 'NONE'}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
        >
          <Layer>
            {imageSrc && <URLImage src={imageSrc} scale={0.5} />}

            {dxfEntities.length > 0 && (
                <Group x={100} y={500} scaleX={dxfScale} scaleY={dxfScale}>
                    {dxfEntities.map((line) => {
                        const isSelected = selectedIds.includes(line.id);
                        return ( <Line key={line.id} points={line.points} stroke={isSelected ? '#f97316' : '#94a3b8'} strokeWidth={(isSelected ? 3 : 1) / dxfScale} hitStrokeWidth={10/dxfScale} draggable={editMode === 'CAD' && cadTool === 'NONE'} onClick={() => handleSelect(line.id)} /> );
                    })}
                </Group>
            )}

            {drawables.map((d) => {
                const isSelected = selectedIds.includes(d.id);
                const commonProps = { key: d.id, draggable: editMode === 'CAD' && cadTool === 'NONE', onClick: () => handleSelect(d.id), stroke: isSelected ? '#f97316' : 'black', strokeWidth: isSelected ? 3 : 2 };
                if (d.type === 'LINE') return <Line {...commonProps} points={d.points} hitStrokeWidth={10} />;
                if (d.type === 'RECT') return <Rect {...commonProps} x={d.x} y={d.y} width={d.width} height={d.height} />;
                if (d.type === 'TEXT') return <Text {...commonProps} x={d.x} y={d.y} text={d.text} fill={isSelected ? '#f97316' : 'black'} fontSize={16} strokeWidth={0} />;
                return null;
            })}
            
            {tempDrawable && tempDrawable.type === 'LINE' && <Line points={tempDrawable.points} stroke="#f97316" strokeWidth={2} dash={[5,5]} />}
            {tempDrawable && tempDrawable.type === 'RECT' && <Rect x={tempDrawable.x} y={tempDrawable.y} width={tempDrawable.width} height={tempDrawable.height} stroke="#f97316" strokeWidth={2} dash={[5,5]} />}

            {connections.map((conn) => {
                const start = items.find(i => i.id === conn.start); const end = items.find(i => i.id === conn.end); if (!start || !end) return null;
                const isSelected = selectedConnectionId === conn.id;
                const midX = ((start.x + end.x) / 2) + (conn.bendOffset || 0);
                const points = [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y];
                return (
                    <Group key={conn.id}>
                        <Line points={points} stroke={isSelected ? '#f97316' : '#3b82f6'} strokeWidth={4} lineCap="round" lineJoin="round" onClick={() => setSelectedConnectionId(conn.id)} hitStrokeWidth={15} />
                        <Text x={midX+5} y={(start.y+end.y)/2} text={`${getDistance(start, end)}m`} fontSize={12} fontStyle="bold" fill={isSelected ? '#c2410c' : '#1e3a8a'} padding={4} fillAfterStrokeEnabled stroke="white" strokeWidth={3}/>
                        <Text x={midX+5} y={(start.y+end.y)/2} text={`${getDistance(start, end)}m`} fontSize={12} fontStyle="bold" fill={isSelected ? '#c2410c' : '#1e3a8a'} padding={4}/>
                        {isSelected && editMode === 'PIPE' && (
                            <Circle x={midX} y={(start.y+end.y)/2} radius={6} fill="#f97316" stroke="white" strokeWidth={2} draggable onDragMove={(e) => { setConnections(connections.map(c => c.id === conn.id ? { ...c, bendOffset: e.target.x() - (start.x + end.x) / 2 } : c)); }} />
                        )}
                    </Group>
                );
            })}

            {items.map((item) => (
              <Group key={item.id} draggable={editMode === 'PIPE'} x={item.x} y={item.y}
                onDragEnd={(e) => setItems(items.map(i => i.id === item.id ? { ...i, x: e.target.x(), y: e.target.y() } : i))}
                onClick={() => handleItemClick(item.id)}
                onDblClick={() => {
                    const newItems = items.filter(i => i.id !== item.id); setItems(newItems);
                    setConnections(connections.filter(c => c.start !== item.id && c.end !== item.id));
                    if (item.type !== 'Source') onBedCountChange(newItems.filter(i => i.type !== 'Source').length);
                }}
              >
                {selectedStartId === item.id && <Circle radius={25} stroke="#3b82f6" strokeWidth={3} dash={[4, 4]} />}
                <ItemImage src={item.iconUrl} width={40} height={40} />
                <Text y={22} x={-20} text={item.label} fontSize={11} fill="black" fontStyle="bold" align="center" width={40} />
              </Group>
            ))}
          </Layer>
        </Stage>
      </div>
      
      <div className={`mt-3 p-2 text-center text-xs font-mono rounded-b-lg border-t-2 ${editMode === 'CAD' ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
          {editMode === 'CAD' ? 
            (cadTool === 'NONE' ? "CAD MODE: Click lines/rects to select. Drag to move. Use toolbar to draw new items." : `DRAWING ${cadTool}... Click and drag on canvas.`) 
            : "PIPE MODE: Drag beds/sources. Click 'Draw Pipe' then click two items to connect. Click existing pipe to edit bend."}
      </div>
    </div>
  );
}