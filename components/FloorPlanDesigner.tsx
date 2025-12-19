'use client';

import React, { useState, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Group, Rect } from 'react-konva';
import useImage from 'use-image';
import DxfParser from 'dxf-parser';
import * as pdfjsLib from 'pdfjs-dist';
import jsPDF from 'jspdf';

// --- CONFIG & ASSETS ---
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ICONS
const BED_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/2317/2317981.png'; 
const SOURCE_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/9368/9368210.png';

const GAS_LAYERS = {
    O2: { label: "Oxygen (O2)", color: "#16a34a", code: "O2" },       
    MA4: { label: "Medical Air (MA4)", color: "#475569", code: "MA4" }, 
    VAC: { label: "Vacuum (VAC)", color: "#eab308", code: "VAC" }       
};

// --- NEW: AUTOMATIC OFFSET FOR PIPES ---
// This separates the pipes so they don't overlap
const LAYER_OFFSETS: Record<string, number> = {
    O2: 0,      // Center
    MA4: -25,   // Shift Left
    VAC: 25     // Shift Right
};

const ItemImage = ({ src, width, height }: { src: string, width: number, height: number }) => {
    const [image] = useImage(src, 'anonymous');
    return <KonvaImage image={image} width={width} height={height} offsetX={width/2} offsetY={height/2} />;
};

const URLImage = ({ src }: { src: string }) => {
  const [image] = useImage(src);
  return <KonvaImage image={image} />;
};

interface DesignerProps {
  currentRoomType: string;
  onBedCountChange: (n: number) => void;
}

type Drawable = 
    | { id: number, type: 'LINE', points: number[], stroke: string }
    | { id: number, type: 'RECT', x: number, y: number, width: number, height: number, stroke: string }
    | { id: number, type: 'TEXT', x: number, y: number, text: string, fill: string };

export default function FloorPlanDesigner({ currentRoomType, onBedCountChange }: DesignerProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const stageRef = useRef<any>(null);
  
  // --- VIEWPORT STATE ---
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Modes
  const [editMode, setEditMode] = useState<'PIPE' | 'CAD'>('PIPE');
  const [cadTool, setCadTool] = useState<'NONE' | 'LINE' | 'RECT' | 'TEXT'>('NONE');
  const [activeLayer, setActiveLayer] = useState<'O2' | 'MA4' | 'VAC'>('O2');

  // Data
  const [dxfEntities, setDxfEntities] = useState<any[]>([]); 
  const [drawables, setDrawables] = useState<Drawable[]>([]); 
  const [items, setItems] = useState<any[]>([]); 
  const [connections, setConnections] = useState<any[]>([]); 
  const [pixelsPerMeter, setPixelsPerMeter] = useState(50);
  const [dxfScale, setDxfScale] = useState(1);

  // Interaction
  const [selectedIds, setSelectedIds] = useState<number[]>([]); 
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null); 
  const [tempDrawable, setTempDrawable] = useState<Drawable | null>(null);
  const isDrawing = useRef(false);
  const [drawPipeMode, setDrawPipeMode] = useState(false);
  const [selectedStartId, setSelectedStartId] = useState<number | null>(null);

  // --- 1. ZOOM & PAN LOGIC ---
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: stage.getPointerPosition().x / oldScale - stage.x() / oldScale,
      y: stage.getPointerPosition().y / oldScale - stage.y() / oldScale,
    };
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);
    setStagePos({
      x: -(mousePointTo.x - stage.getPointerPosition().x / newScale) * newScale,
      y: -(mousePointTo.y - stage.getPointerPosition().y / newScale) * newScale,
    });
  };

  const zoomIn = () => setStageScale(stageScale * 1.2);
  const zoomOut = () => setStageScale(stageScale / 1.2);
  const resetView = () => { setStageScale(1); setStagePos({ x: 0, y: 0 }); };

  // --- 2. EXPORT PDF ---
  const exportToPDF = () => {
      if (!stageRef.current) return;
      const currentScale = stageRef.current.scaleX();
      const currentPos = stageRef.current.position();
      
      stageRef.current.scale({ x: 1, y: 1 });
      stageRef.current.position({ x: 0, y: 0 });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      let y = 20;

      pdf.setFontSize(22);
      pdf.setTextColor("#282828");
      pdf.text("UbiFlow Multi-Gas Report", 15, y);
      y += 10;
      pdf.setFontSize(10);
      pdf.setTextColor("#646464");
      pdf.text(`Project: ${currentRoomType.toUpperCase()}`, 15, y);
      pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - 50, y);
      y += 15;

      const dataUri = stageRef.current.toDataURL({ pixelRatio: 2 });
      stageRef.current.scale({ x: currentScale, y: currentScale });
      stageRef.current.position(currentPos);

      const imgProps = pdf.getImageProperties(dataUri);
      const imgHeight = (imgProps.height * (pageWidth - 40)) / imgProps.width;
      pdf.addImage(dataUri, 'PNG', 20, y, pageWidth - 40, imgHeight);
      y += imgHeight + 15;

      pdf.setFontSize(14);
      pdf.setTextColor("#000000");
      pdf.text("Bill of Materials", 15, y);
      y += 8;

      ['O2', 'MA4', 'VAC'].forEach((layerKey) => {
          const layerPipes = connections.filter(c => c.layer === layerKey);
          if (layerPipes.length === 0) return;
          const layerInfo = GAS_LAYERS[layerKey as keyof typeof GAS_LAYERS];
          
          pdf.setFillColor("#F0F0F0");
          pdf.rect(15, y-5, pageWidth-30, 8, 'F');
          pdf.setFontSize(11);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(layerInfo.color);
          pdf.text(`System: ${layerInfo.label}`, 20, y);
          pdf.setTextColor("#000000");
          y += 8;

          pdf.setFontSize(10);
          pdf.setFont("helvetica", "normal");
          let totalLen = 0;

          layerPipes.forEach((conn) => {
             const start = items.find(i => i.id === conn.start);
             const end = items.find(i => i.id === conn.end);
             if (start && end) {
                 const len = parseFloat(getDistance(start, end));
                 totalLen += len;
                 pdf.text(`From ${start.label} -> To ${end.label}:  ${len}m`, 25, y);
                 y += 6;
             }
          });
          pdf.setFont("helvetica", "bold");
          pdf.text(`Total ${layerInfo.code} Pipe: ${totalLen.toFixed(2)}m`, 25, y);
          y += 10;
      });
      pdf.save(`ubiflow_multigas_${Date.now()}.pdf`);
  };

  // --- 3. SAVE & LOAD ---
  const saveProject = () => {
      const projectData = { version: 2, date: new Date().toISOString(), imageSrc, dxfEntities, drawables, items, connections, pixelsPerMeter, dxfScale };
      const blob = new Blob([JSON.stringify(projectData)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `ubiflow_project_${Date.now()}.ubiflow`; 
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = JSON.parse(event.target?.result as string);
              if (data.imageSrc) setImageSrc(data.imageSrc);
              if (data.dxfEntities) setDxfEntities(data.dxfEntities);
              if (data.drawables) setDrawables(data.drawables);
              if (data.items) { setItems(data.items); onBedCountChange(data.items.filter((i: any) => i.type !== 'Source').length); }
              if (data.connections) setConnections(data.connections);
              if (data.pixelsPerMeter) setPixelsPerMeter(data.pixelsPerMeter);
              if (data.dxfScale) setDxfScale(data.dxfScale);
              alert("Project loaded!");
          } catch (err) { alert("Error loading project."); }
      };
      reader.readAsText(file);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.name.endsWith('.ubiflow') || file.type === 'application/json') { loadProject(e); return; }
    if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async (evt) => { try { await processPdf(new Uint8Array(evt.target?.result as ArrayBuffer)); } catch (e) { alert("PDF Error"); } };
        reader.readAsArrayBuffer(file);
    } else if (file.type.includes('image')) { setImageSrc(URL.createObjectURL(file)); setDxfEntities([]); }
    else if (file.name.endsWith('.dxf')) {
        const reader = new FileReader();
        reader.onload = (evt) => { try { processDxf(new DxfParser().parseSync(evt.target?.result as string)); } catch (e) { alert("DXF Error"); } };
        reader.readAsText(file);
    }
  };

  const processPdf = async (data: Uint8Array) => {
      const pdf = await pdfjsLib.getDocument(data).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      canvas.width = viewport.width; canvas.height = viewport.height;
      const renderContext = { canvasContext: ctx, viewport };
      await page.render(renderContext as any).promise;
      setImageSrc(canvas.toDataURL()); setDxfEntities([]);
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

  // --- 4. INTERACTION HANDLERS ---
  const addItem = (type: 'Bed' | 'Source') => {
    let label = type === 'Bed' ? (currentRoomType ? currentRoomType.split('_')[0].toUpperCase() : 'BED') : type;
    const iconUrl = type === 'Bed' ? BED_ICON_URL : SOURCE_ICON_URL;
    const stage = stageRef.current;
    const centerX = stage ? (-stage.x() + stage.width() / 2) / stage.scaleX() : 100;
    const centerY = stage ? (-stage.y() + stage.height() / 2) / stage.scaleY() : 100;
    
    const newItem = { id: Date.now(), x: centerX, y: centerY, type, label, iconUrl };
    const newItems = [...items, newItem]; setItems(newItems);
    if (type === 'Bed') onBedCountChange(newItems.filter(i => i.type !== 'Source').length);
  };

  const handleItemClick = (id: number) => {
      if (editMode === 'PIPE' && drawPipeMode) {
          if (selectedStartId === null) setSelectedStartId(id);
          else if (selectedStartId !== id) {
              setConnections([...connections, { 
                  id: Date.now(), 
                  start: selectedStartId, 
                  end: id, 
                  bendOffset: 0,
                  layer: activeLayer 
              }]);
              setSelectedStartId(null);
          }
      }
  };

  const handleStageMouseDown = (e: any) => {
      if (e.target === e.target.getStage()) { setSelectedConnectionId(null); if(cadTool === 'NONE') setSelectedIds([]); }
      if (isPanning) return;
      if (editMode !== 'CAD' || cadTool === 'NONE') return;
      
      isDrawing.current = true;
      const stage = e.target.getStage();
      const pos = stage.getRelativePointerPosition();
      const id = Date.now();

      if (cadTool === 'LINE') setTempDrawable({ id, type: 'LINE', points: [pos.x, pos.y, pos.x, pos.y], stroke: 'black' });
      else if (cadTool === 'RECT') setTempDrawable({ id, type: 'RECT', x: pos.x, y: pos.y, width: 0, height: 0, stroke: 'black' });
      else if (cadTool === 'TEXT') {
          const text = prompt("Enter text:");
          if (text) setDrawables([...drawables, { id, type: 'TEXT', x: pos.x, y: pos.y, text, fill: 'black' }]);
          setCadTool('NONE'); isDrawing.current = false;
      }
  };

  const handleStageMouseMove = (e: any) => {
      if (!isDrawing.current || !tempDrawable) return;
      const stage = e.target.getStage();
      const pos = stage.getRelativePointerPosition();
      if (tempDrawable.type === 'LINE') setTempDrawable({ ...tempDrawable, points: [tempDrawable.points[0], tempDrawable.points[1], pos.x, pos.y] });
      else if (tempDrawable.type === 'RECT') setTempDrawable({ ...tempDrawable, width: pos.x - tempDrawable.x, height: pos.y - tempDrawable.y });
  };

  const handleStageMouseUp = () => { isDrawing.current = false; if (tempDrawable) { setDrawables([...drawables, tempDrawable]); setTempDrawable(null); } };

  const handleSelect = (id: number) => {
      if (editMode !== 'CAD' || cadTool !== 'NONE' || isPanning) return;
      if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(sid => sid !== id));
      else setSelectedIds([...selectedIds, id]);
  };

  const deleteSelected = () => {
      setDxfEntities(dxfEntities.filter(e => !selectedIds.includes(e.id)));
      setDrawables(drawables.filter(d => !selectedIds.includes(d.id)));
      setSelectedIds([]);
  };

  const getDistance = (start: any, end: any) => { return ((Math.abs(end.x - start.x) + Math.abs(end.y - start.y)) / pixelsPerMeter).toFixed(2); };

  return (
    <div className="w-full p-6 bg-white rounded-xl border-2 border-slate-200 mt-8">
      
      {/* --- TOP TOOLBAR --- */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => {setEditMode('PIPE'); setCadTool('NONE'); setIsPanning(false)}} className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${editMode === 'PIPE' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Pipe System</button>
            <button onClick={() => {setEditMode('CAD'); setDrawPipeMode(false); setIsPanning(false)}} className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${editMode === 'CAD' ? 'bg-white shadow text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}>CAD Edit</button>
        </div>
        
        <div className="flex gap-2">
            <button onClick={exportToPDF} className="bg-red-600 text-white px-3 py-2 rounded text-sm font-bold hover:bg-red-700 shadow-sm">📄 PDF</button>
            <button onClick={saveProject} className="bg-slate-800 text-white px-3 py-2 rounded text-sm font-bold hover:bg-slate-900">💾 Save</button>
            <div className="relative overflow-hidden">
                <button className="bg-slate-200 text-slate-700 px-3 py-2 rounded text-sm font-bold hover:bg-slate-300">📂 Load</button>
                <input type="file" onChange={handleUpload} accept=".ubiflow,.json" className="absolute inset-0 opacity-0 cursor-pointer"/>
            </div>
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
            <button className="px-3 py-2 bg-white border rounded text-sm font-bold text-slate-600 hover:bg-slate-50">📄 Import Background</button>
            <input type="file" onChange={handleUpload} accept=".dxf,.pdf,image/*" className="absolute inset-0 opacity-0 cursor-pointer"/>
        </div>

        <div className="flex items-center gap-1 border-r border-slate-300 pr-4 mr-2">
            <button onClick={() => setIsPanning(!isPanning)} className={`p-2 rounded ${isPanning ? 'bg-slate-800 text-white' : 'bg-white hover:bg-slate-100 text-slate-700'}`} title="Pan Tool (Hand)">🖐</button>
            <button onClick={zoomIn} className="p-2 bg-white hover:bg-slate-100 rounded text-slate-700" title="Zoom In">➕</button>
            <button onClick={zoomOut} className="p-2 bg-white hover:bg-slate-100 rounded text-slate-700" title="Zoom Out">➖</button>
            <button onClick={resetView} className="px-2 py-1 bg-white hover:bg-slate-100 rounded text-xs font-bold text-slate-600" title="Reset View">Fit</button>
        </div>

        {editMode === 'PIPE' ? (
            <>
                <div className="flex items-center bg-white border border-slate-300 rounded px-2 py-1 mr-2">
                    <span className="text-xs font-bold text-slate-500 mr-2">LAYER:</span>
                    <select value={activeLayer} onChange={(e) => setActiveLayer(e.target.value as any)} className="text-sm font-bold outline-none cursor-pointer" style={{ color: GAS_LAYERS[activeLayer].color }}>
                        <option value="O2">Oxygen (Green)</option>
                        <option value="VAC">Vacuum (Yellow)</option>
                        <option value="MA4">Medical Air (Grey)</option>
                    </select>
                </div>

                <button onClick={() => addItem('Source')} className="flex items-center gap-2 bg-white border-2 border-red-200 text-red-700 px-3 py-2 rounded font-bold text-sm hover:bg-red-50"><img src={SOURCE_ICON_URL} width={16}/> Source</button>
                <button onClick={() => addItem('Bed')} className="flex items-center gap-2 bg-white border-2 border-emerald-200 text-emerald-700 px-3 py-2 rounded font-bold text-sm hover:bg-emerald-50"><img src={BED_ICON_URL} width={16}/> Bed</button>
                
                <button 
                    onClick={() => { setDrawPipeMode(!drawPipeMode); setSelectedStartId(null); setIsPanning(false); }} 
                    className={`px-3 py-2 rounded font-bold text-sm border-2 transition-colors ml-2`}
                    style={{ backgroundColor: drawPipeMode ? GAS_LAYERS[activeLayer].color : 'white', color: drawPipeMode ? 'white' : GAS_LAYERS[activeLayer].color, borderColor: GAS_LAYERS[activeLayer].color }}
                >
                    {drawPipeMode ? `Connecting...` : `Draw Pipe`}
                </button>

                {selectedConnectionId && (
                     <button onClick={() => { setConnections(connections.filter(c => c.id !== selectedConnectionId)); setSelectedConnectionId(null); }} className="ml-auto bg-red-500 text-white px-3 py-2 rounded font-bold text-sm hover:bg-red-600">Delete Pipe</button>
                )}
            </>
        ) : (
            <>
                <div className="flex gap-1 bg-white rounded-md border p-1">
                    <button onClick={() => {setCadTool('NONE'); setIsPanning(false);}} className={`p-2 rounded ${cadTool === 'NONE' && !isPanning ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Select">👆</button>
                    <button onClick={() => {setCadTool('LINE'); setIsPanning(false);}} className={`p-2 rounded ${cadTool === 'LINE' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Line">📏</button>
                    <button onClick={() => {setCadTool('RECT'); setIsPanning(false);}} className={`p-2 rounded ${cadTool === 'RECT' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Rect">⬜</button>
                    <button onClick={() => {setCadTool('TEXT'); setIsPanning(false);}} className={`p-2 rounded ${cadTool === 'TEXT' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Text">A̱</button>
                </div>
                <div className="h-6 w-px bg-orange-200 mx-2"></div>
                <button onClick={deleteSelected} disabled={selectedIds.length === 0} className="bg-red-500 text-white px-3 py-2 rounded font-bold text-sm disabled:opacity-50 hover:bg-red-600">Delete ({selectedIds.length})</button>
                <button onClick={() => {setDxfEntities([]); setDrawables([]);}} className="text-red-500 text-xs font-bold underline px-2 ml-auto">Clear All</button>
            </>
        )}
      </div>

      {/* --- CANVAS --- */}
      <div className={`relative w-full h-[600px] bg-slate-100 rounded-xl overflow-hidden border-2 ${editMode === 'CAD' ? 'border-orange-400' : 'border-slate-300'} shadow-inner cursor-${isPanning ? 'grab' : (cadTool !== 'NONE' ? 'crosshair' : 'default')}`}>
        <Stage 
            ref={stageRef} width={800} height={600} 
            draggable={isPanning} 
            onWheel={handleWheel} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y}
            onMouseDown={handleStageMouseDown} onMouseMove={handleStageMouseMove} onMouseUp={handleStageMouseUp}
        >
          <Layer>
            {imageSrc && <URLImage src={imageSrc} />}
            
            {/* DXF Entities */}
            <Group x={100} y={500} scaleX={dxfScale} scaleY={dxfScale}>
                {dxfEntities.map((line) => {
                    const isSelected = selectedIds.includes(line.id);
                    return ( <Line key={line.id} points={line.points} stroke={isSelected ? '#f97316' : '#94a3b8'} strokeWidth={(isSelected ? 3 : 1) / dxfScale} hitStrokeWidth={10/dxfScale} onClick={() => handleSelect(line.id)} /> );
                })}
            </Group>
            
            {/* User Drawings */}
            {drawables.map((d) => {
                const isSelected = selectedIds.includes(d.id);
                const commonProps = { key: d.id, onClick: () => handleSelect(d.id), stroke: isSelected ? '#f97316' : 'black', strokeWidth: isSelected ? 3 : 2 };
                if (d.type === 'LINE') return <Line {...commonProps} points={d.points} hitStrokeWidth={10} />;
                if (d.type === 'RECT') return <Rect {...commonProps} x={d.x} y={d.y} width={d.width} height={d.height} />;
                if (d.type === 'TEXT') return <Text {...commonProps} x={d.x} y={d.y} text={d.text} fill={isSelected ? '#f97316' : 'black'} fontSize={16} strokeWidth={0} />;
                return null;
            })}
            {tempDrawable && tempDrawable.type === 'LINE' && <Line points={tempDrawable.points} stroke="#f97316" strokeWidth={2} dash={[5,5]} />}
            {tempDrawable && tempDrawable.type === 'RECT' && <Rect x={tempDrawable.x} y={tempDrawable.y} width={tempDrawable.width} height={tempDrawable.height} stroke="#f97316" strokeWidth={2} dash={[5,5]} />}

            {/* PIPES (Side-by-Side Logic) */}
            {connections.map((conn) => {
                const start = items.find(i => i.id === conn.start); const end = items.find(i => i.id === conn.end); if (!start || !end) return null;
                const isSelected = selectedConnectionId === conn.id;
                const pipeLayer = conn.layer || 'O2'; 
                const pipeColor = GAS_LAYERS[pipeLayer as keyof typeof GAS_LAYERS].color;
                const opacity = (pipeLayer === activeLayer) ? 1 : 0.4;
                
                // --- APPLY AUTOMATIC OFFSET ---
                const defaultMidX = (start.x + end.x) / 2;
                const layerShift = LAYER_OFFSETS[pipeLayer] || 0;
                const midX = defaultMidX + (conn.bendOffset || 0) + layerShift;

                const points = [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y];
                
                return (
                    <Group key={conn.id} opacity={opacity}>
                        <Line 
                            points={points} 
                            stroke={isSelected ? '#ef4444' : pipeColor} 
                            strokeWidth={4} 
                            lineCap="round" 
                            lineJoin="round" 
                            onClick={() => setSelectedConnectionId(conn.id)} 
                            hitStrokeWidth={15} 
                        />
                        <Text x={midX+5} y={(start.y+end.y)/2} text={`${pipeLayer}: ${getDistance(start, end)}m`} fontSize={10} fontStyle="bold" fill={pipeColor} padding={4} fillAfterStrokeEnabled stroke="white" strokeWidth={3}/>
                        <Text x={midX+5} y={(start.y+end.y)/2} text={`${pipeLayer}: ${getDistance(start, end)}m`} fontSize={10} fontStyle="bold" fill={pipeColor} padding={4}/>
                        {isSelected && editMode === 'PIPE' && (
                            <Circle 
                                x={midX} 
                                y={(start.y+end.y)/2} 
                                radius={6} 
                                fill="#ef4444" 
                                stroke="white" 
                                strokeWidth={2} 
                                draggable 
                                onDragMove={(e) => { 
                                    // When dragging, we recalculate bendOffset relative to the OFFSET center
                                    const newX = e.target.x();
                                    const newBendOffset = newX - defaultMidX - layerShift;
                                    setConnections(connections.map(c => c.id === conn.id ? { ...c, bendOffset: newBendOffset } : c)); 
                                }} 
                            />
                        )}
                    </Group>
                );
            })}

            {items.map((item) => (
              <Group key={item.id} draggable={editMode === 'PIPE' && !isPanning} x={item.x} y={item.y}
                onDragEnd={(e) => setItems(items.map(i => i.id === item.id ? { ...i, x: e.target.x(), y: e.target.y() } : i))}
                onClick={() => handleItemClick(item.id)}
                onDblClick={() => {
                    const newItems = items.filter(i => i.id !== item.id); setItems(newItems);
                    setConnections(connections.filter(c => c.start !== item.id && c.end !== item.id));
                    if (item.type !== 'Source') onBedCountChange(newItems.filter(i => i.type !== 'Source').length);
                }}
              >
                {selectedStartId === item.id && <Circle radius={25} stroke={GAS_LAYERS[activeLayer].color} strokeWidth={3} dash={[4, 4]} />}
                <ItemImage src={item.iconUrl} width={40} height={40} />
                <Text y={22} x={-20} text={item.label} fontSize={11} fill="black" fontStyle="bold" align="center" width={40} />
              </Group>
            ))}
          </Layer>
        </Stage>
      </div>
      
      <div className={`mt-3 p-2 text-center text-xs font-mono rounded-b-lg border-t-2 ${editMode === 'CAD' ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
          {isPanning ? "PANNING: Drag to move." : (editMode === 'CAD' ? (cadTool === 'NONE' ? "CAD: Select/Drag items. Scroll to Zoom." : `DRAWING ${cadTool}...`) : "PIPE: Layers Auto-Offset. Scroll to Zoom.")}
      </div>
    </div>
  );
}