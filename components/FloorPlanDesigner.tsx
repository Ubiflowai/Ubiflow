'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Group, Rect, Transformer } from 'react-konva';
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

// Offsets for side-by-side pipes
const LAYER_OFFSETS: Record<string, number> = { O2: 0, MA4: -25, VAC: 25 };

const ItemImage = ({ src, width, height }: { src: string, width: number, height: number }) => {
    const [image] = useImage(src, 'anonymous');
    return <KonvaImage image={image} width={width} height={height} offsetX={width/2} offsetY={height/2} />;
};

const URLImage = ({ src }: { src: string }) => {
  const [image] = useImage(src);
  return <KonvaImage image={image} />;
};

// --- GRID COMPONENT ---
const GridLayer = ({ width, height, scale, visible }: { width: number, height: number, scale: number, visible: boolean }) => {
    if (!visible) return null;
    const lines = [];
    const gridSize = 50; 
    const virtualSize = 2000; 
    
    for (let i = 0; i < virtualSize / gridSize; i++) {
        lines.push(
            <Line key={`v-${i}`} points={[i * gridSize, 0, i * gridSize, virtualSize]} stroke="#e2e8f0" strokeWidth={1} />,
            <Line key={`h-${i}`} points={[0, i * gridSize, virtualSize, i * gridSize]} stroke="#e2e8f0" strokeWidth={1} />
        );
    }
    return <Group>{lines}</Group>;
};

interface DesignerProps {
  currentRoomType: string;
  onBedCountChange: (n: number) => void;
}

type Drawable = 
    | { id: number, type: 'LINE', points: number[], stroke: string }
    | { id: number, type: 'RECT', x: number, y: number, width: number, height: number, stroke: string, rotation?: number }
    | { id: number, type: 'TEXT', x: number, y: number, text: string, fill: string, rotation?: number };

export default function FloorPlanDesigner({ currentRoomType, onBedCountChange }: DesignerProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  
  // Viewport
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Tools & Modes
  const [editMode, setEditMode] = useState<'PIPE' | 'CAD'>('PIPE');
  const [cadTool, setCadTool] = useState<'NONE' | 'LINE' | 'RECT' | 'TEXT'>('NONE');
  const [activeLayer, setActiveLayer] = useState<'O2' | 'MA4' | 'VAC'>('O2');
  const [snapGrid, setSnapGrid] = useState(true);

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

  // --- 0. KEYBOARD LISTENERS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, selectedConnectionId]);

  // --- 1. TRANSFORMER LOGIC ---
  useEffect(() => {
    if (selectedIds.length === 1 && editMode === 'CAD') {
        const selectedNode = stageRef.current.findOne('#' + selectedIds[0]);
        if (selectedNode) {
            transformerRef.current.nodes([selectedNode]);
            transformerRef.current.getLayer().batchDraw();
        }
    } else {
        transformerRef.current?.nodes([]);
    }
  }, [selectedIds, editMode]);

  // --- 2. SNAP LOGIC ---
  const snapToGrid = (val: number) => {
      if (!snapGrid) return val;
      const gridSize = 50; 
      return Math.round(val / gridSize) * gridSize;
  };

  // --- 3. EXPORT PDF ---
  const exportToPDF = () => {
      if (!stageRef.current) return;
      const currentScale = stageRef.current.scaleX();
      const currentPos = stageRef.current.position();
      stageRef.current.scale({ x: 1, y: 1 });
      stageRef.current.position({ x: 0, y: 0 });
      transformerRef.current?.nodes([]); 

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      let y = 20;

      pdf.setFontSize(22); pdf.setTextColor("#282828"); pdf.text("UbiFlow Multi-Gas Report", 15, y); y += 10;
      pdf.setFontSize(10); pdf.setTextColor("#646464"); pdf.text(`Project: ${currentRoomType.toUpperCase()}`, 15, y);
      pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - 50, y); y += 15;

      const dataUri = stageRef.current.toDataURL({ pixelRatio: 2 });
      stageRef.current.scale({ x: currentScale, y: currentScale });
      stageRef.current.position(currentPos); 

      const imgProps = pdf.getImageProperties(dataUri);
      const imgHeight = (imgProps.height * (pageWidth - 40)) / imgProps.width;
      pdf.addImage(dataUri, 'PNG', 20, y, pageWidth - 40, imgHeight);
      y += imgHeight + 15;

      pdf.setFontSize(14); pdf.setTextColor("#000000"); pdf.text("Bill of Materials", 15, y); y += 8;

      ['O2', 'MA4', 'VAC'].forEach((layerKey) => {
          const layerPipes = connections.filter(c => c.layer === layerKey);
          if (layerPipes.length === 0) return;
          const layerInfo = GAS_LAYERS[layerKey as keyof typeof GAS_LAYERS];
          
          pdf.setFillColor("#F0F0F0"); pdf.rect(15, y-5, pageWidth-30, 8, 'F');
          pdf.setFontSize(11); pdf.setFont("helvetica", "bold"); pdf.setTextColor(layerInfo.color);
          pdf.text(`System: ${layerInfo.label}`, 20, y); pdf.setTextColor("#000000"); y += 8;

          pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
          let totalLen = 0;
          layerPipes.forEach((conn) => {
             const start = items.find(i => i.id === conn.start);
             const end = items.find(i => i.id === conn.end);
             if (start && end) {
                 const len = parseFloat(getDistance(start, end));
                 totalLen += len;
                 pdf.text(`From ${start.label} -> To ${end.label}:  ${len}m`, 25, y); y += 6;
             }
          });
          pdf.setFont("helvetica", "bold"); pdf.text(`Total ${layerInfo.code} Pipe: ${totalLen.toFixed(2)}m`, 25, y); y += 10;
      });
      pdf.save(`ubiflow_report.pdf`);
  };

  // --- 4. SAVE/LOAD/UPLOAD ---
  const saveProject = () => {
      const data = { version: 2, imageSrc, dxfEntities, drawables, items, connections, pixelsPerMeter, dxfScale };
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
      link.download = `ubiflow_project_${Date.now()}.ubiflow`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };
  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const data = JSON.parse(evt.target?.result as string);
              if (data.imageSrc) setImageSrc(data.imageSrc);
              if (data.dxfEntities) setDxfEntities(data.dxfEntities);
              if (data.drawables) setDrawables(data.drawables);
              if (data.items) { setItems(data.items); onBedCountChange(data.items.filter((i: any) => i.type !== 'Source').length); }
              if (data.connections) setConnections(data.connections);
              if (data.pixelsPerMeter) setPixelsPerMeter(data.pixelsPerMeter);
              if (data.dxfScale) setDxfScale(data.dxfScale);
              alert("Loaded!");
          } catch (e) { alert("Load Error"); }
      }; reader.readAsText(file);
  };
  
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.name.endsWith('.ubiflow')) { loadProject(e); return; }
      
      if (file.type.includes('image')) {
          setImageSrc(URL.createObjectURL(file));
      } else if (file.type === 'application/pdf') {
         const reader = new FileReader();
         reader.onload = async (ev) => { 
             try {
                 const pdf = await pdfjsLib.getDocument(new Uint8Array(ev.target?.result as ArrayBuffer)).promise;
                 const page = await pdf.getPage(1); 
                 const vp = page.getViewport({ scale: 2 });
                 const cvs = document.createElement('canvas'); 
                 const ctx = cvs.getContext('2d');
                 if(ctx) { 
                     cvs.width = vp.width; 
                     cvs.height = vp.height; 
                     // --- FIX APPLIED HERE: cast to 'any' ---
                     await page.render({ canvasContext: ctx, viewport: vp } as any).promise; 
                     setImageSrc(cvs.toDataURL()); 
                     setDxfEntities([]); 
                 }
             } catch(e) { alert("PDF Error"); }
         }; 
         reader.readAsArrayBuffer(file);
      } else if (file.name.endsWith('.dxf')) {
         const reader = new FileReader();
         reader.onload = (ev) => { try { processDxf(new DxfParser().parseSync(ev.target?.result as string)); } catch(e){ alert("DXF Error"); } }; reader.readAsText(file);
      }
  };

  const processDxf = (dxf: any) => {
      if(!dxf || !dxf.entities) return; const lines: any[] = []; let minX = Infinity, maxX = -Infinity;
      dxf.entities.forEach((ent: any, i: number) => {
          if(ent.type === 'LINE') { lines.push({id: Date.now()+i, type:'LINE', points:[ent.vertices[0].x, -ent.vertices[0].y, ent.vertices[1].x, -ent.vertices[1].y]}); minX=Math.min(minX, ent.vertices[0].x); maxX=Math.max(maxX, ent.vertices[0].x); }
      }); setDxfScale(600/(maxX-minX||1)); setDxfEntities(lines); setImageSrc(null);
  };

  // --- 5. ITEM & DRAWING HANDLERS ---
  const addItem = (type: 'Bed' | 'Source') => {
      const iconUrl = type === 'Bed' ? BED_ICON_URL : SOURCE_ICON_URL;
      const stage = stageRef.current;
      const centerX = stage ? (-stage.x() + stage.width() / 2) / stage.scaleX() : 100;
      const centerY = stage ? (-stage.y() + stage.height() / 2) / stage.scaleY() : 100;
      const snappedX = snapToGrid(centerX);
      const snappedY = snapToGrid(centerY);
      
      const newItem = { id: Date.now(), x: snappedX, y: snappedY, type, label: type, iconUrl };
      setItems([...items, newItem]);
      if (type === 'Bed') onBedCountChange(items.filter(i => i.type !== 'Source').length + 1);
  };

  const handleStageMouseDown = (e: any) => {
      if (e.target === e.target.getStage()) { setSelectedConnectionId(null); if(cadTool === 'NONE') setSelectedIds([]); }
      if (isPanning) return;
      if (editMode !== 'CAD' || cadTool === 'NONE') return;

      isDrawing.current = true;
      const stage = e.target.getStage();
      const transform = stage.getAbsoluteTransform().copy().invert();
      const pos = transform.point(stage.getPointerPosition());
      
      const startX = snapToGrid(pos.x);
      const startY = snapToGrid(pos.y);
      const id = Date.now();

      if (cadTool === 'LINE') setTempDrawable({ id, type: 'LINE', points: [startX, startY, startX, startY], stroke: 'black' });
      else if (cadTool === 'RECT') setTempDrawable({ id, type: 'RECT', x: startX, y: startY, width: 0, height: 0, stroke: 'black' });
      else if (cadTool === 'TEXT') {
          const text = prompt("Enter text:");
          if (text) setDrawables([...drawables, { id, type: 'TEXT', x: startX, y: startY, text, fill: 'black' }]);
          setCadTool('NONE'); isDrawing.current = false;
      }
  };

  const handleStageMouseMove = (e: any) => {
      if (!isDrawing.current || !tempDrawable) return;
      const stage = e.target.getStage();
      const transform = stage.getAbsoluteTransform().copy().invert();
      const rawPos = transform.point(stage.getPointerPosition());
      let x = snapToGrid(rawPos.x);
      let y = snapToGrid(rawPos.y);

      // ORTHO MODE (Hold Shift)
      if (e.evt.shiftKey && tempDrawable.type === 'LINE') {
          const startX = tempDrawable.points[0];
          const startY = tempDrawable.points[1];
          if (Math.abs(x - startX) > Math.abs(y - startY)) y = startY; 
          else x = startX; 
      }

      if (tempDrawable.type === 'LINE') setTempDrawable({ ...tempDrawable, points: [tempDrawable.points[0], tempDrawable.points[1], x, y] });
      else if (tempDrawable.type === 'RECT') setTempDrawable({ ...tempDrawable, width: x - tempDrawable.x, height: y - tempDrawable.y });
  };

  const handleStageMouseUp = () => { isDrawing.current = false; if (tempDrawable) { setDrawables([...drawables, tempDrawable]); setTempDrawable(null); } };

  const handleItemDragEnd = (e: any, id: number, list: string) => {
      const snappedX = snapToGrid(e.target.x());
      const snappedY = snapToGrid(e.target.y());
      e.target.x(snappedX);
      e.target.y(snappedY);

      if (list === 'ITEMS') setItems(items.map(i => i.id === id ? { ...i, x: snappedX, y: snappedY } : i));
      if (list === 'DRAWABLES') setDrawables(drawables.map(d => d.id === id ? { ...d, x: snappedX, y: snappedY } : d) as any);
  };

  const handleTransformEnd = (e: any) => {
      const node = e.target;
      const id = parseInt(node.id());
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1); node.scaleY(1);

      setDrawables(drawables.map(d => {
          if (d.id === id) {
             if (d.type === 'RECT') return { ...d, x: node.x(), y: node.y(), width: d.width * scaleX, height: d.height * scaleY, rotation: node.rotation() };
             if (d.type === 'TEXT') return { ...d, x: node.x(), y: node.y(), rotation: node.rotation() };
          }
          return d;
      }) as any);
  };

  // ZOOM
  const handleWheel = (e: any) => {
    e.evt.preventDefault(); const stage = e.target.getStage(); const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newScale = e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;
    setStageScale(newScale);
    setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  };

  // Helpers
  const handleSelect = (id: number) => { if(editMode!=='CAD' || cadTool!=='NONE' || isPanning) return; setSelectedIds([id]); };
  const deleteSelected = () => { setDrawables(drawables.filter(d => !selectedIds.includes(d.id))); setItems(items.filter(i => !selectedIds.includes(i.id))); setConnections(connections.filter(c => !selectedIds.includes(c.id))); setSelectedIds([]); setSelectedConnectionId(null); };
  const getDistance = (start: any, end: any) => ((Math.abs(end.x - start.x) + Math.abs(end.y - start.y)) / pixelsPerMeter).toFixed(2);

  return (
    <div className="w-full p-6 bg-white rounded-xl border-2 border-slate-200 mt-8">
      {/* HEADER TOOLBAR */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => {setEditMode('PIPE'); setCadTool('NONE'); setIsPanning(false)}} className={`px-4 py-2 text-sm font-bold rounded-md ${editMode === 'PIPE' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Pipe System</button>
            <button onClick={() => {setEditMode('CAD'); setDrawPipeMode(false); setIsPanning(false)}} className={`px-4 py-2 text-sm font-bold rounded-md ${editMode === 'CAD' ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}>CAD Edit</button>
        </div>
        <div className="flex gap-2">
            <button onClick={exportToPDF} className="bg-red-600 text-white px-3 py-2 rounded text-sm font-bold shadow-sm">📄 PDF</button>
            <button onClick={saveProject} className="bg-slate-800 text-white px-3 py-2 rounded text-sm font-bold">💾 Save</button>
            <div className="relative overflow-hidden">
                <button className="bg-slate-200 text-slate-700 px-3 py-2 rounded text-sm font-bold hover:bg-slate-300">📂 Load</button>
                <input type="file" onChange={handleUpload} accept=".ubiflow,.json" className="absolute inset-0 opacity-0 cursor-pointer"/>
            </div>
        </div>
      </div>
      
      {/* TOOLS TOOLBAR */}
      <div className={`flex flex-wrap gap-3 mb-4 p-3 rounded-lg border items-center ${editMode === 'PIPE' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
        <div className="mr-4 relative group"><button className="px-3 py-2 bg-white border rounded text-sm font-bold text-slate-600">📄 Import Plan</button><input type="file" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer"/></div>

        <div className="flex items-center gap-1 border-r border-slate-300 pr-4 mr-2">
            <button onClick={() => setIsPanning(!isPanning)} className={`p-2 rounded ${isPanning ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`} title="Pan">🖐</button>
            <button onClick={() => setSnapGrid(!snapGrid)} className={`p-2 rounded ${snapGrid ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-slate-700'}`} title="Snap to Grid">#</button>
        </div>

        {editMode === 'PIPE' ? (
            <>
                <div className="flex items-center bg-white border border-slate-300 rounded px-2 py-1 mr-2"><span className="text-xs font-bold text-slate-500 mr-2">LAYER:</span><select value={activeLayer} onChange={(e) => setActiveLayer(e.target.value as any)} className="text-sm font-bold outline-none" style={{ color: GAS_LAYERS[activeLayer].color }}><option value="O2">Oxygen</option><option value="VAC">Vacuum</option><option value="MA4">Medical Air</option></select></div>
                <button onClick={() => addItem('Source')} className="flex items-center gap-2 bg-white border border-slate-300 px-3 py-2 rounded font-bold text-sm text-slate-700"><img src={SOURCE_ICON_URL} width={16}/> Source</button>
                <button onClick={() => addItem('Bed')} className="flex items-center gap-2 bg-white border border-slate-300 px-3 py-2 rounded font-bold text-sm text-slate-700"><img src={BED_ICON_URL} width={16}/> Bed</button>
                <button onClick={() => { setDrawPipeMode(!drawPipeMode); setSelectedStartId(null); setIsPanning(false); }} className={`px-3 py-2 rounded font-bold text-sm border-2 ml-2`} style={{ borderColor: GAS_LAYERS[activeLayer].color, backgroundColor: drawPipeMode ? GAS_LAYERS[activeLayer].color : 'white', color: drawPipeMode ? 'white' : 'black' }}>{drawPipeMode ? 'Connecting...' : 'Draw Pipe'}</button>
            </>
        ) : (
            <>
                <div className="flex gap-1 bg-white rounded-md border p-1">
                    <button onClick={() => setCadTool('NONE')} className={`p-2 rounded ${cadTool==='NONE'?'bg-slate-200':''}`} title="Select">👆</button>
                    <button onClick={() => setCadTool('LINE')} className={`p-2 rounded ${cadTool==='LINE'?'bg-slate-200':''}`} title="Line">📏</button>
                    <button onClick={() => setCadTool('RECT')} className={`p-2 rounded ${cadTool==='RECT'?'bg-slate-200':''}`} title="Rect">⬜</button>
                    <button onClick={() => setCadTool('TEXT')} className={`p-2 rounded ${cadTool==='TEXT'?'bg-slate-200':''}`} title="Text">A̱</button>
                </div>
                <button onClick={deleteSelected} disabled={selectedIds.length===0} className="bg-red-500 text-white px-3 py-2 rounded font-bold text-sm disabled:opacity-50 ml-auto">Delete</button>
            </>
        )}
      </div>

      {/* CANVAS */}
      <div className={`relative w-full h-[600px] bg-slate-100 rounded-xl overflow-hidden border-2 ${editMode === 'CAD' ? 'border-orange-400' : 'border-slate-300'} shadow-inner cursor-${isPanning ? 'grab' : (cadTool !== 'NONE' ? 'crosshair' : 'default')}`}>
        <Stage ref={stageRef} width={800} height={600} draggable={isPanning} onWheel={handleWheel} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y} onMouseDown={handleStageMouseDown} onMouseMove={handleStageMouseMove} onMouseUp={handleStageMouseUp}>
          <Layer>
            <GridLayer width={2000} height={2000} scale={stageScale} visible={snapGrid} />
            {imageSrc && <URLImage src={imageSrc} />}
            
            {/* DXF Lines */}
            <Group x={100} y={500} scaleX={dxfScale} scaleY={dxfScale}>
                {dxfEntities.map((line) => ( <Line key={line.id} points={line.points} stroke={selectedIds.includes(line.id)?'#f97316':'#94a3b8'} strokeWidth={(selectedIds.includes(line.id)?3:1)/dxfScale} hitStrokeWidth={10/dxfScale} onClick={() => handleSelect(line.id)} /> ))}
            </Group>

            {/* Drawings */}
            {drawables.map((d) => {
                const isSel = selectedIds.includes(d.id);
                const props = { key: d.id, id: d.id.toString(), draggable: editMode==='CAD', onClick: ()=>handleSelect(d.id), stroke: isSel?'#f97316':'black', onDragEnd: (e:any)=>handleItemDragEnd(e, d.id, 'DRAWABLES'), onTransformEnd: handleTransformEnd };
                if(d.type==='LINE') return <Line {...props} points={d.points} hitStrokeWidth={10} />;
                if(d.type==='RECT') return <Rect {...props} x={d.x} y={d.y} width={d.width} height={d.height} rotation={d.rotation} />;
                if(d.type==='TEXT') return <Text {...props} x={d.x} y={d.y} text={d.text} fontSize={16} fill="black" rotation={d.rotation} />;
                return null;
            })}
            
            {/* Temp Drawing */}
            {tempDrawable?.type==='LINE' && <Line points={tempDrawable.points} stroke="#f97316" strokeWidth={2} dash={[5,5]} />}
            {tempDrawable?.type==='RECT' && <Rect x={tempDrawable.x} y={tempDrawable.y} width={tempDrawable.width} height={tempDrawable.height} stroke="#f97316" strokeWidth={2} dash={[5,5]} />}

            {/* Pipes */}
            {connections.map((conn) => {
                const start = items.find(i => i.id === conn.start); const end = items.find(i => i.id === conn.end); if (!start || !end) return null;
                const isSel = selectedConnectionId === conn.id;
                const pipeLayer = conn.layer || 'O2'; 
                const color = GAS_LAYERS[pipeLayer as keyof typeof GAS_LAYERS].color;
                const opacity = (pipeLayer === activeLayer) ? 1 : 0.3;
                const midX = ((start.x + end.x) / 2) + (conn.bendOffset || 0) + (LAYER_OFFSETS[pipeLayer] || 0);
                const points = [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y];
                
                return (
                    <Group key={conn.id} opacity={opacity}>
                        <Line points={points} stroke={isSel ? '#ef4444' : color} strokeWidth={4} lineCap="round" lineJoin="round" onClick={() => setSelectedConnectionId(conn.id)} hitStrokeWidth={15} />
                        {isSel && editMode === 'PIPE' && <Circle x={midX} y={(start.y+end.y)/2} radius={6} fill="#ef4444" stroke="white" strokeWidth={2} draggable onDragMove={(e) => { setConnections(connections.map(c => c.id === conn.id ? { ...c, bendOffset: e.target.x() - ((start.x+end.x)/2) - (LAYER_OFFSETS[pipeLayer]||0) } : c)); }} />}
                    </Group>
                );
            })}

            {/* Smart Items */}
            {items.map((item) => (
              <Group key={item.id} id={item.id.toString()} draggable={editMode==='PIPE'} x={item.x} y={item.y} onClick={() => { if(editMode==='PIPE') { if(drawPipeMode) { if(selectedStartId===null) setSelectedStartId(item.id); else if(selectedStartId!==item.id) { setConnections([...connections, {id: Date.now(), start: selectedStartId, end: item.id, bendOffset: 0, layer: activeLayer}]); setSelectedStartId(null); } } else setSelectedIds([item.id]); } }} onDragEnd={(e) => handleItemDragEnd(e, item.id, 'ITEMS')}>
                <ItemImage src={item.iconUrl} width={40} height={40} />
                <Text y={22} x={-20} text={item.label} fontSize={11} fill="black" fontStyle="bold" align="center" width={40} />
                {selectedStartId === item.id && <Circle radius={25} stroke={GAS_LAYERS[activeLayer].color} strokeWidth={3} dash={[4, 4]} />}
              </Group>
            ))}

            {/* Transformer (The Resize/Rotate Tool) */}
            <Transformer ref={transformerRef} boundBoxFunc={(oldBox, newBox) => { if (newBox.width < 5 || newBox.height < 5) return oldBox; return newBox; }} />
          </Layer>
        </Stage>
      </div>
      <div className="mt-2 text-center text-xs text-slate-400 font-mono">
          {snapGrid ? "SNAP ON (#) " : "SNAP OFF "} | Hold SHIFT to draw straight lines | Click Item to Resize/Rotate
      </div>
    </div>
  );
}